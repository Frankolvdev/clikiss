import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {chromium} from 'playwright';
import {hashPassword,verifyPassword} from 'better-auth/crypto';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local services only.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),ids=[],contexts=[],diagnostics=[];
const deletionKeys=[];
const tag=randomUUID(),password=`Original-${tag}!`,replacement=`Updated-${tag}!`,hash=await hashPassword(password);
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
await mkdir('.data/qa/admin-users',{recursive:true});
async function login(context,email,pass=password){
 for(let i=0;i<6;i++){
  const response=await context.request.post(origin+'/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password:pass}});
  if(response.status()!==429)return response;
  await new Promise(resolve=>setTimeout(resolve,Math.min(30000,Number(response.headers()['x-retry-after']??response.headers()['retry-after']??10)*1000+250)));
 }
 throw Error('Sign-in rate limit did not clear.');
}
const post=(context,data)=>context.request.post(origin+'/api/v1/admin/user-management',{headers:{Origin:origin},data});
const list=async(context,extra={})=>{const r=await context.request.get(origin+'/api/v1/admin/user-management?'+new URLSearchParams({draw:'7',start:'0',length:'10','search[value]':tag,...extra}));assert.equal(r.status(),200);return r.json();};
try{
 const fixtures={};
 for(const role of ['admin','moderator','support','member']){
  const id=randomUUID(),email=`admin-users-${role}-${tag}@example.test`;ids.push(id);
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,`QA ${role}`,email]);
  await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
  if(role!=='member')await db.query('INSERT INTO staff_roles VALUES($1,$2)',[id,role]);
  const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);assert.equal((await login(context,email)).status(),200);fixtures[role]={id,email,context};
 }
 const {admin,moderator,support,member}=fixtures;
 const create={action:'create',name:'QA Usuario administrado',email:`admin-users-created-${tag}@example.test`,password,confirmPassword:password,verified:true,reason:'Alta de prueba de gestión'};
 for(const actor of [moderator,support,member])assert.equal((await post(actor.context,create)).status(),403);
 assert.equal((await member.context.request.get(origin+'/api/v1/admin/user-management')).status(),403);
 assert.equal((await admin.context.request.post(origin+'/api/v1/admin/user-management',{headers:{Origin:'https://invalid.test'},data:create})).status(),403);
 const invalid=await post(admin.context,{...create,password:'short',confirmPassword:'different'});assert.equal(invalid.status(),400);assert((await invalid.json()).fieldErrors.password);
 const page=await admin.context.newPage();page.on('pageerror',error=>diagnostics.push(error.message));page.on('dialog',dialog=>{diagnostics.push('Unexpected browser dialog: '+dialog.message());void dialog.dismiss();});
 await page.goto(origin+'/admin');await page.getByRole('button',{name:'Usuarios',exact:true}).click();
 await page.getByRole('button',{name:'Registrar usuario',exact:true}).click();
 const modal=page.locator('dialog.admin-user-dialog');assert.equal(await modal.locator('form').evaluate(form=>form.noValidate),true);
 async function centered(element){const box=await element.boundingBox(),viewport=page.viewportSize();assert(box&&viewport);assert(Math.abs(box.x+box.width/2-viewport.width/2)<3,'Dialog must be horizontally centered');assert(Math.abs(box.y+box.height/2-viewport.height/2)<3,'Dialog must be vertically centered');}
 await centered(modal);
 await modal.getByRole('button',{name:'Crear cuenta',exact:true}).click();await modal.getByText('Escribe tu nombre.',{exact:true}).waitFor();
 await modal.getByLabel('Nombre',{exact:true}).fill(create.name);await modal.getByLabel('Correo electrónico',{exact:true}).fill(create.email);
 await modal.getByLabel('Contraseña',{exact:true}).fill(password);await modal.getByLabel('Confirmar contraseña',{exact:true}).fill(password);
 await modal.getByRole('checkbox').check();await modal.getByLabel('Motivo del cambio').fill(create.reason);
 const createdResponse=page.waitForResponse(r=>r.url().endsWith('/admin/user-management')&&r.request().method()==='POST');await modal.getByRole('button',{name:'Crear cuenta',exact:true}).click();const created=await createdResponse;assert.equal(created.status(),201);const createdId=(await created.json()).id;ids.push(createdId);await modal.waitFor({state:'hidden'});
 assert.equal((await post(admin.context,create)).status(),409);
 const persisted=(await db.query('SELECT password FROM account WHERE "userId"=$1',[createdId])).rows[0].password;assert.notEqual(persisted,password);assert(await verifyPassword({hash:persisted,password}));
 let data=await list(admin.context);assert.equal(data.draw,7);assert.equal(data.recordsFiltered,5);assert(data.recordsTotal>=data.recordsFiltered);assert.equal(data.data.length,5);assert(!JSON.stringify(data).includes(persisted));
 assert.equal((await list(admin.context,{role:'admin'})).recordsFiltered,1);assert.equal((await list(admin.context,{'search[value]':'%'+tag})).recordsFiltered,0);
 data=await list(admin.context,{'order[0][column]':'1','order[0][dir]':'asc',start:'1'});assert.equal(data.data.length,4);assert.deepEqual(data.data.map(u=>u.email),data.data.map(u=>u.email).sort());
 const row=(await list(admin.context)).data.find(u=>u.id===createdId);
 const edit={...row,userId:row.id,action:'edit',reason:'Actualización de perfil de prueba',name:'Qa Perfil Actualizado',location:'Ciudad de México',bio:'Biografía actualizada',gender:'Prefiero no decirlo'};
 for(const actor of [moderator,support])assert.equal((await post(actor.context,edit)).status(),403);
 assert.equal((await post(admin.context,edit)).status(),200);assert.equal((await post(admin.context,edit)).status(),409);
 assert.equal((await db.query('SELECT name FROM profiles WHERE user_id=$1',[createdId])).rows[0].name,edit.name);
 const search=page.locator('.dt-search input');await search.fill(create.email);await page.getByRole('button',{name:`Editar a ${edit.name}`,exact:true}).waitFor();
 await page.getByRole('button',{name:`Editar a ${edit.name}`,exact:true}).click();await modal.getByLabel('Nombre',{exact:true}).fill('Qa Perfil Desde Formulario');await modal.getByLabel('Motivo del cambio').fill('Edición desde el formulario');await modal.getByRole('button',{name:'Guardar cambios',exact:true}).click();await modal.waitFor({state:'hidden'});
 const target=await browser.newContext();contexts.push(target);assert.equal((await login(target,create.email)).status(),200);assert.equal((await target.request.get(origin+'/api/v1/me')).status(),200);
 const resetId=randomUUID();await db.query('INSERT INTO verification(id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 hour\',now(),now())',[resetId,'reset-password:'+randomUUID(),createdId]);
 const conversationId=randomUUID(),callId=randomUUID(),pair=[member.id,createdId].sort();
 await db.query("INSERT INTO conversations(id,user_low,user_high,kind) VALUES($1,$2,$3,'direct')",[conversationId,...pair]);
 await db.query("INSERT INTO video_calls(id,conversation_id,caller_id,callee_id,caller_client,status) VALUES($1,$2,$3,$4,$5,'active')",[callId,conversationId,member.id,createdId,randomUUID()]);
 await db.query('INSERT INTO video_call_slots(user_id,call_id) VALUES($1,$3),($2,$3)',[member.id,createdId,callId]);
 await page.getByRole('button',{name:'Cambiar contraseña de Qa Perfil Desde Formulario',exact:true}).click();await modal.getByLabel('Contraseña',{exact:true}).fill(replacement);await modal.getByLabel('Confirmar contraseña',{exact:true}).fill(replacement);await modal.getByLabel('Motivo del cambio').fill('Restablecimiento autorizado de prueba');await modal.getByRole('button',{name:'Guardar cambios',exact:true}).click();await modal.waitFor({state:'hidden'});
 assert.equal((await target.request.get(origin+'/api/v1/me')).status(),401);assert.equal((await db.query('SELECT 1 FROM verification WHERE id=$1',[resetId])).rowCount,0);
 assert.equal((await db.query('SELECT status FROM video_calls WHERE id=$1',[callId])).rows[0].status,'ended');assert.equal((await db.query('SELECT 1 FROM video_call_slots WHERE call_id=$1',[callId])).rowCount,0);
 const fresh=await browser.newContext();contexts.push(fresh);assert.equal((await login(fresh,create.email,password)).status(),401);assert.equal((await login(fresh,create.email,replacement)).status(),200);
 const latest=(await list(admin.context)).data.find(u=>u.id===createdId);
 assert.equal((await post(admin.context,{...latest,userId:latest.id,action:'edit',email:admin.email,reason:'Correo duplicado de prueba'})).status(),409);
 // Credential-less accounts can receive a password without losing their OAuth account.
 await db.query('DELETE FROM account WHERE "userId"=$1',[createdId]);
 const oauthId=randomUUID();await db.query('INSERT INTO account(id,"accountId","providerId","userId","createdAt","updatedAt") VALUES($1,$2,\'github\',$3,now(),now())',[oauthId,randomUUID(),createdId]);
 await db.query('UPDATE "user" SET "twoFactorEnabled"=true WHERE id=$1',[createdId]);
 assert.equal((await post(admin.context,{action:'password',userId:createdId,version:latest.version,password,confirmPassword:password,reason:'Añadir acceso por contraseña'})).status(),200);
 assert.equal((await db.query('SELECT 1 FROM account WHERE id=$1',[oauthId])).rowCount,1);assert.equal((await db.query('SELECT "twoFactorEnabled" FROM "user" WHERE id=$1',[createdId])).rows[0].twoFactorEnabled,true);
 const own=(await list(admin.context)).data.find(u=>u.id===admin.id);
 assert.equal((await post(admin.context,{...own,userId:own.id,action:'edit',verified:false,reason:'Comprobar protección del equipo'})).status(),400);
 const audits=(await db.query('SELECT details FROM audit_events WHERE actor_id=$1',[admin.id])).rows;assert(audits.length>=5);assert(!JSON.stringify(audits).includes(password));assert(!JSON.stringify(audits).includes(replacement));assert(!JSON.stringify(audits).includes(persisted));
 await page.locator('.dt-scroll-body').evaluate(el=>el.scrollLeft=0);await page.screenshot({path:'.data/qa/admin-users/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/qa/admin-users/mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page overflows');
 await page.getByRole('button',{name:'Registrar usuario',exact:true}).click();await modal.getByLabel('Nombre',{exact:true}).waitFor();await centered(modal);await page.screenshot({path:'.data/qa/admin-users/mobile-form.png'});await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
 const current=(await list(admin.context)).data.find(user=>user.id===createdId);
 const deletion={action:'delete',userId:createdId,version:current.version,confirmEmail:create.email,reason:'Eliminación autorizada de cuenta de prueba'};
 for(const actor of [moderator,support,member])assert.equal((await post(actor.context,deletion)).status(),403);
 assert.equal((await post(admin.context,{...deletion,userId:admin.id,version:own.version,confirmEmail:admin.email})).status(),403);
 assert.equal((await post(admin.context,{...deletion,confirmEmail:member.email})).status(),400);
 assert.equal((await post(admin.context,{...deletion,version:'0'.repeat(32)})).status(),409);
 const mediaId=randomUUID(),postId=randomUUID(),invitationId=randomUUID(),reviewId=randomUUID();deletionKeys.push('qa-delete-'+mediaId,'qa-delete-'+mediaId+'.preview','qa-delete-'+mediaId+'.loop');
 await db.query('INSERT INTO media_assets(id,owner_id,object_key,preview_key,loop_key,mime,bytes,status) VALUES($1,$2,$3,$4,$5,\'image/webp\',1,\'ready\')',[mediaId,createdId,...deletionKeys]);
 await db.query('UPDATE profiles SET avatar_id=$2,cover_id=$2,card_photo_id=$2 WHERE user_id=$1',[createdId,mediaId]);
 await db.query('INSERT INTO posts(id,author_id,media_id) VALUES($1,$2,$3)',[postId,createdId,mediaId]);
 await db.query('INSERT INTO review_invitations(id,owner_id,recipient_id) VALUES($1,$2,$3)',[invitationId,createdId,member.id]);
 await db.query('INSERT INTO reviews(id,invitation_id,body,stars) VALUES($1,$2,\'Reseña de prueba\',5)',[reviewId,invitationId]);
 await db.query('INSERT INTO reports(id,reporter_id,target_user_id,post_id,review_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),member.id,createdId,postId,reviewId]);
 const oldAuditId=(await db.query('INSERT INTO audit_events(actor_id,action,target_id) VALUES($1,\'qa.delete-fixture\',$2) RETURNING id',[createdId,member.id])).rows[0].id;
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Actualizar',exact:true}).click();
 await page.getByRole('button',{name:'Eliminar a Qa Perfil Desde Formulario',exact:true}).click();await centered(modal);
 await modal.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal((await db.query('SELECT 1 FROM "user" WHERE id=$1',[createdId])).rowCount,1);
 await page.getByRole('button',{name:'Eliminar a Qa Perfil Desde Formulario',exact:true}).click();await page.setViewportSize({width:390,height:844});await centered(modal);
 await modal.getByLabel('Correo para confirmar').fill(create.email);await modal.getByLabel('Motivo del cambio').fill(deletion.reason);await page.screenshot({path:'.data/qa/admin-users/delete-mobile.png'});
 await modal.getByRole('button',{name:'Eliminar definitivamente',exact:true}).click();await modal.waitFor({state:'hidden'});
 for(const [table,column] of [['user','id'],['account','userId'],['session','userId'],['profiles','user_id'],['media_assets','owner_id'],['posts','author_id']])assert.equal((await db.query(`SELECT 1 FROM "${table}" WHERE "${column}"=$1`,[createdId])).rowCount,0);
 assert.equal((await db.query('SELECT 1 FROM media_deletions WHERE object_key=ANY($1::text[])',[deletionKeys])).rowCount,3);
 assert.equal((await db.query('SELECT actor_id FROM audit_events WHERE id=$1',[oldAuditId])).rows[0].actor_id,null);
 assert.equal((await db.query("SELECT 1 FROM audit_events WHERE actor_id=$1 AND target_id=$2 AND action='user.delete'",[admin.id,createdId])).rowCount,1);
 assert.equal((await db.query('SELECT 1 FROM "user" WHERE id=$1',[member.id])).rowCount,1);
 await page.setViewportSize({width:1440,height:1000});await search.fill(member.email);await page.getByRole('button',{name:'Suspender cuenta',exact:true}).click();await centered(page.locator('.admin-confirm form'));await page.locator('.admin-confirm').getByRole('button',{name:'Cancelar',exact:true}).click();
 assert.deepEqual(diagnostics,[]);
 // Revoked privileges must also be checked inside the transaction.
 await db.query("UPDATE staff_roles SET role='support' WHERE user_id=$1",[admin.id]);assert.equal((await post(admin.context,create)).status(),403);
 await db.query("UPDATE staff_roles SET role='admin' WHERE user_id=$1",[admin.id]);
 await page.setViewportSize({width:1440,height:1000});await search.fill(admin.email);
 await page.getByRole('button',{name:'Cambiar contraseña de Qa Admin',exact:true}).click();await modal.getByLabel('Contraseña',{exact:true}).fill(replacement);await modal.getByLabel('Confirmar contraseña',{exact:true}).fill(replacement);await modal.getByLabel('Motivo del cambio').fill('Cambio de contraseña del propio administrador');await modal.getByRole('button',{name:'Guardar cambios',exact:true}).click();await modal.waitFor({state:'hidden'});
 await page.getByRole('heading',{name:'Qué gusto verte.',exact:true}).waitFor();assert.equal((await admin.context.request.get(origin+'/api/v1/admin/overview')).status(),401);
 console.log('Usuarios OK: DataTables, alta y edición por formulario, validadores, permisos, CSRF, duplicados, concurrencia, filtros/ordenación, hash de contraseña, cierre de sesiones, recuperación, auditoría y móvil.');
}catch(error){console.log(JSON.stringify({diagnostics}));for(const context of contexts)for(const page of context.pages())console.log(await page.locator('.admin-error,.admin-gate').allTextContents().catch(()=>[]));throw error;}
finally{
 await Promise.all(contexts.map(context=>context.close()));await browser.close();
 const extra=(await db.query('SELECT id FROM "user" WHERE email=$1',[`admin-users-created-${tag}@example.test`])).rows.map(u=>u.id);const all=[...ids,...extra];
 await db.query('DELETE FROM reports WHERE reporter_id=ANY($1::text[]) OR target_user_id=ANY($1::text[])',[all]);await db.query('DELETE FROM reviews WHERE invitation_id IN(SELECT id FROM review_invitations WHERE owner_id=ANY($1::text[]) OR recipient_id=ANY($1::text[]))',[all]);await db.query('UPDATE profiles SET avatar_id=NULL,cover_id=NULL,card_photo_id=NULL WHERE user_id=ANY($1::text[])',[all]);await db.query('DELETE FROM posts WHERE author_id=ANY($1::text[])',[all]);await db.query('DELETE FROM media_deletions WHERE object_key=ANY($1::text[])',[deletionKeys]);
 await db.query('DELETE FROM audit_events WHERE actor_id=ANY($1::text[]) OR target_id=ANY($1::text[])',[all]);await db.query('DELETE FROM rate_limits WHERE actor_id=ANY($1::text[])',[all]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[all]);await db.end();
}
