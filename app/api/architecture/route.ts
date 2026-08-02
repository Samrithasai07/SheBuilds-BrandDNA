export async function GET(){
  try{const response=await fetch(process.env.AI_PIPELINE_URL||"http://127.0.0.1:8000/health",{signal:AbortSignal.timeout(3000),cache:"no-store"});if(!response.ok)throw new Error();return Response.json(await response.json())}
  catch{return Response.json({status:"offline",services:{fastapi:{active:false},qdrant:{active:false},text_embeddings:{active:false},pymupdf:{active:false},postgresql:{active:false},firecrawl:{active:false},claude:{active:false},siglip:{active:false},yolo:{active:false}}})}
}
