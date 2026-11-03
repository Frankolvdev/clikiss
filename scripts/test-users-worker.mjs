import {Pool} from 'pg';
import nextEnv from '@next/env';
import {processTestBatch} from '../shared/test-accounts.mjs';
nextEnv.loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production');
const enabled=process.env.TEST_USERS_ENABLED==='true'||process.env.NODE_ENV!=='production';
{
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});pool.on('error',()=>{});let stopped=false;
 process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
 console.log('Procesador de cuentas sintéticas iniciado.');
 while(!stopped){try{if(await processTestBatch(pool,{creationEnabled:enabled}))continue;}catch{/* Retry after database restart. */}await new Promise((resolve)=>setTimeout(resolve,1500));}
 await pool.end();
}
