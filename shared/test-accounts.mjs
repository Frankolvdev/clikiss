import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import sharp from 'sharp';
import {putMedia} from './media-storage.mjs';
import {normalizePersonName} from './person-name.mjs';
import {syncFolderBatch} from './folder-population.mjs';

const root=()=>path.resolve(/* turbopackIgnore: true */ 'assets/test-users');
export async function testCatalog(){
 const catalog=JSON.parse(await readFile(/* turbopackIgnore: true */ path.join(root(),'catalog.json'),'utf8'));
 const files=new Set(await readdir(/* turbopackIgnore: true */ root()));
 return catalog.map((item)=>({...item,name:normalizePersonName(item.name),ready:files.has(item.file)}));
}
function key(){if(!process.env.BETTER_AUTH_SECRET)throw new Error('AUTH_NOT_CONFIGURED');return createHash('sha256').update(`conecta-test-credentials-v1:${process.env.BETTER_AUTH_SECRET}`).digest();}
export function encryptTestCredential(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64');}
export function decryptTestCredential(value){const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',key(),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8'));}
export async function testImage(keyValue){if(!/^person-\d{4}$/.test(keyValue))throw new Error('INVALID_CATALOG_KEY');return readFile(/* turbopackIgnore: true */ path.join(root(),`${keyValue}.webp`));}

