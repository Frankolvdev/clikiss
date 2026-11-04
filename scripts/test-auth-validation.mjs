import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {Pool} from 'pg';
import {hashPassword} from 'better-auth/crypto';
import {chromium} from 'playwright';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw Error('Local test services only.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),users=[],contexts=[],diagnostics=[];
const password=`Valid-${randomUUID()}!`,hash=await hashPassword(password);
const email=`validation-${randomUUID()}@example.test`,id=randomUUID();users.push(id);
await mkdir('.data/qa/auth-validation',{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
async function submit(page,label,path){
 for(let i=0;i<6;i++){
  const responsePromise=page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST');
  await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();
  const response=await responsePromise;
  if(response.status()!==429)return response;
  const headers=response.headers();await new Promise(resolve=>setTimeout(resolve,Math.min(30000,(Number(headers['x-retry-after']??headers['retry-after'])||10)*1000+500)));
 }
 throw Error('Authentication remained rate limited.');
}
try{
 await db.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',[id,'Validación QA',email]);
 await db.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,now(),now())',[randomUUID(),id,hash]);
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1050}});contexts.push(context);
  const page=await context.newPage();page.on('pageerror',error=>diagnostics.push(error.message));
  let requests=0;page.on('request',request=>{if(request.method()==='POST'&&/\/api\/auth\/(?:sign-up|sign-in)\/email$/.test(request.url()))requests++;});
  await page.goto(origin);await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  await page.evaluate(()=>{window.__nativeInvalid=0;document.addEventListener('invalid',()=>window.__nativeInvalid++,true);});
  assert.equal(await dialog.locator('form').evaluate(form=>form.noValidate),true);
  await dialog.getByRole('button',{name:'Crear mi cuenta',exact:true}).click();
  await dialog.getByText('Escribe tu nombre.',{exact:true}).waitFor();await dialog.getByText('Escribe tu correo electrónico.',{exact:true}).waitFor();
  assert.equal(await dialog.locator('input[name="name"]').evaluate(input=>input===document.activeElement),true);
  assert.equal(requests,0);
  await dialog.getByLabel('Tu nombre',{exact:true}).fill('Usuario válido');await dialog.getByLabel('Correo electrónico',{exact:true}).fill('correo-invalido');await dialog.getByLabel('Contraseña',{exact:true}).fill('corta');
  await dialog.getByRole('button',{name:'Crear mi cuenta',exact:true}).click();
  await dialog.getByText('Escribe un correo válido, por ejemplo: nombre@dominio.com.',{exact:true}).waitFor();await dialog.getByText('Usa al menos 12 caracteres para tu contraseña.',{exact:true}).waitFor();
  await dialog.getByText('Confirma que tienes al menos 18 años para crear tu cuenta.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__nativeInvalid),0);assert.equal(requests,0);
  await page.screenshot({path:`.data/qa/auth-validation/register-${width}.png`});
  await dialog.getByLabel('Correo electrónico',{exact:true}).fill(email.toUpperCase());await dialog.getByLabel('Contraseña',{exact:true}).fill(password);await dialog.getByRole('checkbox',{name:'Confirmo que tengo 18 años o más.'}).check();
  const duplicate=await submit(page,'Crear mi cuenta','/api/auth/sign-up/email');assert.equal(duplicate.status(),409);
  assert.equal((await duplicate.json()).code,'EMAIL_ALREADY_REGISTERED');
  await dialog.getByRole('heading',{name:'Qué gusto verte.',exact:true}).waitFor();await dialog.getByText('Ya existe una cuenta con este correo. Inicia sesión para continuar.',{exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('Correo electrónico',{exact:true}).inputValue(),email);assert.equal(await dialog.getByLabel('Contraseña',{exact:true}).inputValue(),'');
  assert.equal(await dialog.getByLabel('Contraseña',{exact:true}).evaluate(input=>input===document.activeElement),true);
  await dialog.getByLabel('Contraseña',{exact:true}).fill('Contraseña incorrecta para QA');const wrong=await submit(page,'Iniciar sesión','/api/auth/sign-in/email');assert.equal(wrong.status(),401);
  await dialog.getByText('Tu contraseña es incorrecta.',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Contraseña',{exact:true}).getAttribute('aria-invalid'),'true');
  await dialog.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();assert.equal(await dialog.getByLabel('Contraseña',{exact:true}).getAttribute('type'),'text');await dialog.getByText('Tu contraseña es incorrecta.',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();
  await page.screenshot({path:`.data/qa/auth-validation/login-${width}.png`});
  await dialog.getByLabel('Correo electrónico',{exact:true}).fill(`missing-${randomUUID()}@example.test`);const missing=await submit(page,'Iniciar sesión','/api/auth/sign-in/email');assert.equal(missing.status(),401);assert.equal((await missing.json()).code,'EMAIL_NOT_REGISTERED');
  await dialog.getByText('No existe una cuenta con este correo. Revisa que esté escrito correctamente.',{exact:true}).waitFor();
  await dialog.getByLabel('Correo electrónico',{exact:true}).fill(email);await dialog.getByLabel('Contraseña',{exact:true}).fill(password);
  const valid=await submit(page,'Iniciar sesión','/api/auth/sign-in/email');assert.equal(valid.status(),200);await dialog.waitFor({state:'hidden'});assert.equal((await context.request.get(origin+'/api/v1/me')).status(),200);
 }
 // The server must enforce validation even when browser checks are bypassed.
 const invalid=await contexts[0].request.post(origin+'/api/auth/sign-up/email',{headers:{Origin:origin},data:{name:'',email:'invalid',password:'short'}});assert.equal(invalid.status(),400);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "user" WHERE lower(email)=lower($1)',[email])).rows[0].n,1);
 assert.deepEqual(diagnostics,[]);
 console.log('Validaciones OK: campos personalizados sin HTML5, foco accesible, errores por campo, correo conservado al pasar a login, contraseña incorrecta, correo inexistente, ojito, acceso correcto y validación del servidor; escritorio y móvil.');
}catch(error){for(const [i,context] of contexts.entries())for(const page of context.pages())await page.screenshot({path:`.data/qa/auth-validation/failure-${i}.png`}).catch(()=>{});console.log(JSON.stringify({diagnostics}));throw error;}
finally{await Promise.all(contexts.map(context=>context.close()));await browser.close();await db.query('DELETE FROM rate_limits WHERE actor_id=ANY($1::text[])',[users]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[users]);await db.end();}
