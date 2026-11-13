import {env} from 'cloudflare:workers';
import {getDb} from '../../../db';
import {records} from '../../../db/schema';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'无效来源'},{status:403});
 try{
 const form=await req.formData();const file=form.get('file');
 if(!(file instanceof File)||file.size>15*1024*1024||!file.size)return Response.json({error:'请选择不超过15MB的文档'},{status:400});
 if(!/\.(pdf|docx|md|txt)$/i.test(file.name))return Response.json({error:'支持PDF、DOCX、Markdown和TXT'},{status:400});
 if(!env.BUCKET)return Response.json({error:'文档存储尚未连接，请稍后重试'},{status:503});
 const id=crypto.randomUUID(),key='papers/'+id;
 await env.BUCKET.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type||'application/octet-stream'}});
 const item={id,kind:'document',title:file.name,key,size:String(file.size),date:new Date().toISOString()};
 try{await getDb().insert(records).values({id,kind:'document',data:JSON.stringify(item),updated:item.date})}catch{await env.BUCKET.delete(key);throw Error()}
 return Response.json(item);
 }catch{return Response.json({error:'文档保存失败，请重试'},{status:500})}
}
