import "server-only";
import nodemailer from "nodemailer";
import {database} from "./db";

export async function sendAccountMail(to:string,subject:string,url:string) {
 if((await database().query('SELECT 1 FROM "user" u JOIN profiles p ON p.user_id=u.id WHERE lower(u.email)=lower($1) AND p.synthetic',[to])).rowCount)return;
 const host=process.env.SMTP_HOST??(process.env.NODE_ENV==='production'?undefined:'127.0.0.1');
 if(!host)throw new Error('SMTP_NOT_CONFIGURED');
 const local=['127.0.0.1','localhost'].includes(host);
 if(!local&&!process.env.MAIL_FROM)throw new Error('MAIL_FROM_NOT_CONFIGURED');
 const transport=nodemailer.createTransport({host,port:Number(process.env.SMTP_PORT??1025),secure:process.env.SMTP_SECURE==='true',
 ...(!local&&process.env.SMTP_SECURE!=='true'?{requireTLS:true}:{}),
 ...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD??''}}:{}),
 connectionTimeout:10000,socketTimeout:15000});
 await transport.sendMail({from:(process.env.MAIL_FROM??'CliKiss <cuentas@localhost>').replace(/^(?:Conecta|ClicKiss|Clickiss)(?=\s*<)/,'CliKiss'),to,subject,
 text:`${subject}\n\nAbre este enlace para continuar:\n${url}\n\nSi no solicitaste este correo, puedes ignorarlo.\nCliKiss`});
}
