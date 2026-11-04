import "server-only";
import {z} from "zod";
import {database} from "./db";
import {body,HttpError,json} from "./http";
import {testCatalog,testImage,decryptTestCredential} from "../shared/test-accounts.mjs";
import {populationCatalog,profilePhoto} from "../shared/folder-population.mjs";

function enabled(){return process.env.TEST_USERS_ENABLED==='true'||process.env.NODE_ENV!=='production';}
function csv(value:unknown){return `"${String(value??'').replaceAll('"','""')}"`;}
export async function testAccounts(request:Request,actorId:string){
 const db=database(),params=new URL(request.url).searchParams;
 if(request.method==='GET'){
  if(params.get('catalog')==='csv'){
   const catalog=await populationCatalog(),lines=[['identificador','nombre_ficticio','edad_ficticia','genero','ciudad_ficticia','archivos_disponibles'].map(csv).join(',')];
   for(const person of catalog)lines.push([person.key,person.name,person.age,person.gender,person.location,person.ready?'sí':'pendiente'].map(csv).join(','));
   return new Response('\uFEFF'+lines.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="personas-prueba-500.csv"','Cache-Control':'no-store'}});
  }
  if(params.has('image')){const key=z.string().regex(/^person(?:a)?-\d{4}$/).parse(params.get('image'));try{const data=key.startsWith('persona-')?await profilePhoto((await populationCatalog()).find((person)=>person.key===key&&person.ready)!):await testImage(key);return new Response(new Uint8Array(data),{headers:{'Content-Type':'image/webp','Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'}});}catch{throw new HttpError(404,'Imagen todavía no disponible.');}}
  const catalog=await populationCatalog(),available=catalog.filter((item)=>item.ready);
  const members=(await db.query('SELECT t.population_key,p.avatar_id FROM test_accounts t JOIN profiles p ON p.user_id=t.user_id WHERE t.population_key IS NOT NULL')).rows;
  const indexed=new Map(members.map((member)=>[member.population_key,member]));
  const processing=(await db.query("SELECT count(*)::int AS pending FROM test_import_assets a JOIN media_assets m ON m.id=a.media_id WHERE m.status IN ('queued','processing')")).rows[0].pending;
  return json({enabled:enabled(),folder:'test-data/personas',catalog:{total:catalog.length,ready:available.length,missing:catalog.length-available.length,women:available.filter((item)=>item.gender==='Mujer').length,men:available.filter((item)=>item.gender==='Hombre').length,cities:new Set(available.map((item)=>item.location)).size,contents:available.reduce((n,item)=>n+item.files.filter((file)=>file.kind!=='profile').length,0),imported:members.length,processing},issues:catalog.filter((item)=>item.issues.length).map((item)=>({key:item.key,messages:item.issues})),batches:(await db.query('SELECT b.*, (SELECT count(*)::int FROM test_accounts t WHERE t.batch_id=b.id) AS remaining FROM test_batches b ORDER BY created_at DESC LIMIT 30')).rows,people:available.slice(0,24).map(({key,name,gender,age,location})=>({key,name,gender,age,location,image:indexed.get(key)?.avatar_id?`/api/v1/media/${indexed.get(key)!.avatar_id}`:null,imported:indexed.has(key)}))});
 }
 const value=await body(request,z.discriminatedUnion('action',[
  z.object({action:z.literal('add-all')}),
  z.object({action:z.literal('sync')}),
  z.object({action:z.literal('create'),label:z.string().trim().min(3).max(80),count:z.number().int().min(1).max(400),publications:z.number().int().min(0).max(800)}),
  z.object({action:z.enum(['delete','export','retry']),id:z.uuid()}),
  z.object({action:z.literal('delete-all'),confirmation:z.literal('ELIMINAR CUENTAS DE PRUEBA')}),
 ]));
 if(value.action==='add-all'||value.action==='sync'){
  if(!enabled())throw new HttpError(403,'La creación está deshabilitada en este entorno.');
  const catalog=await populationCatalog(),ready=catalog.filter((person)=>person.ready);
  if(!ready.length)throw new HttpError(400,'Agrega primero una persona con su archivo de perfil en test-data/personas.');
  const client=await db.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73190216)');
   let batch=(await client.query("SELECT id,status FROM test_batches WHERE source='folders' AND status<>'deleted' FOR UPDATE")).rows[0];
   if(batch?.status==='deleting')throw new HttpError(409,'Espera a que termine la eliminación.');
   if(!batch){batch={id:crypto.randomUUID()};await client.query("INSERT INTO test_batches(id,creator_id,label,requested,publications,source) VALUES($1,$2,'Personas desde carpetas',$3,0,'folders')",[batch.id,actorId,ready.length]);}
   else await client.query("UPDATE test_batches SET status='queued',error_code=NULL,requested=GREATEST(created,$2),updated_at=now() WHERE id=$1",[batch.id,ready.length]);
   await client.query("UPDATE media_assets SET status='queued',processing_attempts=0,processing_started_at=NULL WHERE status='failed' AND id IN(SELECT a.media_id FROM test_import_assets a JOIN test_accounts t ON t.user_id=a.user_id WHERE t.batch_id=$1)",[batch.id]);
   await client.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)',[actorId,`test-population.${value.action}`,batch.id,JSON.stringify({available:ready.length,total:catalog.length})]);
   await client.query('COMMIT');return json({id:batch.id,available:ready.length,total:catalog.length},202);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 if(value.action==='create'){
  if(!enabled())throw new HttpError(403,'La generación de cuentas está deshabilitada en este entorno.');
  if(value.publications>value.count*2)throw new HttpError(400,'Máximo dos publicaciones por cuenta.');
  const catalog=await testCatalog();if(value.count>catalog.length)throw new HttpError(400,'No hay suficientes identidades únicas en el catálogo.');
  const client=await db.connect(),id=crypto.randomUUID();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73190216)');
   const pending=Number((await client.query("SELECT count(*) AS count FROM test_batches WHERE status IN ('queued','running','waiting-images','deleting')")).rows[0].count);
   if(pending>=3)throw new HttpError(409,'Espera a que terminen los lotes pendientes.');
   await client.query('INSERT INTO test_batches(id,creator_id,label,requested,publications) VALUES($1,$2,$3,$4,$5)',[id,actorId,value.label,value.count,value.publications]);
   await client.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,\'test-batch.create\',$2,$3)',[actorId,id,JSON.stringify({count:value.count,publications:value.publications,label:value.label})]);
   await client.query('COMMIT');return json({id},202);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 if(value.action==='delete-all'){
  const client=await db.connect();
  try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73190216)');
   await client.query("UPDATE test_batches SET status='deleting',error_code=NULL,updated_at=now() WHERE status<>'deleted'");
   await client.query("INSERT INTO audit_events(actor_id,action) VALUES($1,'test-batch.delete-all')",[actorId]);
   await client.query('COMMIT');return json({ok:true},202);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 const batch=(await db.query('SELECT * FROM test_batches WHERE id=$1',[value.id])).rows[0];if(!batch)throw new HttpError(404,'Lote no disponible.');
 if(value.action==='export'){
  const accounts=(await db.query('SELECT t.credential_cipher,p.name,p.location,p.gender,EXTRACT(YEAR FROM age(p.birth_date))::int AS age FROM test_accounts t JOIN profiles p ON p.user_id=t.user_id WHERE t.batch_id=$1 ORDER BY t.position',[value.id])).rows;
  const lines=[['nombre','correo','contraseña','edad','género','ubicación'].map(csv).join(',')];
  for(const account of accounts){const credential=decryptTestCredential(account.credential_cipher);lines.push([account.name,credential.email,credential.password,account.age,account.gender,account.location].map(csv).join(','));}
  await db.query("INSERT INTO audit_events(actor_id,action,target_id) VALUES($1,'test-batch.export',$2)",[actorId,value.id]);
  return new Response('\uFEFF'+lines.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="clikiss-pruebas-${value.id}.csv"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(value.action==='retry'){
  if(!enabled())throw new HttpError(403,'La generación está deshabilitada.');
  if(batch.status!=='failed')throw new HttpError(409,'Este lote no necesita reintentarse.');
  await db.query("UPDATE test_batches SET status='queued',error_code=NULL,updated_at=now() WHERE id=$1 AND status='failed'",[value.id]);
 }else await db.query("UPDATE test_batches SET status='deleting',error_code=NULL,updated_at=now() WHERE id=$1 AND status<>'deleted'",[value.id]);
 await db.query('INSERT INTO audit_events(actor_id,action,target_id) VALUES($1,$2,$3)',[actorId,`test-batch.${value.action}`,value.id]);return json({ok:true},202);
}
