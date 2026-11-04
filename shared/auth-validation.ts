import {z} from 'zod';
import {normalizePersonName} from './person-name.mjs';

export type AuthMode='login'|'register'|'forgot'|'reset'|'verify'|'factor';
export type AuthValues={name:string;email:string;password:string;consent:boolean;factorCode:string};
export type AuthField=keyof AuthValues;
export type AuthFieldErrors=Partial<Record<AuthField,string>>;
const email=z.string().trim().min(1,'Escribe tu correo electrónico.').toLowerCase().pipe(z.email('Escribe un correo válido, por ejemplo: nombre@dominio.com.').max(254,'El correo es demasiado largo.'));
const password=z.string().min(1,'Escribe tu contraseña.').max(128,'La contraseña debe tener como máximo 128 caracteres.');
const newPassword=password.min(12,'Usa al menos 12 caracteres para tu contraseña.').refine(value=>value.trim().length>0,'La contraseña no puede contener solo espacios.');
const name=z.string().transform(normalizePersonName).pipe(z.string().min(1,'Escribe tu nombre.').max(80,'Tu nombre debe tener como máximo 80 caracteres.').regex(/\p{L}/u,'Escribe un nombre que contenga letras.'));
export const loginSchema=z.object({email,password});
export const registrationCredentialsSchema=z.object({name,email,password:newPassword});
const registrationSchema=registrationCredentialsSchema.extend({consent:z.literal(true,{error:'Confirma que tienes al menos 18 años para crear tu cuenta.'})});

export function validateAuthForm(mode:AuthMode,input:AuthValues,backupCode=false):{values:AuthValues;errors:AuthFieldErrors}{
 const schema=mode==='register'?registrationSchema:mode==='login'?loginSchema:mode==='reset'?z.object({password:newPassword}):mode==='factor'?z.object({factorCode:backupCode?z.string().trim().min(1,'Escribe tu código de recuperación.').max(128,'Revisa tu código de recuperación.'):z.string().transform(value=>value.replace(/\s/g,'')).pipe(z.string().regex(/^\d{6}$/,'Escribe los 6 dígitos de tu aplicación de autenticación.'))}):z.object({email});
 const result=schema.safeParse(input);
 const errors:AuthFieldErrors={};
 if(!result.success){for(const issue of result.error.issues){const field=issue.path[0] as AuthField;if(!errors[field])errors[field]=issue.message;}return {values:input,errors};}
 return {values:{...input,...result.data},errors};
}
