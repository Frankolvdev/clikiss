import { authentication } from "../../../../server/auth";
import {emailVerificationRequired} from '../../../../server/registration-settings';
import {database} from '../../../../server/db';
async function handler(request: Request) {
  try {
    let required=await emailVerificationRequired();
    if(request.method==='POST'&&new URL(request.url).pathname.endsWith('/sign-in/email')){
      const value=await request.clone().json().catch(()=>null);
      if(typeof value?.email==='string'&&value.email.length<=254){
        const account=(await database().query('SELECT "emailVerificationRequired" AS required FROM "user" WHERE lower(email)=$1',[value.email.trim().toLowerCase()])).rows[0];
        if(account)required=account.required!==false;
      }
    }
    return await authentication(required).handler(request);
  }
  catch { return Response.json({ message: "El acceso no está disponible. Inténtalo más tarde." }, { status: 503 }); }
}
export const GET = handler;
export const POST = handler;