async function removeBatch(client,batch){
 const ids=(await client.query('SELECT user_id FROM test_accounts WHERE batch_id=$1 ORDER BY position LIMIT 20',[batch.id])).rows.map((row)=>row.user_id);
 await client.query('BEGIN');
 try{
  if(ids.length){
   // Only IDs proven to belong to this synthetic batch; real accounts are never selected.
   await client.query('DELETE FROM reports WHERE reporter_id=ANY($1::text[]) OR target_user_id=ANY($1::text[]) OR post_id IN(SELECT id FROM posts WHERE author_id=ANY($1::text[])) OR review_id IN(SELECT r.id FROM reviews r JOIN review_invitations i ON i.id=r.invitation_id WHERE i.owner_id=ANY($1::text[]) OR i.recipient_id=ANY($1::text[]))',[ids]);
   await client.query('DELETE FROM reviews WHERE invitation_id IN(SELECT id FROM review_invitations WHERE owner_id=ANY($1::text[]) OR recipient_id=ANY($1::text[]))',[ids]);
   await client.query('UPDATE audit_events SET actor_id=NULL WHERE actor_id=ANY($1::text[])',[ids]);
   await client.query('INSERT INTO media_deletions(object_key) SELECT object_key FROM media_assets WHERE owner_id=ANY($1::text[]) UNION SELECT preview_key FROM media_assets WHERE owner_id=ANY($1::text[]) AND preview_key IS NOT NULL UNION SELECT loop_key FROM media_assets WHERE owner_id=ANY($1::text[]) AND loop_key IS NOT NULL ON CONFLICT DO NOTHING',[ids]);
   // Avoid avatar/cover FK cycles while cascading the account's media and posts.
   await client.query('UPDATE profiles SET avatar_id=NULL,cover_id=NULL,card_photo_id=NULL WHERE user_id=ANY($1::text[])',[ids]);
   await client.query('DELETE FROM posts WHERE author_id=ANY($1::text[])',[ids]);
   await client.query('DELETE FROM "user" WHERE id=ANY($1::text[]) AND id IN(SELECT user_id FROM test_accounts WHERE batch_id=$2)',[ids,batch.id]);
  }else await client.query("UPDATE test_batches SET status='deleted',updated_at=now() WHERE id=$1",[batch.id]);
  await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
async function createOne(client,batch,catalog){
 const spec=catalog[batch.created];
 if(!spec?.ready){await client.query("UPDATE test_batches SET status='waiting-images',updated_at=now() WHERE id=$1",[batch.id]);return false;}
 const id=randomUUID(),mediaId=randomUUID(),email=`qa.${batch.id.slice(0,8)}.${String(batch.created+1).padStart(4,'0')}@example.test`,password=`Qa!${randomBytes(18).toString('base64url')}`;
 const hash=await hashPassword(password),image=await testImage(spec.key),thumbnail=await sharp(image).resize({width:320,withoutEnlargement:true}).webp({quality:75}).toBuffer(),meta=await sharp(image).metadata();
 await putMedia(mediaId,image,'image/webp');await putMedia(`${mediaId}.preview`,thumbnail,'image/webp');
 const name=normalizePersonName(spec.name),createdAt=new Date(Date.now()-(batch.created%30)*86400000);
 try{
  await client.query('BEGIN');
  // Serialize against a request to delete/cancel this batch between jobs.
  const state=(await client.query('SELECT status,created FROM test_batches WHERE id=$1 FOR UPDATE',[batch.id])).rows[0];
  if(!state||state.status==='deleting'||state.created!==batch.created){
   await client.query('INSERT INTO media_deletions(object_key) VALUES($1),($2) ON CONFLICT DO NOTHING',[mediaId,`${mediaId}.preview`]);await client.query('COMMIT');return true;
  }
  await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,$4,now())',[id,name,email,createdAt]);
  await client.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
  await client.query("INSERT INTO media_assets(id,owner_id,object_key,mime,bytes,width,height,status,preview_key) VALUES($1,$2,$7,'image/webp',$3,$4,$5,'ready',$6)",[mediaId,id,image.length,meta.width,meta.height,`${mediaId}.preview`,mediaId]);
  await client.query(`INSERT INTO profiles(user_id,name,birth_date,location,gender,bio,interests,adventure_available,avatar_id,published,latitude,longitude,radar_visible,synthetic)
   VALUES($1,$2,(CURRENT_DATE-make_interval(years=>$3))::date,$4,$5,$6,$7,$8,$9,true,$10,$11,true,true)`,[id,name,spec.age,spec.location,spec.gender,spec.bio,spec.interests,spec.adventure,mediaId,spec.latitude,spec.longitude]);
  await client.query("INSERT INTO preferences(user_id,min_age,max_age,location) VALUES($1,18,65,'')",[id]);
  await client.query('INSERT INTO test_accounts(user_id,batch_id,position,catalog_key,credential_cipher) VALUES($1,$2,$3,$4,$5)',[id,batch.id,batch.created,spec.key,encryptTestCredential({email,password})]);
  // Distribute the requested publications across their own subjects. Never borrow another identity's photo.
  for(let index=batch.created;index<batch.publications;index+=batch.requested){
   const story=index%3===0,time=new Date(Date.now()-(story?index%6*3600000:index%21*86400000));
   await client.query("INSERT INTO posts(id,author_id,media_id,caption,story,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5 THEN $6::timestamptz+interval '24 hours' ELSE NULL END)",[randomUUID(),id,mediaId,`${spec.caption} Contenido sintético de prueba.`,story,time]);
  }
  await client.query("UPDATE test_batches SET created=created+1,status=CASE WHEN created+1=requested THEN 'ready' ELSE 'running' END,error_code=NULL,updated_at=now() WHERE id=$1",[batch.id]);
  await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK');await client.query('INSERT INTO media_deletions(object_key) VALUES($1),($2) ON CONFLICT DO NOTHING',[mediaId,`${mediaId}.preview`]);throw error;}
}
export async function processTestBatch(pool,{creationEnabled=true}={}){
 const client=await pool.connect();let locked=false,batch;
 try{
  locked=Boolean((await client.query('SELECT pg_try_advisory_lock(73190215) AS locked')).rows[0].locked);if(!locked)return false;
  batch=(await client.query("SELECT * FROM test_batches WHERE status='deleting' OR ($1::boolean AND status IN ('queued','running','waiting-images')) ORDER BY (status='deleting') DESC,updated_at,id LIMIT 1",[creationEnabled])).rows[0];if(!batch)return false;
  if(batch.status==='deleting')return await removeBatch(client,batch);
  if(batch.source==='folders')return await syncFolderBatch(client,batch,{encrypt:encryptTestCredential});
  return await createOne(client,batch,await testCatalog());
 }catch(error){
  console.error('Synthetic account job failed:',/^[A-Z0-9_]{3,40}$/.test(error.code??'')?error.code:'PROCESSING_ERROR');
  if(batch)await client.query("UPDATE test_batches SET status=CASE WHEN status='deleting' THEN 'deleting' ELSE 'failed' END,error_code='PROCESSING_FAILED',updated_at=now() WHERE id=$1",[batch.id]);
  return false;
 }finally{if(locked)await client.query('SELECT pg_advisory_unlock(73190215)');client.release();}
}
