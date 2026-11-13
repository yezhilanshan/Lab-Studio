import {env} from 'cloudflare:workers';
import {validateScene} from '../../../lib/mindmap-scene';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'无效来源'},{status:403});
 try{if(!env.BUCKET)return Response.json({error:'画布存储未连接'},{status:503});const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>20*1024*1024)return Response.json({error:'画布超过20MB，请导出备份并减少图片后重试'},{status:413});const scene=JSON.parse(raw);const error=validateScene(scene);if(error)return Response.json({error},{status:400});const key='mindmaps/'+crypto.randomUUID()+'.json';await env.BUCKET.put(key,raw,{httpMetadata:{contentType:'application/json'}});return Response.json({key});}catch{return Response.json({error:'画布保存失败，请重试或先导出备份'},{status:500})}
}
export async function GET(req:Request){
 const key=new URL(req.url).searchParams.get('key')||'';if(!/^mindmaps\/[a-f0-9-]+\.json$/.test(key))return Response.json({error:'无效画布地址'},{status:400});
 try{const object=await env.BUCKET?.get(key);if(!object)return Response.json({error:'画布未找到'},{status:404});return new Response(object.body,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}catch{return Response.json({error:'画布读取失败'},{status:503})}
}
