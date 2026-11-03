import nodemailer from 'nodemailer';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),true);
const host=process.env.SMTP_HOST;
if(!host)throw new Error('SMTP_HOST no configurado.');
const secure=process.env.SMTP_SECURE==='true';
const transport=nodemailer.createTransport({host,port:Number(process.env.SMTP_PORT??587),secure,
 ...(!secure&&!['localhost','127.0.0.1'].includes(host)?{requireTLS:true}:{}),
 auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,socketTimeout:15000});
try{await transport.verify();console.log('Conexion TLS y autenticacion SMTP correctas. No se envio ningun correo.');}
catch(error){console.error('No se pudo verificar SMTP:',error.code??'ERROR');process.exitCode=1;}
finally{transport.close();}
