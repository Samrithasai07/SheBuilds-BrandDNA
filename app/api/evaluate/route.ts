import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { AuthenticityEngine, averageCosineSimilarity, BrandAlignmentEngine, calibrateSemanticRelevance, EvidenceFusionEngine, OriginalityEngine, PolicyEngine, weightedCosineSimilarity } from "./scoring";

export const runtime = "nodejs";

const schema=z.object({
  content:z.string().trim().max(30_000),
  profile:z.object({name:z.string(),summary:z.string(),industry:z.string(),audience:z.string(),tone:z.array(z.string()),values:z.array(z.string()),vocabulary:z.array(z.string()),restricted:z.array(z.string())}),
  competitors:z.array(z.object({name:z.string(),url:z.string(),reason:z.string()})).max(12),
  evidenceChunks:z.array(z.string().max(1000)).max(8).optional()
});

const MAX_MEDIA_SIZE=50*1024*1024;
async function evaluationInput(request:Request){
  const type=request.headers.get("content-type")||"";
  if(!type.includes("multipart/form-data"))return schema.safeParse(await request.json());
  const form=await request.formData();
  const files=form.getAll("files").filter((entry):entry is File=>typeof entry!=="string").slice(0,6);
  let extracted="";
  for(const file of files){
    if(file.size>MAX_MEDIA_SIZE)return schema.safeParse({...Object.fromEntries(form),content:""});
    if(file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf")){
      const parser=new PDFParse({data:new Uint8Array(await file.arrayBuffer())});
      try{const parsed=await parser.getText();extracted+=`\n${parsed.text}`}finally{await parser.destroy()}
    }
  }
  try{return schema.safeParse({content:`${String(form.get("content")||"")} ${extracted}`.trim().slice(0,30_000),profile:JSON.parse(String(form.get("profile")||"{}")),competitors:JSON.parse(String(form.get("competitors")||"[]")),evidenceChunks:JSON.parse(String(form.get("evidenceChunks")||"[]"))})}catch{return schema.safeParse({})}
}

