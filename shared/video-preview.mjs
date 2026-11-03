import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import ffmpeg from 'ffmpeg-static';

export async function avatarLoop(bytes,startSeconds=0){
 const directory=await mkdtemp(path.join(tmpdir(),'conecta-avatar-'));
 try{
  const input=path.join(directory,'input'),output=path.join(directory,'loop.mp4');await writeFile(input,bytes);
  await new Promise((resolve,reject)=>{
   const child=spawn(process.env.FFMPEG_PATH||ffmpeg,['-y','-ss',String(startSeconds),'-i',input,'-t','3','-an','-vf','fps=12,scale=320:320:force_original_aspect_ratio=increase,crop=320:320:(iw-ow)/2:(ih-oh)*0.2','-c:v','libx264','-preset','veryfast','-profile:v','baseline','-pix_fmt','yuv420p','-crf','30','-maxrate','200k','-bufsize','400k','-movflags','+faststart',output],{stdio:'ignore',windowsHide:true});
   const timeout=setTimeout(()=>{child.kill();reject(new Error('AVATAR_TIMEOUT'));},60000);
   child.on('error',(error)=>{clearTimeout(timeout);reject(error);});child.on('exit',(code)=>{clearTimeout(timeout);if(code===0)resolve();else reject(new Error('AVATAR_VIDEO_INVALID'));});
  });
  const result=await readFile(output);if(result.length>250*1024)throw new Error('AVATAR_TOO_LARGE');return result;
 }finally{if(path.dirname(path.resolve(directory))!==path.resolve(tmpdir())||!path.basename(directory).startsWith('conecta-avatar-'))throw new Error('UNSAFE_TEMP_PATH');await rm(directory,{recursive:true,force:true});}
}
