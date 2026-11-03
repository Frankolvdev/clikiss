import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {hashPassword} from 'better-auth/crypto';
import nextEnv from '@next/env';
import {chromium} from 'playwright';
nextEnv.loadEnvConfig(process.cwd(),true);
const origin='http://localhost:3000';
assert(['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname));
const db=new Pool({connectionString:process.env.DATABASE_URL}),actor=randomUUID(),other=randomUUID(),conversation=randomUUID(),email=`alerts-${actor}@example.test`,password=`Qa!${randomUUID()}`;let browser;
try{
 for(const [id,name,address] of [[actor,'Avisos Local',email],[other,'María García',`${other}@example.test`]]){
  await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,name,address]);
  await db.query('INSERT INTO profiles(user_id,name,published) VALUES($1,$2,true)',[id,name]);
 }
 await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),actor,await hashPassword(password)]);
 await db.query('INSERT INTO conversations(id,user_low,user_high,kind) VALUES($1,LEAST($2::text,$3::text),GREATEST($2::text,$3::text),\'direct\')',[conversation,actor,other]);
 await db.query('INSERT INTO messages(id,conversation_id,sender_id,body) VALUES($1,$2,$3,$4)',[randomUUID(),conversation,other,'Hola, qué gusto conectar contigo.']);
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 assert((await context.request.post(origin+'/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok());
 const page=await context.newPage();await page.goto(origin);const trigger=page.getByRole('button',{name:'Notificaciones',exact:true});await trigger.waitFor();assert.equal(await trigger.count(),1);
 await trigger.click();const dialog=page.getByRole('dialog',{name:'Notificaciones',exact:true});await dialog.waitFor();await dialog.getByText('María García',{exact:true}).waitFor();await dialog.getByText('Hola, qué gusto conectar contigo.',{exact:true}).waitFor();assert.equal(await trigger.getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await dialog.getByRole('button',{name:/Sin leer/}).click();assert.equal(await dialog.locator('.notification-row').count(),1);await page.screenshot({path:'.data/qa/notifications-mobile.png'});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert(await trigger.evaluate(el=>el===document.activeElement));
 await trigger.click();await dialog.locator('.notification-row').click();await dialog.waitFor({state:'hidden'});await page.locator('.chat-header').getByText(/María García/).waitFor();
 await page.setViewportSize({width:1440,height:1000});assert.equal(await trigger.count(),1);await trigger.click();await dialog.waitFor();await dialog.getByRole('button',{name:/Sin leer/}).click();await dialog.getByRole('heading',{name:'Estás al día'}).waitFor();await page.screenshot({path:'.data/qa/notifications-desktop.png'});await dialog.getByRole('button',{name:'Cerrar notificaciones'}).click();await dialog.waitFor({state:'hidden'});
 console.log('OK: un solo icono móvil/escritorio, mensajes reales y filtros, navegación al chat y lectura, cierre con Escape, foco restaurado, panel móvil sin desbordamiento. Sin correos ni permisos solicitados.');
}catch(error){if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:'.data/qa/notifications-failure.png'});}throw error;}finally{
 if(browser)await browser.close();await db.query('DELETE FROM conversations WHERE id=$1',[conversation]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[[actor,other]]);await db.end();
}