const stop=new Set(["this","that","with","from","your","have","will","into","more","than","their","they","them","about","what","when","where","which","brand"]);
function vector(text:string){const map=new Map<string,number>();for(const word of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g)||[])if(!stop.has(word))map.set(word,(map.get(word)||0)+1);return map;}
function cosine(a:string,b:string){const x=vector(a),y=vector(b);let dot=0,nx=0,ny=0;for(const value of x.values())nx+=value*value;for(const value of y.values())ny+=value*value;for(const [word,value] of x)dot+=value*(y.get(word)||0);return dot/Math.max(1,Math.sqrt(nx*ny));}
function pct(value:number){return Math.round(Math.max(0,Math.min(100,value)));}
function normalizedTokens(text:string){return (text.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(word=>word.length>1&&!stop.has(word))}
function lexicalEvidence(query:string,documents:string[]){const normalizedQuery=query.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();const queryTokens=[...new Set(normalizedTokens(query))];let coverage=0;let exact=false;let excerpt="";for(const document of documents){const normalizedDocument=document.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();const documentTokens=new Set(normalizedTokens(document));const current=queryTokens.filter(token=>documentTokens.has(token)).length/Math.max(1,queryTokens.length);if(current>coverage){coverage=current;excerpt=document.slice(0,180)}if(normalizedQuery.length>=3&&normalizedDocument.includes(normalizedQuery)){exact=true;coverage=1;excerpt=document.slice(0,180)}}return {coverage,exact,excerpt}}
function validateContentQuality(content:string){
  const words=content.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[];
  const letters=(content.match(/[a-z]/gi)||[]).length;
  const visible=content.replace(/\s/g,"").length;
  const keyboardNoise=/(?:qwerty|asdf|zxcv|hjkl|uiop|1234)/i.test(content);
  const suspicious=words.filter(word=>word.length>=4&&(!/[aeiouy]/.test(word)||/(.)\1{3,}/.test(word)));
  const vowelRatio=((content.match(/[aeiouy]/gi)||[]).length)/Math.max(1,letters);
  if(!words.length)return "Add meaningful readable content before evaluation.";
  if(letters/Math.max(1,visible)<.55)return "The input contains too few readable words to evaluate.";
  if(keyboardNoise||vowelRatio<.12||suspicious.length/words.length>.3)return "This looks like random or gibberish text. Add meaningful campaign copy to receive a score.";
  if(words.length>3&&new Set(words).size/words.length<.25)return "The input is too repetitive to evaluate reliably.";
  return null;
}

const cliches=["unlock your potential","innovative solutions","revolutionize","game changer","cutting-edge","seamless experience","elevate your","empower your","in today's fast-paced world","delve into","transform your journey","next level"];

async function competitorEvidence(competitors:{name:string;url:string;reason:string}[]){
  const apiKey=process.env.TAVILY_API_KEY;if(!apiKey)return competitors.map(item=>({...item,evidence:item.reason}));
  return Promise.all(competitors.slice(0,5).map(async item=>{try{const host=new URL(item.url).hostname;const response=await fetch("https://api.tavily.com/search",{method:"POST",signal:AbortSignal.timeout(12_000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({query:`${item.name} product messaging campaign tagline`,search_depth:"basic",max_results:4,include_answer:false,include_domains:[host]})});if(!response.ok)return {...item,evidence:item.reason};const payload=await response.json() as {results?:{title:string;content:string}[]};return {...item,evidence:[item.reason,...(payload.results||[]).map(result=>`${result.title} ${result.content}`)].join(" ").slice(0,3000)}}catch{return {...item,evidence:item.reason}}}));
}
async function semanticSearch(brandId:string,query:string,kind:"brand"|"competitor"|"ai_cliche") {try{const response=await fetch("http://127.0.0.1:8000/search",{method:"POST",signal:AbortSignal.timeout(90_000),headers:{"Content-Type":"application/json"},body:JSON.stringify({brand_id:brandId,query,kind,limit:5})});if(!response.ok)return [];const payload=await response.json() as {matches?:{score:number;source:string;text:string}[]};return payload.matches||[]}catch{return []}}
async function semanticSimilarities(query:string,documents:string[]){if(!documents.length)return [];try{const response=await fetch("http://127.0.0.1:8000/similarity",{method:"POST",signal:AbortSignal.timeout(90_000),headers:{"Content-Type":"application/json"},body:JSON.stringify({query,documents})});if(!response.ok)return [];const payload=await response.json() as {scores?:number[]};return payload.scores||[]}catch{return []}}

export async function POST(request:Request){
  try{
    const parsed=await evaluationInput(request);
    if(!parsed.success)return Response.json({error:"Add meaningful campaign content before evaluation."},{status:400});
    const {content,profile,competitors,evidenceChunks=[]}=parsed.data;
    if(!content.trim())return Response.json({error:"Add campaign copy, a script/caption for image or video, or a PDF containing readable text."},{status:400});
    const qualityError=validateContentQuality(content);
    if(qualityError)return Response.json({error:qualityError,code:"INVALID_CONTENT_QUALITY"},{status:422});
    const brandId=profile.name.toLowerCase().replace(/[^a-z0-9]+/g,"-");
    const [semanticBrand,semanticCompetitors,semanticAiPhrases]=await Promise.all([
      semanticSearch(brandId,content,"brand"),
      semanticSearch(brandId,content,"competitor"),
      semanticSearch(brandId,content,"ai_cliche"),
    ]);
    const brandReferences=evidenceChunks.length?evidenceChunks:[profile.summary,[profile.industry,profile.audience,...profile.values,...profile.vocabulary].join(" ")];
    const brandMatches=(semanticBrand.length?semanticBrand.map(hit=>({source:hit.source,excerpt:hit.text.slice(0,180),similarity:pct(hit.score*100)})):brandReferences.map((text,index)=>({source:`Brand evidence ${index+1}`,excerpt:text.slice(0,180),similarity:pct(cosine(content,text)*100)}))).sort((a,b)=>b.similarity-a.similarity).slice(0,5);
    const brandLexical=lexicalEvidence(content,brandReferences);
    const researchedCompetitors=await competitorEvidence(competitors);
    const competitorDocuments=researchedCompetitors.map(item=>item.evidence);
    const liveCompetitorScores=await semanticSimilarities(content,competitorDocuments);
    const competitorMatches=researchedCompetitors.map((item,index)=>{const lexical=lexicalEvidence(content,[item.evidence]);const semantic=liveCompetitorScores[index]??cosine(content,item.evidence);const similarity=lexical.exact?100:pct(calibrateSemanticRelevance(semantic)*100);return {...item,similarity,rawSimilarity:pct(semantic*100),evidenceExcerpt:item.evidence.slice(0,260),matchType:lexical.exact?"exact source phrase":similarity>=55?"meaningful semantic overlap":similarity>=20?"limited semantic overlap":"no meaningful overlap"}}).sort((a,b)=>b.similarity-a.similarity).slice(0,3);
    const clichéMatches=cliches.filter(phrase=>content.toLowerCase().includes(phrase));
    const contentWords=content.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[];
    const preferred=profile.vocabulary.filter(word=>content.toLowerCase().includes(word.toLowerCase()));
    const hasLegal=/\b(terms apply|conditions apply|t&c|disclaimer)\b/i.test(content);
    const policyApplicable=profile.restricted.length>0;
    const brandAlignment=new BrandAlignmentEngine().evaluate(semanticBrand.map(hit=>hit.score));
    const originality=new OriginalityEngine().evaluate(liveCompetitorScores);
    const authenticity=new AuthenticityEngine().evaluate(semanticAiPhrases.map(hit=>hit.score));
    const policyResult=new PolicyEngine().evaluate(content,profile.restricted);
    const policy=policyResult.score;
    const forbidden=policyResult.forbidden;
    const scoreSet={brandAlignment,originality,authenticity,policy};
    const weights=EvidenceFusionEngine.weights;
    const total=new EvidenceFusionEngine().evaluate(scoreSet);
    console.info("[BrandDNA scoring audit]",JSON.stringify({
      embedding:{model:"BAAI/bge-small-en-v1.5",dimension:384},
      query:{characters:content.length,brandId},
      retrieval:{
        brand:semanticBrand.map((hit,index)=>({id:hit.source||`brand-neighbour-${index+1}`,rawCosine:hit.score})),
        competitors:semanticCompetitors.map((hit,index)=>({id:hit.source||`competitor-neighbour-${index+1}`,rawCosine:hit.score})),
        aiPhrases:semanticAiPhrases.map((hit,index)=>({id:hit.source||`ai-neighbour-${index+1}`,rawCosine:hit.score})),
      },
      cosine:{brandAverage:averageCosineSimilarity(semanticBrand.map(hit=>hit.score)),brandRankWeighted:weightedCosineSimilarity(semanticBrand.map(hit=>hit.score))},
      normalizedScores:scoreSet,
      fusion:{weights:EvidenceFusionEngine.weights,alignmentEligibility:brandAlignment/100,final:total},
    }));
    const rivalSimilarity=competitorMatches[0]?.similarity||0;
    const uniqueWords=new Set(contentWords).size;
    const evidenceCoverage=Math.min(1,(brandMatches.length+competitorMatches.length)/8);
    const evidenceConfidence=pct(20+Math.min(45,uniqueWords*3)+evidenceCoverage*35);
    const confidenceScore=Math.min(evidenceConfidence,pct(20+brandAlignment*.8));
    const confidence={score:confidenceScore,level:confidenceScore>=80?"High":confidenceScore>=55?"Moderate":"Limited",basis:`${uniqueWords} unique content terms; ${brandMatches.length} brand and ${competitorMatches.length} competitor evidence matches; calibrated brand relevance ${brandAlignment}%.`};
    const strengths:string[]=[];const weaknesses:string[]=[];const improvements:string[]=[];
    if(brandAlignment>=65)strengths.push("The copy has strong semantic alignment with retrieved brand evidence.");else{weaknesses.push("The copy has limited semantic overlap with approved brand evidence.");improvements.push(`Use more brand-specific language such as ${profile.vocabulary.slice(0,3).join(", ")}.`)}
    if(originality>=70)strengths.push("Competitor evidence has limited semantic overlap with this copy.");else{weaknesses.push(`Closest overlap is ${competitorMatches[0]?.name||"a competitor"} at ${rivalSimilarity}%.`);improvements.push("Replace shared category claims with a concrete proprietary benefit or proof point.")}
    if(clichéMatches.length){weaknesses.push(`Generic phrases detected: ${clichéMatches.join(", ")}.`);improvements.push("Replace generic motivational language with a specific action, product feature, or customer outcome.")}else strengths.push("No exact matches to the explainable AI-cliché library.");
    if(forbidden.length){weaknesses.push(`Restricted terms used: ${forbidden.join(", ")}.`);improvements.push(`Remove or rewrite: ${forbidden.join(", ")}.`)}
    return Response.json({total,weights,confidence,scores:scoreSet,brand_alignment:brandAlignment,originality,authenticity,policy,brand_distinctiveness:total,evidence:{brandMatchType:brandLexical.exact?"exact source phrase":brandLexical.coverage>=.6?"strong wording overlap":"semantic overlap",brandLexicalCoverage:pct(brandLexical.coverage*100),brandMatches,competitorMatches,clicheMatches:clichéMatches,policy:{applicable:policyApplicable,forbidden,preferred,legalTextDetected:hasLegal}},insight:{strengths,weaknesses,improvements},method:"The submitted idea is embedded once and compared with current competitor messaging using the same BGE model. Raw cosine values are calibrated to remove the unrelated-text baseline; Originality is the inverse of calibrated competitor overlap. Brand alignment remains a separate eligibility check, while explanations never modify scores."});
  }catch(error){console.error("[BrandDNA evaluation error]",error);return Response.json({error:"The content could not be evaluated."},{status:400})}
}
