import os
import uuid
from pathlib import Path
from typing import Literal

import fitz
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastembed import TextEmbedding
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient, models

ROOT = Path(__file__).parent
DATA = ROOT / "data" / "qdrant"
DATA.mkdir(parents=True, exist_ok=True)
COLLECTION = "branddna_text"
MODEL_NAME = "BAAI/bge-small-en-v1.5"
VECTOR_SIZE = 384

app = FastAPI(title="BrandDNA AI Pipeline", version="0.3.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3033", "http://localhost:3034"], allow_methods=["*"], allow_headers=["*"])
qdrant = QdrantClient(path=str(DATA))
embedder: TextEmbedding | None = None


def get_embedder() -> TextEmbedding:
    global embedder
    if embedder is None:
        embedder = TextEmbedding(model_name=MODEL_NAME)
    return embedder


def ensure_collection() -> None:
    if not qdrant.collection_exists(COLLECTION):
        qdrant.create_collection(COLLECTION, vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE))


def chunks(text: str, size: int = 700) -> list[str]:
    words = text.split()
    return [" ".join(words[i:i + size]) for i in range(0, len(words), size) if words[i:i + size]]


class IndexRequest(BaseModel):
    brand_id: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=500)
    kind: Literal["brand", "competitor", "policy", "ai_cliche"]
    texts: list[str] = Field(min_length=1, max_length=100)


class SearchRequest(BaseModel):
    brand_id: str
    query: str = Field(min_length=3, max_length=30000)
    kind: Literal["brand", "competitor", "policy", "ai_cliche"] | None = None
    limit: int = Field(default=5, ge=1, le=20)


class SimilarityRequest(BaseModel):
    query: str = Field(min_length=1, max_length=30000)
    documents: list[str] = Field(min_length=1, max_length=20)


@app.on_event("startup")
def startup() -> None:
    ensure_collection()


@app.get("/health")
def health() -> dict:
    ensure_collection()
    return {
        "status": "ok",
        "services": {
            "fastapi": {"active": True, "version": app.version},
            "qdrant": {"active": True, "mode": "embedded", "collection": COLLECTION},
            "text_embeddings": {"active": True, "model": MODEL_NAME, "dimensions": VECTOR_SIZE},
            "pymupdf": {"active": True},
            "postgresql": {"active": bool(os.getenv("DATABASE_URL"))},
            "firecrawl": {"active": bool(os.getenv("FIRECRAWL_API_KEY"))},
            "claude": {"active": bool(os.getenv("ANTHROPIC_API_KEY"))},
            "siglip": {"active": False},
            "yolo": {"active": False},
        },
    }


@app.post("/index")
def index(request: IndexRequest) -> dict:
    ensure_collection()
    clean = [part for text in request.texts for part in chunks(text) if part.strip()]
    qdrant.delete(
        COLLECTION,
        points_selector=models.FilterSelector(filter=models.Filter(must=[
            models.FieldCondition(key="brand_id", match=models.MatchValue(value=request.brand_id)),
            models.FieldCondition(key="source", match=models.MatchValue(value=request.source)),
            models.FieldCondition(key="kind", match=models.MatchValue(value=request.kind)),
        ])),
        wait=True,
    )
    vectors = list(get_embedder().embed(clean))
    points = [models.PointStruct(id=str(uuid.uuid4()), vector=vector.tolist(), payload={"brand_id": request.brand_id, "source": request.source, "kind": request.kind, "text": text}) for text, vector in zip(clean, vectors)]
    qdrant.upsert(COLLECTION, points=points, wait=True)
    return {"indexed": len(points), "model": MODEL_NAME, "collection": COLLECTION}


@app.post("/index-pdf")
async def index_pdf(brand_id: str = Form(...), kind: Literal["brand", "competitor", "policy"] = Form("brand"), file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "PDF exceeds 10 MB")
    try:
        document = fitz.open(stream=data, filetype="pdf")
        text = "\n".join(page.get_text() for page in document)
    except Exception as exc:
        raise HTTPException(400, "Invalid PDF") from exc
    return index(IndexRequest(brand_id=brand_id, source=file.filename or "upload.pdf", kind=kind, texts=[text]))


@app.post("/search")
def search(request: SearchRequest) -> dict:
    ensure_collection()
    query_vector = list(get_embedder().query_embed(request.query))[0].tolist()
    conditions = [models.FieldCondition(key="brand_id", match=models.MatchValue(value=request.brand_id))]
    if request.kind:
        conditions.append(models.FieldCondition(key="kind", match=models.MatchValue(value=request.kind)))
    hits = qdrant.query_points(COLLECTION, query=query_vector, query_filter=models.Filter(must=conditions), limit=request.limit, with_payload=True).points
    return {"matches": [{"score": round(float(hit.score), 4), **(hit.payload or {})} for hit in hits], "model": MODEL_NAME}


@app.post("/similarity")
def similarity(request: SimilarityRequest) -> dict:
    query = list(get_embedder().query_embed(request.query))[0]
    documents = list(get_embedder().embed(request.documents))
    scores = [float(query @ document) / max(1e-9, float((query @ query) ** .5 * (document @ document) ** .5)) for document in documents]
    return {"scores": [round(score, 4) for score in scores], "model": MODEL_NAME}
