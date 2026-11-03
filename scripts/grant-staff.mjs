import {Pool} from 'pg';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),true);
const [email,role='admin']=process.argv.slice(2);
if(!email||!['admin','moderator','support','none'].includes(role))throw new Error('Uso: npm run staff:grant -- correo rol');
const db=new Pool({connectionString:process.env.DATABASE_URL});
const client=await db.connect();
try{
 const user=(await client.query('SELECT id FROM "user" WHERE lower(email)=lower($1) AND "emailVerified"=true',[email])).rows[0];
 if(!user)throw new Error('Primero registra y confirma esta cuenta.');
 await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(73190211)');
 if(role==='none')await client.query('DELETE FROM staff_roles WHERE user_id=$1',[user.id]);
 else await client.query('INSERT INTO staff_roles(user_id,role) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role',[user.id,role]);
 await client.query('INSERT INTO audit_events(action,target_id,details) VALUES($1,$2,$3)',['staff.bootstrap',user.id,JSON.stringify({role,source:'local-cli'})]);
 await client.query('COMMIT');console.log('Rol actualizado.');
}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await db.end();}
