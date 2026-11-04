import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {registrationSettings,saveRegistrationSettings} from '../shared/registration-settings.mjs';

nextEnv.loadEnvConfig(process.cwd(),true);
test('registration policy is persistent, admin-only, audited and protected against stale writes',async()=>{
 if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local test database only.');
 const root=new Pool({connectionString:process.env.DATABASE_URL,max:1}),schema='registration_test_'+randomUUID().replaceAll('-','');
 await root.query(`CREATE SCHEMA ${schema}`);
 const db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`,max:2});
 try{
  await db.query('CREATE TABLE "user"(id text PRIMARY KEY,"emailVerified" boolean); CREATE TABLE staff_roles(user_id text PRIMARY KEY,role text); CREATE TABLE audit_events(actor_id text,action text,target_id text,details jsonb)');
  await db.query(await readFile(new URL('../db/migrations/015_registration_settings.sql',import.meta.url),'utf8'));
  await db.query('INSERT INTO "user" VALUES(\'admin\',true),(\'moderator\',true),(\'member\',false),(\'unverified-admin\',false)');
  await db.query("INSERT INTO staff_roles VALUES('admin','admin'),('moderator','moderator'),('unverified-admin','admin')");
  assert.equal((await registrationSettings(db)).requireEmailVerification,true);
  for(const user of ['member','moderator','unverified-admin'])await assert.rejects(saveRegistrationSettings(db,user,false,0),error=>error.status===403);
  const off=await saveRegistrationSettings(db,'admin',false,0);assert.equal(off.requireEmailVerification,false);assert.equal(off.revision,1);
  assert.equal((await db.query('SELECT "emailVerified" FROM "user" WHERE id=\'member\'')).rows[0].emailVerified,false);
  await assert.rejects(saveRegistrationSettings(db,'admin',true,0),error=>error.status===409);
  const result=await Promise.allSettled([saveRegistrationSettings(db,'admin',true,1),saveRegistrationSettings(db,'admin',true,1)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
  assert.equal((await registrationSettings(db)).revision,2);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM audit_events WHERE action='settings.registration'")).rows[0].n,2);
  await db.query("UPDATE staff_roles SET role='support' WHERE user_id='admin'");
  await assert.rejects(saveRegistrationSettings(db,'admin',false,2),error=>error.status===403);
 }finally{await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});

test('email policy is stamped at registration and survives later setting changes',async()=>{
 const root=new Pool({connectionString:process.env.DATABASE_URL,max:1}),schema='policy_test_'+randomUUID().replaceAll('-','');
 if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local test database only.');
 await root.query(`CREATE SCHEMA ${schema}`);
 const db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`,max:1});
 try{
  await db.query('CREATE TABLE "user"(id text PRIMARY KEY,"emailVerified" boolean)');
  await db.query(await readFile(new URL('../db/migrations/015_registration_settings.sql',import.meta.url),'utf8'));
  await db.query('INSERT INTO "user" VALUES(\'existing\',false)');
  await db.query('UPDATE application_settings SET require_email_verification=false');
  await db.query(await readFile(new URL('../db/migrations/016_registration_email_policy.sql',import.meta.url),'utf8'));
  await db.query('INSERT INTO "user"(id,"emailVerified") VALUES(\'registered-off\',false)');
  await db.query('UPDATE application_settings SET require_email_verification=true');
  await db.query('INSERT INTO "user"(id,"emailVerified","emailVerificationRequired") VALUES(\'registered-on\',false,false)');
  const rows=(await db.query('SELECT id,"emailVerified","emailVerificationRequired" AS required FROM "user" ORDER BY id')).rows;
  assert.deepEqual(rows,[{id:'existing',emailVerified:false,required:false},{id:'registered-off',emailVerified:false,required:false},{id:'registered-on',emailVerified:false,required:true}]);
  await db.query('UPDATE application_settings SET require_email_verification=false');
  assert.equal((await db.query('SELECT "emailVerificationRequired" AS required FROM "user" WHERE id=\'registered-on\'')).rows[0].required,true);
 }finally{await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});

test('historical registrations made while verification was off keep their exemption',async()=>{
 if(!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local test database only.');
 const root=new Pool({connectionString:process.env.DATABASE_URL,max:1}),schema='history_test_'+randomUUID().replaceAll('-','');await root.query(`CREATE SCHEMA ${schema}`);
 const db=new Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema},public`,max:1});
 try{
  await db.query('CREATE TABLE "user"(id text PRIMARY KEY,"emailVerified" boolean,"createdAt" timestamptz); CREATE TABLE audit_events(id bigserial PRIMARY KEY,action text,details jsonb,created_at timestamptz); CREATE TABLE schema_migrations(name text,applied_at timestamptz)');
  for(const file of ['015_registration_settings.sql','016_registration_email_policy.sql'])await db.query(await readFile(new URL('../db/migrations/'+file,import.meta.url),'utf8'));
  await db.query("INSERT INTO schema_migrations VALUES('016_registration_email_policy.sql',now()-interval '1 hour')");
  await db.query(`INSERT INTO audit_events(action,details,created_at) VALUES('settings.registration','{"previous":true,"required":false}',now()-interval '3 days'),('settings.registration','{"previous":false,"required":true}',now()-interval '1 day')`);
  await db.query(`INSERT INTO "user"(id,"emailVerified","createdAt") VALUES('old-required',false,now()-interval '4 days'),('old-exempt',false,now()-interval '2 days'),('new-required',false,now())`);
  await db.query(await readFile(new URL('../db/migrations/017_preserve_existing_registration_exemptions.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query('SELECT id,"emailVerificationRequired" AS required FROM "user" ORDER BY id')).rows,[{id:'new-required',required:true},{id:'old-exempt',required:false},{id:'old-required',required:true}]);
 }finally{await db.end();await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();}
});
