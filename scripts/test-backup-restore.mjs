import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
// Restores into a newly created isolated database, never into the application database.
const target='qa_restore_'+randomBytes(8).toString('hex');
function run(args,input){return new Promise((resolve,reject)=>{const child=spawn('docker',['compose','--env-file','.env.local','exec','-T','database',...args],{stdio:['pipe','pipe','pipe'],windowsHide:true});const chunks=[];child.stdout.on('data',(part)=>chunks.push(part));child.on('error',reject);child.on('exit',(code)=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('Falló la verificación de restauración.')));if(input)child.stdin.end(input);else child.stdin.end();});}
let created=false;
try{
 const dump=await run(['pg_dump','-U','conecta','-d','conecta','-Fc']);
 await run(['createdb','-U','conecta',target]);created=true;
 await run(['pg_restore','-U','conecta','-d',target,'--exit-on-error'],dump);
 const result=await run(['psql','-U','conecta','-d',target,'-tAc',"SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]);
 if(Number(result.toString().trim())<20)throw new Error('La restauración no tiene las tablas esperadas.');
 console.log('Respaldo y restauración verificados en una base temporal aislada.');
}finally{if(created&&/^qa_restore_[a-f0-9]{16}$/.test(target))await run(['dropdb','-U','conecta',target]);}
