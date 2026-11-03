import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {populationCatalog} from '../shared/folder-population.mjs';
import {processTestBatch} from '../shared/test-accounts.mjs';
nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production');
if(process.env.NODE_ENV==='production'&&process.env.TEST_USERS_ENABLED!=='true')throw new Error('La generación está deshabilitada.');
const email=process.argv[2];if(!email)throw new Error('Uso: node scripts/sync-profile-folders.mjs correo-administrador');
const db=new Pool({connectionString:process.env.DATABASE_URL,max:3});let batchId;
try{
 const actor=(await db.query('SELECT u.id FROM "user" u JOIN staff_roles s ON s.user_id=u.id WHERE lower(u.email)=lower($1) AND u."emailVerified" AND s.role=\'admin\'',[email])).rows[0];if(!actor)throw new Error('Cuenta administrativa verificada requerida.');
 const ready=(await populationCatalog()).filter((person)=>person.ready);if(!ready.length)throw new Error('No hay carpetas con perfil disponible.');
 const client=await db.connect();
 try{
  await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73190216)');
  const batch=(await client.query("SELECT id,status FROM test_batches WHERE source='folders' AND status<>'deleted' FOR UPDATE")).rows[0];
  if(batch?.status==='deleting')throw new Error('Espera a que termine el borrado.');
  batchId=batch?.id??randomUUID();
  if(batch)await client.query("UPDATE test_batches SET status='queued',requested=GREATEST(created,$2),error_code=NULL,updated_at=now() WHERE id=$1",[batchId,ready.length]);
  else await client.query("INSERT INTO test_batches(id,creator_id,label,requested,publications,source) VALUES($1,$2,'Personas desde carpetas',$3,0,'folders')",[batchId,actor.id,ready.length]);
  await client.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,\'test-population.sync\',$2,$3)',[actor.id,batchId,JSON.stringify({source:'local-cli',available:ready.length})]);
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 console.log(`Sincronización iniciada: ${ready.length} personas disponibles de 500 fichas.`);
 let last=-1;const deadline=Date.now()+15*60*1000;
 while(Date.now()<deadline){
  await processTestBatch(db);
  const batch=(await db.query('SELECT status,created,requested FROM test_batches WHERE id=$1',[batchId])).rows[0];
  if(batch.created!==last&&(batch.created%10===0||batch.created===batch.requested)){console.log(`Cuentas: ${batch.created}/${batch.requested}. Estado: ${batch.status}.`);last=batch.created;}
  if(batch.status==='failed')throw new Error('Un archivo no pudo procesarse. Revisa el lote en el backoffice.');
  if(batch.status==='ready'){
   const result=(await db.query('SELECT (SELECT count(*)::int FROM test_accounts WHERE batch_id=$1) AS users,(SELECT count(*)::int FROM posts p JOIN test_accounts t ON t.user_id=p.author_id WHERE t.batch_id=$1 AND NOT p.story) AS posts,(SELECT count(*)::int FROM posts p JOIN test_accounts t ON t.user_id=p.author_id WHERE t.batch_id=$1 AND p.story) AS stories',[batchId])).rows[0];
   console.log(JSON.stringify({status:'ready',...result}));break;
  }
  await new Promise((resolve)=>setTimeout(resolve,250));
 }
 const status=(await db.query('SELECT status FROM test_batches WHERE id=$1',[batchId])).rows[0].status;if(status!=='ready')throw new Error('La importación sigue pendiente en el backoffice.');
}finally{await db.end();}
