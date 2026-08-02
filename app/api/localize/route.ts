import { z } from "zod";

export const runtime="nodejs";

const schema=z.object({
  language:z.enum(["hi","ta"]),
  profile:z.object({name:z.string(),industry:z.string(),audience:z.string(),tone:z.array(z.string()),values:z.array(z.string()),vocabulary:z.array(z.string()),restricted:z.array(z.string()),summary:z.string()}),
  competitors:z.array(z.object({name:z.string(),url:z.string(),score:z.number(),reason:z.string()})).max(12),
});

export async function POST(request:Request){
  try{
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return Response.json({error:"Invalid localization request."},{status:400});
    const apiKey=process.env.TAVILY_API_KEY;
    if(!apiKey)return Response.json({error:"Translation service is not configured."},{status:503});
    const target=parsed.data.language==="ta"?"fluent, natural native Tamil script":"fluent, natural native Hindi in Devanagari";
    const source={profile:parsed.data.profile,competitors:parsed.data.competitors.map(({name,reason})=>({name,reason}))};
    const response=await fetch("https://api.tavily.com/search",{method:"POST",signal:AbortSignal.timeout(30_000),headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({query:`Translate all descriptive JSON string values into ${target}. Never transliterate English sentences. Preserve brand names, product names, URLs, numbers and JSON keys exactly. Return JSON only with the identical structure. Source: ${JSON.stringify(source)}`,search_depth:"advanced",max_results:3,include_answer:"advanced"})});
    if(!response.ok)throw new Error("Localization service failed.");
    const payload=await response.json() as {answer?:string};
    const clean=(payload.answer||"").replace(/```(?:json)?/gi,"").replace(/```/g,"");
    const start=clean.indexOf("{");const end=clean.lastIndexOf("}");
    if(start<0||end<=start)throw new Error("Localization response was invalid.");
    const localized=JSON.parse(clean.slice(start,end+1)) as {profile?:unknown;competitors?:{name?:string;reason?:string}[]};
    const profile=schema.shape.profile.safeParse(localized.profile);
    if(!profile.success)throw new Error("Localized profile was incomplete.");
    const reasons=new Map((localized.competitors||[]).map(item=>[item.name,item.reason]));
    return Response.json({profile:{...profile.data,name:parsed.data.profile.name,restricted:parsed.data.profile.restricted},competitors:parsed.data.competitors.map(item=>({...item,reason:reasons.get(item.name)||item.reason}))});
  }catch(error){console.error("BrandDNA localization failed",error);return Response.json({error:"The saved brand data could not be localized."},{status:400})}
}
