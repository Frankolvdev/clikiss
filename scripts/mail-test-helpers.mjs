import assert from 'node:assert/strict';
export async function accountMail(email,subject){
 const origin=process.env.MAILPIT_URL??'http://127.0.0.1:8025';
 if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('El buzón de pruebas debe ser local.');
 for(let attempt=0;attempt<20;attempt++){
  const inbox=await fetch(`${origin}/api/v1/messages?limit=200`).then((response)=>response.json());
  const item=inbox.messages.find((message)=>message.Subject.includes(subject)&&message.To.some((to)=>to.Address.toLowerCase()===email.toLowerCase()));
  if(item)return fetch(`${origin}/api/v1/message/${item.ID}`).then((response)=>response.json());
  await new Promise((resolve)=>setTimeout(resolve,250));
 }
 throw new Error('No llegó el correo al buzón local.');
}
export async function verifyAccount(email){
 const mail=await accountMail(email,'Confirma'),link=mail.Text.match(/https?:\/\/\S+/)?.[0];
 assert(link,'Correo sin enlace de confirmación.');
 const url=new URL(link);assert.equal(url.origin,new URL(process.env.APP_URL).origin);url.searchParams.delete('callbackURL');
 const response=await fetch(url);assert.equal(response.status,200,'La confirmación del correo falló.');
}
