import 'server-only';
import {APIError,createAuthMiddleware} from 'better-auth/api';
import {loginSchema,registrationCredentialsSchema} from '../shared/auth-validation';

export const authFormValidation=createAuthMiddleware(async ctx=>{
 if(ctx.path!=='/sign-up/email'&&ctx.path!=='/sign-in/email')return;
 const registering=ctx.path==='/sign-up/email';
 const result=(registering?registrationCredentialsSchema:loginSchema).safeParse(ctx.body);
 if(!result.success)throw new APIError('BAD_REQUEST',{code:'INVALID_AUTH_INPUT',message:result.error.issues[0]?.message??'Revisa los datos del formulario.'});
 const {email,password}=result.data;
 const record=await ctx.context.internalAdapter.findUserByEmail(email,{includeAccounts:true});
 if(registering&&record?.user){
  await ctx.context.password.hash(password);
  throw new APIError('CONFLICT',{code:'EMAIL_ALREADY_REGISTERED',message:'Ya existe una cuenta con este correo. Inicia sesión para continuar.'});
 }
 if(!registering&&!record?.user){
  // Keep the existing password-work cost and the library's rate limiting.
  await ctx.context.password.hash(password);
  throw new APIError('UNAUTHORIZED',{code:'EMAIL_NOT_REGISTERED',message:'No existe una cuenta con este correo. Revisa que esté escrito correctamente.'});
 }
 if(!registering&&!record?.accounts.some(account=>account.providerId==='credential'&&account.accountId===record.user.id&&account.password)){
  await ctx.context.password.hash(password);
  throw new APIError('UNAUTHORIZED',{code:'PASSWORD_NOT_SET',message:'Esta cuenta usa un proveedor de acceso. Continúa con ese proveedor o restablece tu contraseña.'});
 }
 return {context:{body:{...ctx.body,...result.data}}};
});

export async function existingUserSignUp(){throw new APIError('CONFLICT',{code:'EMAIL_ALREADY_REGISTERED',message:'Ya existe una cuenta con este correo. Inicia sesión para continuar.'});}
