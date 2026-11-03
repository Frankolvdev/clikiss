import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {normalizePersonName} from '../shared/person-name.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname),'Solo pruebas locales.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),client=await db.connect();
const cases=[
 ['francisco jesus ovlera escroica','Francisco Jesus Ovlera Escroica'],
 ['  MARÍA   JOSÉ\tMUÑOZ  ','María José Muñoz'],
 ['aNa-maRÍA d\'ÁVILA','Ana-María D\'Ávila'],
 ['JOSE\u0301 A\u0301NGEL','José Ángel'],
];
try{
 await client.query('BEGIN');
 for(const [input,expected] of cases){
  assert.equal(normalizePersonName(input),expected);
  assert.equal((await client.query('SELECT normalize_person_name($1) AS name',[input])).rows[0].name,expected);
  const id=randomUUID();
  const user=(await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now()) RETURNING name',[id,input,`${id}@example.test`])).rows[0];assert.equal(user.name,expected);
  assert.equal((await client.query('INSERT INTO profiles(user_id,name) VALUES($1,$2) RETURNING name',[id,input])).rows[0].name,expected);
  assert.equal((await client.query('UPDATE "user" SET name=$2 WHERE id=$1 RETURNING name',[id,input.toUpperCase()])).rows[0].name,expected);
  assert.equal((await client.query('UPDATE profiles SET name=$2 WHERE user_id=$1 RETURNING name',[id,input.toUpperCase()])).rows[0].name,expected);
 }
 const existing=await client.query('SELECT count(*)::int AS n FROM (SELECT name FROM "user" UNION ALL SELECT name FROM profiles) people WHERE name IS DISTINCT FROM normalize_person_name(name)');assert.equal(existing.rows[0].n,0);
 console.log('OK: nombres existentes normalizados; altas y cambios protegidos en cuentas y perfiles; acentos, espacios, nombres compuestos e idempotencia. Sin correos ni cambios permanentes de prueba.');
}finally{await client.query('ROLLBACK');client.release();await db.end();}
