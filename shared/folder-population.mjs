import {normalizePersonName} from './person-name.mjs';
import {readFile,readdir,lstat,realpath,mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import sharp from 'sharp';
import ffmpeg from 'ffmpeg-static';
import {hashPassword} from 'better-auth/crypto';
import {putMedia} from './media-storage.mjs';
import {avatarLoop} from './video-preview.mjs';

export const populationRoot=()=>path.resolve(/* turbopackIgnore: true */ process.env.TEST_USERS_ROOT??'test-data/personas');
const extensions=new Set(['.jpg','.jpeg','.png','.webp','.avif','.mp4','.webm']);
const digest=(value)=>createHash('sha256').update(value).digest('hex');
export async function populationCatalog(){
 const people=JSON.parse(await readFile(/* turbopackIgnore: true */ path.resolve('assets/test-users/population.json'),'utf8'));
 const root=populationRoot(),base=await realpath(/* turbopackIgnore: true */ root);
 return Promise.all(people.map(async(person)=>{
  const files=[],issues=[];
  async function scan(relative,kind){
   const directory=path.join(root,person.key,relative);
   try{
    if((await lstat(/* turbopackIgnore: true */ directory)).isSymbolicLink())throw new Error('LINK_NOT_ALLOWED');
    const resolved=await realpath(/* turbopackIgnore: true */ directory),inside=path.relative(base,resolved);if(inside.startsWith('..')||path.isAbsolute(inside))throw new Error('INVALID_DIRECTORY');
    for(const entry of (await readdir(/* turbopackIgnore: true */ directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
     if(!entry.isFile()||!extensions.has(path.extname(entry.name).toLowerCase()))continue;
     const file=path.join(relative,entry.name).replaceAll('\\','/');
     const stat=await lstat(/* turbopackIgnore: true */ path.join(root,person.key,file));
     if(stat.size>50*1024*1024||stat.size===0){issues.push('Archivo vacío o mayor de 50 MB.');continue;}
     files.push({relative:file,kind,size:stat.size,mtime:stat.mtimeMs,video:['.mp4','.webm'].includes(path.extname(file).toLowerCase())});
    }
   }catch(error){if(error.code!=='ENOENT')issues.push('No se pudo leer una carpeta o contiene un enlace.');}
  }
  await scan('','profile');await scan('publicacion','post');await scan('publicaciones','post');await scan('historias','story');
  const profiles=files.filter((file)=>file.kind==='profile'),preferred=profiles.filter((file)=>/^perfil\./i.test(file.relative)),selected=preferred.length===1?preferred[0]:profiles.length===1?profiles[0]:null;
  if(profiles.length&&!selected)issues.push('Debe existir una sola foto de perfil o un archivo llamado perfil.');
  const content=files.filter((file)=>file.kind!=='profile');if(content.length>100)issues.push('Máximo 100 contenidos por persona.');
  const ready=Boolean(selected)&&!issues.length,accepted=selected?[selected,...content.slice(0,100)]:[];
  return {...person,name:normalizePersonName(person.name),ready,files:accepted,issues,fingerprint:digest(JSON.stringify({person,files:accepted}))};
 }));
}
export async function sourceBytes(person,file){
 const root=await realpath(/* turbopackIgnore: true */ populationRoot()),target=path.resolve(root,person.key,file.relative),relative=path.relative(root,target);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('INVALID_SOURCE');
 // Reject symlinks in every component, including a directory swapped after scanning.
 let current=root;for(const part of relative.split(path.sep)){current=path.join(current,part);if((await lstat(/* turbopackIgnore: true */ current)).isSymbolicLink())throw new Error('LINK_NOT_ALLOWED');}
 const size=(await lstat(/* turbopackIgnore: true */ target)).size;if(size>50*1024*1024||size===0)throw new Error('SOURCE_SIZE');
 return readFile(/* turbopackIgnore: true */ target);
}
export async function profilePhoto(person){
 const file=person.files.find((item)=>item.kind==='profile');if(!file)throw new Error('PROFILE_REQUIRED');
 const raw=await sourceBytes(person,file);if(!file.video)return (await sharp(raw,{limitInputPixels:40000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer());
 const dir=await mkdtemp(path.join(tmpdir(),'conecta-profile-'));
 try{
  await writeFile(path.join(dir,'input'),raw);
  await new Promise((resolve,reject)=>{const child=spawn(process.env.FFMPEG_PATH||ffmpeg,['-y','-i',path.join(dir,'input'),'-frames:v','1','-vf',"scale='min(1920,iw)':-2",path.join(dir,'profile.webp')],{stdio:'ignore',windowsHide:true});const timeout=setTimeout(()=>{child.kill();reject(new Error('FRAME_TIMEOUT'));},30000);child.on('error',(error)=>{clearTimeout(timeout);reject(error);});child.on('exit',(code)=>{clearTimeout(timeout);if(code===0)resolve();else reject(new Error('FRAME_FAILED'));});});
  return await readFile(path.join(dir,'profile.webp'));
 }finally{if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('conecta-profile-'))throw new Error('UNSAFE_TEMP_PATH');await rm(dir,{recursive:true,force:true});}
}
async function storeSource(client,userId,person,file,orphans){
 const raw=await sourceBytes(person,file),hash=digest(raw),old=(await client.query('SELECT a.*,m.status,m.loop_key FROM test_import_assets a JOIN media_assets m ON m.id=a.media_id WHERE a.user_id=$1 AND a.source_path=$2',[userId,file.relative])).rows[0];
 if(old?.content_hash===hash){if(old.status==='failed')await client.query("UPDATE media_assets SET status='queued',processing_attempts=0,processing_started_at=NULL WHERE id=$1",[old.media_id]);return;}
 const video=file.video&&file.kind!=='profile',id=randomUUID();let image,preview,mime;
 if(video){if(!((raw.subarray(4,8).toString()==='ftyp')||raw.subarray(0,4).equals(Buffer.from([26,69,223,163]))))throw new Error('VIDEO_FORMAT');image=raw;mime=path.extname(file.relative).toLowerCase()==='.webm'?'video/webm':'video/mp4';}
 else{image=file.kind==='profile'?await profilePhoto(person):await sharp(raw,{limitInputPixels:40000000}).rotate().resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();preview=await sharp(image).resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:72}).toBuffer();mime='image/webp';}
 orphans.push(id);await putMedia(id,image,mime);if(preview){orphans.push(`${id}.preview`);await putMedia(`${id}.preview`,preview,'image/webp');}
 const loop=file.kind==='profile'&&file.video?await avatarLoop(raw):null;if(loop){orphans.push(`${id}.loop`);await putMedia(`${id}.loop`,loop,'video/mp4');}
 const meta=video?{}:await sharp(image).metadata();
 await client.query('INSERT INTO media_assets(id,owner_id,object_key,mime,bytes,width,height,status,preview_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,userId,id,mime,image.length,meta.width??null,meta.height??null,video?'queued':'ready',preview?`${id}.preview`:null]);
 if(loop)await client.query('UPDATE media_assets SET loop_key=$2 WHERE id=$1',[id,`${id}.loop`]);
 await client.query('INSERT INTO test_import_assets(user_id,source_path,content_hash,kind,media_id,published) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,source_path) DO UPDATE SET content_hash=EXCLUDED.content_hash,media_id=EXCLUDED.media_id,published=EXCLUDED.published',[userId,file.relative,hash,file.kind,id,file.kind==='profile']);
 if(file.kind==='profile')await client.query('UPDATE profiles SET avatar_id=$2 WHERE user_id=$1',[userId,id]);
}
async function publishReady(client,userId,person){
 const files=(await client.query("SELECT a.* FROM test_import_assets a JOIN media_assets m ON m.id=a.media_id WHERE a.user_id=$1 AND NOT a.published AND m.status='ready' ORDER BY a.source_path",[userId])).rows;
 for(const file of files){
  const caption='Un momento para compartir.';
  if(file.kind==='post'){
   if(file.post_id)await client.query('UPDATE posts SET media_id=$2 WHERE id=$1',[file.post_id,file.media_id]);
   else{file.post_id=randomUUID();await client.query('INSERT INTO posts(id,author_id,media_id,caption,story) VALUES($1,$2,$3,$4,false)',[file.post_id,userId,file.media_id,caption]);}
  }
  const first=person.files.find((item)=>item.kind==='post')?.relative;
  const story=file.kind==='story'||(file.source_path===first&&Number(person.key.slice(-4))%3===0);
  if(story){if(file.story_id)await client.query('UPDATE posts SET media_id=$2 WHERE id=$1',[file.story_id,file.media_id]);else{file.story_id=randomUUID();await client.query("INSERT INTO posts(id,author_id,media_id,caption,story,expires_at) VALUES($1,$2,$3,$4,true,now()+interval '24 hours')",[file.story_id,userId,file.media_id,caption]);}}
  await client.query('UPDATE test_import_assets SET published=true,post_id=$3,story_id=$4 WHERE user_id=$1 AND source_path=$2',[userId,file.source_path,file.post_id,file.story_id]);
 }
}
export async function syncFolderBatch(client,batch,{encrypt}){
 const catalog=await populationCatalog(),ready=catalog.filter((person)=>person.ready);
 const accounts=(await client.query('SELECT t.*,EXISTS(SELECT 1 FROM test_import_assets a JOIN media_assets m ON m.id=a.media_id WHERE a.user_id=t.user_id AND NOT a.published AND m.status IN (\'ready\',\'failed\')) AS actionable FROM test_accounts t WHERE batch_id=$1',[batch.id])).rows;
 const existing=new Map(accounts.map((account)=>[account.population_key,account]));
 const person=ready.find((spec)=>!existing.has(spec.key)||existing.get(spec.key).source_fingerprint!==spec.fingerprint||existing.get(spec.key).actionable);
 if(!person){
  const pending=Number((await client.query("SELECT count(*) FROM test_import_assets a JOIN media_assets m ON m.id=a.media_id JOIN test_accounts t ON t.user_id=a.user_id WHERE t.batch_id=$1 AND NOT a.published AND m.status IN ('queued','processing')",[batch.id])).rows[0].count);
  await client.query("UPDATE test_batches SET requested=GREATEST(1,$2),created=$3,status=CASE WHEN $4::boolean THEN 'running' ELSE 'ready' END,updated_at=now() WHERE id=$1 AND status<>'deleting'",[batch.id,Math.max(ready.length,accounts.length),accounts.length,pending>0]);return false;
 }
 const old=existing.get(person.key),id=old?.user_id??randomUUID(),email=`prueba.${person.key}@example.test`,password=old?null:`Qa!${randomBytes(18).toString('base64url')}`,hash=password?await hashPassword(password):null,orphans=[];
 try{
  await client.query('BEGIN');
  const current=(await client.query('SELECT status FROM test_batches WHERE id=$1 FOR UPDATE',[batch.id])).rows[0];if(current?.status==='deleting'){await client.query('ROLLBACK');return true;}
  if(!old){
   await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,normalizePersonName(person.name),email]);
   await client.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
   await client.query('INSERT INTO profiles(user_id,name,birth_date,location,gender,bio,interests,adventure_available,published,latitude,longitude,radar_visible,synthetic) VALUES($1,$2,(CURRENT_DATE-make_interval(years=>$3))::date,$4,$5,$6,$7,$8,false,$9,$10,true,true)',[id,normalizePersonName(person.name),person.age,person.location,person.gender,person.bio,person.interests,person.adventure,person.latitude,person.longitude]);
   await client.query("INSERT INTO preferences(user_id,min_age,max_age,location) VALUES($1,18,99,'')",[id]);
   await client.query('INSERT INTO test_accounts(user_id,batch_id,position,catalog_key,population_key,credential_cipher) VALUES($1,$2,$3,$4,$4,$5)',[id,batch.id,Number(person.key.slice(-4))-1,person.key,encrypt({email,password})]);
  }
  if(!old||old.source_fingerprint!==person.fingerprint)for(const file of person.files)await storeSource(client,id,person,file,orphans);
  // Failed videos are retried only through an explicit synchronization after batch failure.
  if(old?.actionable){const failed=(await client.query("SELECT 1 FROM test_import_assets a JOIN media_assets m ON m.id=a.media_id WHERE a.user_id=$1 AND m.status='failed'",[id])).rowCount;if(failed)throw new Error('MEDIA_FAILED');}
  await publishReady(client,id,person);
  await client.query('UPDATE profiles SET published=true WHERE user_id=$1',[id]);
  await client.query('UPDATE test_accounts SET source_fingerprint=$2 WHERE user_id=$1',[id,person.fingerprint]);
  await client.query("UPDATE test_batches SET created=(SELECT count(*) FROM test_accounts WHERE batch_id=$1),status='running',error_code=NULL,updated_at=now() WHERE id=$1",[batch.id]);
  await client.query('COMMIT');return true;
 }catch(error){await client.query('ROLLBACK');if(orphans.length)await client.query('INSERT INTO media_deletions(object_key) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING',[orphans]);throw error;}
}
