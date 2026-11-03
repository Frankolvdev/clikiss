import {chromium} from 'playwright';
import {Pool} from 'pg';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import nextEnv from '@next/env';
import {verifyAccount} from './mail-test-helpers.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname)||!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))throw new Error('Solo se permite QA local.');
const db=new Pool({connectionString:process.env.DATABASE_URL}),ids=[];
const browser=await chromium.launch({channel:'msedge',headless:true});
await mkdir('.data/qa',{recursive:true});
const contexts=[];
function totp(secret){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,''))bits+=alphabet.indexOf(char).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g).map((byte)=>parseInt(byte,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=createHmac('sha1',key).update(counter).digest(),offset=digest[19]&15;return String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');}
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
 const page=await context.newPage(),email=`qa-${randomUUID()}@example.test`,password=`Qa-${randomUUID()}!`;
 await page.goto(origin);await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
 await page.getByRole('textbox',{name:'Tu nombre',exact:true}).fill('Administración QA');
 await page.getByRole('textbox',{name:'Correo electrónico'}).fill(email);
 await page.getByLabel('Contraseña',{exact:true}).fill(password);
 await page.getByRole('checkbox',{name:'Confirmo que tengo 18 años o más.'}).check();
 await page.getByRole('dialog').getByRole('button',{name:'Crear mi cuenta',exact:true}).click();await page.getByRole('heading',{name:'Confirma tu correo.',exact:true}).waitFor();
 const id=(await db.query('SELECT id FROM "user" WHERE email=$1',[email])).rows[0].id;ids.push(id);await verifyAccount(email);
 await page.getByRole('button',{name:'¿Ya tienes cuenta? Inicia sesión',exact:true}).click();await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).last().click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 const me=await context.request.get(origin+'/api/v1/me');if(me.status()!==200)throw new Error('La sesión del navegador no se creó.');
 await db.query("INSERT INTO staff_roles(user_id,role) VALUES($1,'admin')",[id]);
 await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Resumen',exact:true}).waitFor();
 await page.screenshot({path:'.data/qa/admin-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Activar segundo factor'}).click();await page.getByLabel('Contraseña de tu cuenta',{exact:true}).fill(password);await page.getByRole('button',{name:'Preparar segundo factor'}).click();
 const secret=await page.locator('.admin-secret').first().innerText();await page.getByLabel('Código del autenticador',{exact:true}).fill(totp(secret));await page.getByRole('button',{name:'Verificar y activar'}).click();await page.getByRole('heading',{name:'Protege tu acceso con dos factores',exact:true}).waitFor({state:'hidden'});
 const enabled=(await db.query('SELECT "twoFactorEnabled" FROM "user" WHERE id=$1',[id])).rows[0].twoFactorEnabled;if(!enabled)throw new Error('No se activó TOTP.');
 await context.request.post(origin+'/api/auth/sign-out',{data:{},headers:{Origin:origin}});
 const signin=await context.request.post(origin+'/api/auth/sign-in/email',{data:{email,password},headers:{Origin:origin}});
 if(!(await signin.json()).twoFactorRedirect)throw new Error('Falta el desafío de segundo factor.');
 const factor=await context.request.post(origin+'/api/auth/two-factor/verify-totp',{data:{code:totp(secret)},headers:{Origin:origin}});
 if(!factor.ok())throw new Error('No se pudo iniciar sesión con TOTP.');
 await page.goto(origin);await page.getByRole('button',{name:'Mapa y radar',exact:false}).click();
 const errors=[];page.on('console',(message)=>{const match=message.text().match(/(?:Google Maps JavaScript API error:|Google Maps JavaScript API warning:)\s*([A-Za-z]+)/);if(match)errors.push(match[1]);});
 let maps='not-loaded';
 try{await page.locator('.gm-style').first().waitFor({timeout:20000});await page.waitForTimeout(1500);maps=errors.length?'authorization-error':'rendered';}catch{maps='not-rendered';}
 await page.screenshot({path:'.data/qa/maps-desktop.png',fullPage:true});
 if(maps==='rendered'){
  await page.getByRole('button',{name:'Radar',exact:true}).click();await page.locator('.radar-sweep').waitFor();
  const search=page.locator('gmp-place-autocomplete');await search.click();await page.keyboard.type('Guadalajara',{delay:100});await page.waitForTimeout(1200);await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.locator('.location-footer').getByText(/Guadalajara/).waitFor({timeout:10000});
  await page.getByRole('button',{name:'Buscar aquí',exact:true}).click();
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.data/qa/maps-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('La vista m?vil desborda horizontalmente.');await page.goto(origin+'/admin');await page.getByRole('heading',{name:'Resumen',exact:true}).waitFor();await page.screenshot({path:'.data/qa/admin-mobile.png',fullPage:true});
 console.log(JSON.stringify({registration:'passed',emailVerification:'passed',login:'passed',admin:'passed',totp:'passed',maps,googleErrors:[...new Set(errors)],screenshots:'.data/qa'},null,2));
}finally{
 for(const context of contexts)await context.close();await browser.close();if(ids.length){await db.query('DELETE FROM audit_events WHERE actor_id=ANY($1::text[])',[ids]);await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[ids]);}await db.end();
}
