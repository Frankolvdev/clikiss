import 'server-only';
import {z} from 'zod';
import {hashPassword} from 'better-auth/crypto';
import {database} from './db';
import {allowRequest} from './access';
import {body,HttpError,json} from './http';
import {adminUserSchema} from '../shared/admin-user-validation';
import {AdminUserError,listAdminUsers,saveAdminUser} from '../shared/admin-users.mjs';

export async function adminUsers(request:Request,actorId:string,role:string){
 if(request.method==='GET')return json(await listAdminUsers(database(),new URL(request.url).searchParams));
 if(role!=='admin')throw new HttpError(403,'Solo administración puede crear, editar o eliminar cuentas y cambiar contraseñas.');
 if(!await allowRequest('admin-users-write',actorId,30))throw new HttpError(429,'Demasiados cambios. Espera un momento.');
 const parsed=adminUserSchema.safeParse(await body(request,z.unknown()));
 if(!parsed.success){const fieldErrors:Record<string,string>={};for(const issue of parsed.error.issues){const field=String(issue.path[0]??'form');fieldErrors[field]??=issue.message;}return json({message:'Revisa los campos indicados.',fieldErrors},400);}
 const value=parsed.data;
 const passwordHash='password' in value?await hashPassword(value.password):undefined;
 try{return json(await saveAdminUser(database(),actorId,value,passwordHash),value.action==='create'?201:200);}
 catch(error){if(error instanceof AdminUserError)return json({message:error.message,fieldErrors:error.field?{[error.field]:error.message}:{}},error.status);throw error;}
}
