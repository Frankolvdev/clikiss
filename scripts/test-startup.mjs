import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw Error('Local services only.');
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
try{
 for(const test of [{name:'fresh-desktop',width:1440},{name:'fresh-mobile',width:390},{name:'pending-session-and-options',width:390,blocked:true},{name:'first-profile-request-fails',width:1440,failures:1},{name:'manual-profile-recovery',width:390,failures:2},{name:'slow-profiles',width:390,slow:true},{name:'stalled-profiles',width:390,stalled:true}]){
  const context=await browser.newContext({viewport:{width:test.width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  let documents=0;page.on('request',request=>{if(request.resourceType()==='document')documents++;});page.on('pageerror',error=>errors.push(error.message));
  if(test.blocked){
   await page.route('**/api/auth/get-session',()=>{});
   await page.route('**/api/v1/auth-options',()=>{});
  }
  let profileRequests=0,recover=false;
  if(test.failures||test.slow||test.stalled)await page.route('**/api/v1/profiles',async route=>{
   profileRequests++;
   if(test.stalled&&!recover)return;
   if(profileRequests<=(test.failures??0)){await route.fulfill({status:503,json:{message:'Temporary first-request failure'}});return;}
   if(test.slow)await new Promise(resolve=>setTimeout(resolve,4000));
   await route.continue();
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('.topbar').waitFor({timeout:5000});
  await page.locator('.app-splash').waitFor({state:'visible',timeout:1000});
  assert.equal(await page.locator('.app-splash').count(),1);
  assert.equal(await page.locator('.splash-promise').count(),0);
  if(test.slow){await new Promise(resolve=>setTimeout(resolve,2000));assert.equal(await page.locator('.app-splash').count(),1,'Splash must wait for real profile content, not just a fixed timer');}
  await page.locator('.app-splash').waitFor({state:'detached',timeout:10000});
  assert.equal(await page.locator('.app-splash').count(),0);
  if(test.failures===2||test.stalled){recover=true;await page.locator('.directory-loading button').click();}
  await page.locator('.adventure-tile').first().waitFor({timeout:15000});
  await page.locator('.experience-connections').click();await page.locator('.profile-card-wrap').waitFor({timeout:5000});
  await page.getByRole('button',{name:'Notificaciones',exact:true}).click();await page.getByRole('dialog').waitFor({timeout:5000});
  assert.equal(documents,1,'The first visit must not require a reload');assert.deepEqual(errors,[]);
  if(test.failures)assert(profileRequests>test.failures,'Failed profile requests must recover without navigation');
  await context.close();console.log(`Startup OK: ${test.name}, real profiles and section changes without reloading, protected account actions.`);
 }
 const context=await browser.newContext({javaScriptEnabled:false,reducedMotion:'reduce'}),page=await context.newPage();
 await page.goto(origin,{waitUntil:'domcontentloaded'});await page.locator('.app-splash').waitFor({state:'hidden',timeout:10000});
 assert.equal(await page.locator('.app-splash').evaluate(element=>getComputedStyle(element).pointerEvents),'none');
 await context.close();console.log('Startup OK: CSS releases the overlay even without hydration.');
}finally{await browser.close();}
