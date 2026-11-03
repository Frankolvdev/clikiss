import {Pool} from 'pg';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import {putMedia,readMedia} from '../shared/media-storage.mjs';
import {avatarLoop} from '../shared/video-preview.mjs';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production');
const db=new Pool({connectionString:process.env.DATABASE_URL,max:2});
db.on('error',()=>{});let stopped=false;
function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.env.FFMPEG_PATH||ffmpegPath,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let diagnostic='';child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(0,32768);});const timeout=setTimeout(()=>{child.kill();reject(new Error('TIMEOUT'));},180000);child.on('error',(error)=>{clearTimeout(timeout);reject(error);});child.on('exit',(code)=>{clearTimeout(timeout);if(code===0)resolve(diagnostic);else reject(new Error('VIDEO_INVALID'));});});}
async function job(){
 const client=await db.connect();let asset;
 try{await client.query('BEGIN');asset=(await client.query("SELECT id,object_key,preview_start,cover_time,custom_cover FROM media_assets WHERE (status='queued' OR status='processing' AND processing_started_at<now()-interval '5 minutes') AND processing_attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(asset)await client.query("UPDATE media_assets SET status='processing',processing_started_at=now(),processing_attempts=processing_attempts+1 WHERE id=$1",[asset.id]);await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 if(!asset)return false;
 const dir=await mkdtemp(path.join(tmpdir(),'conecta-video-'));
 try{
  await writeFile(path.join(dir,'input'),await readMedia(asset.object_key));
  const diagnostic=await run(['-y','-i',path.join(dir,'input'),'-map','0:v:0','-map','0:a?','-vf',"scale='min(1280,iw)':-2",'-c:v','libx264','-preset','veryfast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',path.join(dir,'output.mp4')]);
  const match=/Duration: (\d+):(\d+):([\d.]+)/.exec(diagnostic);const duration=match?Number(match[1])*3600+Number(match[2])*60+Number(match[3]):0;
  const start=Math.min(Number(asset.preview_start),Math.max(0,duration-3)),coverTime=Math.min(Number(asset.cover_time),Math.max(0,duration-.1));
  if(!asset.custom_cover)await run(['-y','-ss',String(coverTime),'-i',path.join(dir,'output.mp4'),'-frames:v','1','-vf',"scale='min(640,iw)':-2",path.join(dir,'preview.webp')]);
  const video=await readFile(path.join(dir,'output.mp4')),preview=asset.custom_cover?await readMedia(asset.id+'.preview'):await readFile(path.join(dir,'preview.webp'));if(video.length>50*1024*1024)throw new Error('VIDEO_OUTPUT_TOO_LARGE');
  await putMedia(asset.id,video,'video/mp4');await putMedia(asset.id+'.preview',preview,'image/webp');
  await putMedia(asset.id+'.loop',await avatarLoop(video,start),'video/mp4');
  const reservation=await db.connect();
  try{
   await reservation.query('BEGIN');
   const owner=(await reservation.query('SELECT owner_id FROM media_assets WHERE id=$1',[asset.id])).rows[0]?.owner_id;
   if(!owner)throw new Error('MEDIA_REMOVED');
   await reservation.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`media:${owner}`]);
   const used=Number((await reservation.query('SELECT COALESCE(sum(bytes),0) AS used FROM media_assets WHERE owner_id=$1 AND id<>$2',[owner,asset.id])).rows[0].used);
   if(used+video.length>Number(process.env.MEDIA_QUOTA_MB??500)*1024*1024)throw new Error('MEDIA_QUOTA');
   await reservation.query("UPDATE media_assets SET mime='video/mp4',bytes=$2,preview_key=$3,loop_key=$4,duration_ms=$5,preview_start=$6,cover_time=$7,status='ready' WHERE id=$1",[asset.id,video.length,asset.id+'.preview',asset.id+'.loop',Math.round(duration*1000),start,coverTime]);
   await reservation.query('COMMIT');
  }catch(error){await reservation.query('ROLLBACK');throw error;}finally{reservation.release();}
 }catch{await db.query("UPDATE media_assets SET status='failed' WHERE id=$1",[asset.id]);}
 finally{if(path.dirname(path.resolve(dir))!==path.resolve(tmpdir())||!path.basename(dir).startsWith('conecta-video-'))throw new Error('UNSAFE_TEMP_PATH');await rm(dir,{recursive:true,force:true});} // Only the mkdtemp directory created by this job.
 return true;
}
async function main(){console.log('Procesador de video iniciado.');while(!stopped){try{if(await job())continue;}catch{/* Retry when PostgreSQL reconnects. */}await new Promise((resolve)=>setTimeout(resolve,1500));}await db.end();}
process.on('SIGTERM',()=>{stopped=true;});process.on('SIGINT',()=>{stopped=true;});void main();
