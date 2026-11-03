import {spawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {mkdir,stat,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
nextEnv.loadEnvConfig(process.cwd(),true);
const directory=path.resolve('.backups');await mkdir(directory,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dump=path.join(directory,`conecta-${stamp}.dump`);
const command=spawn('docker',['compose','--env-file','.env.local','exec','-T','database','pg_dump','-U','conecta','-d','conecta','-Fc'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
const completed=new Promise((resolve,reject)=>{command.on('error',reject);command.on('exit',(code)=>code===0?resolve():reject(new Error('No se pudo respaldar PostgreSQL.')));});
await Promise.all([pipeline(command.stdout,createWriteStream(dump,{mode:0o600})),completed]);
if(!(await stat(dump)).size)throw new Error('El respaldo está vacío.');
console.log(`Respaldo PostgreSQL creado: ${path.basename(dump)}`);
let media=null;
if(!process.env.S3_BUCKET){const mediaRoot=path.resolve(process.env.MEDIA_ROOT??'.data/media');await mkdir(mediaRoot,{recursive:true});media=path.join(directory,`conecta-${stamp}-media.tar.gz`);await new Promise((resolve,reject)=>{const archive=spawn('tar',['-czf',media,'-C',mediaRoot,'.'],{stdio:'ignore',windowsHide:true});archive.on('error',reject);archive.on('exit',(code)=>code===0?resolve():reject(new Error('No se pudo respaldar el directorio de medios.')));});}
await writeFile(path.join(directory,`conecta-${stamp}.json`),JSON.stringify({createdAt:new Date().toISOString(),database:path.basename(dump),media:media?path.basename(media):null,objectStorage:Boolean(process.env.S3_BUCKET)},null,2),{mode:0o600});
console.log(media?'Respaldo de archivos y manifiesto creados.':'Bucket externo: configurar versionado y respaldo con el proveedor.');
