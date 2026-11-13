import {env} from 'cloudflare:workers';
import {getDb} from '../../../../db';
import {records} from '../../../../db/schema';
import {eq} from 'drizzle-orm';
import {isOwnerRequest} from '../../../../lib/api-auth';
export const dynamic='force-dynamic';
function paperKey(value:unknown){
 if(typeof value!=='string')return '';
 const key=value.normalize('NFC');
 return /^papers\/[A-Za-z0-9._-]+$/.test(key)&&!key.includes('..')?key:'';
}
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!isOwnerRequest(req))return new Response('未授权访问',{status:401});
 const {id}=await params;
 try{const rows=await getDb().select().from(records).where(eq(records.id,id));const d=rows[0]&&JSON.parse(rows[0].data);
 if(!d||d.kind!=='document'||d.deleted)return new Response('文档不存在',{status:404});
 const key=paperKey(d.key);if(!key)return new Response('文档不存在',{status:404});
 const obj=await env.BUCKET?.get(key);if(!obj)return new Response('文档暂不可用',{status:404});
 return new Response(obj.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(d.title),'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
 }catch{return new Response('读取失败',{status:503})}
}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){
 if(!isOwnerRequest(req))return new Response('未授权访问',{status:401});
 const {id}=await params;
 try{
  const db=getDb();const rows=await db.select().from(records).where(eq(records.id,id));
  const d=rows[0]&&JSON.parse(rows[0].data);
  if(!d||d.kind!=='document')return new Response('文档不存在',{status:404});
  // Retire the record first: a storage failure must never leave a card pointing at a gone object.
  const updated=new Date().toISOString(),data=JSON.stringify({...d,deleted:true});
  await db.insert(records).values({id,kind:'document',data,updated}).onConflictDoUpdate({target:records.id,set:{data,updated}});
  const key=paperKey(d.key);
  if(key)await env.BUCKET?.delete(key);
  return Response.json({ok:true});
 }catch{return new Response('删除失败',{status:503})}
}
