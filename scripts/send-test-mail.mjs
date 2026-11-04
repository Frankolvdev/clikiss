import nodemailer from 'nodemailer';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),true);
const to=process.argv[2];
if(!to||!process.env.MAIL_FROM)throw new Error('Indica destinatario y configura MAIL_FROM.');
const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:process.env.SMTP_SECURE==='true',requireTLS:process.env.SMTP_SECURE!=='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,socketTimeout:15000});
try{const result=await transport.sendMail({from:process.env.MAIL_FROM,to,subject:'CliKiss: prueba de correo',text:'Este es el mensaje de prueba de CliKiss que solicitaste. La plataforma ya puede entregar solicitudes de confirmación y recuperación al servidor de correo. No necesitas responder ni abrir ningún enlace.'});console.log(JSON.stringify({accepted:result.accepted.length,rejected:result.rejected.length}));}
catch(error){console.error('No se pudo enviar la prueba:',error.code??'ERROR');process.exitCode=1;}
finally{transport.close();}
