import {z} from 'zod';
import {registrationCredentialsSchema} from './auth-validation';

const reason=z.string().trim().min(5,'Explica el motivo con al menos 5 caracteres.').max(500,'Usa como máximo 500 caracteres.');
const target={userId:z.string().min(1).max(128),version:z.string().regex(/^[a-f0-9]{32}$/,'Actualiza la tabla antes de continuar.')};
const account=registrationCredentialsSchema.pick({name:true,email:true}).extend({verified:z.boolean()});
const passwords={password:registrationCredentialsSchema.shape.password,confirmPassword:z.string()};
export const adminUserSchema=z.discriminatedUnion('action',[
 account.extend({action:z.literal('create'),...passwords,reason}),
 account.extend({action:z.literal('edit'),...target,location:z.string().trim().max(100,'La ubicación admite hasta 100 caracteres.'),gender:z.string().trim().max(40,'El género admite hasta 40 caracteres.'),bio:z.string().trim().max(500,'La biografía admite hasta 500 caracteres.'),reason}),
 z.object({action:z.literal('password'),...target,...passwords,reason}),
 z.object({action:z.literal('delete'),...target,confirmEmail:z.string().trim().toLowerCase().pipe(z.email('Escribe el correo de la cuenta para confirmar la eliminación.')),reason}),
]).superRefine((value,ctx)=>{if('confirmPassword' in value&&value.password!==value.confirmPassword)ctx.addIssue({code:'custom',path:['confirmPassword'],message:'Las contraseñas no coinciden.'});});
export type AdminUserInput=z.infer<typeof adminUserSchema>;
