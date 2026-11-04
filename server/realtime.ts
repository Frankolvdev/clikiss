import "server-only";
import { randomBytes,createHash } from "node:crypto";
import { isSuspended,allowRequest } from "./access";
import { authentication } from "./auth";
import { database } from "./db";
import { HttpError,json } from "./http";
import {emailVerificationRequired} from './registration-settings';

export async function realtimeTicket(request:Request) {
 const session=await authentication().api.getSession({headers:request.headers});
 if(!session)throw new HttpError(401,"Inicia sesión para continuar.");
 if(!session.user.emailVerified&&await emailVerificationRequired())throw new HttpError(403,"Confirma tu correo para continuar.");
 if(await isSuspended(session.user.id))throw new HttpError(403,"Cuenta suspendida.");
 if(!await allowRequest("realtime",session.user.id,30))throw new HttpError(429,"Espera un momento.");
 const token=randomBytes(32).toString('base64url');
 const hash=createHash('sha256').update(token).digest('hex');
 const db=database();
 // Bound ticket accumulation and issue credentials tied to an active, revocable session.
 await db.query('DELETE FROM realtime_tickets WHERE expires_at<now()');
 await db.query('INSERT INTO realtime_tickets(token_hash,session_id,expires_at) VALUES($1,$2,now()+interval \'30 seconds\')',[hash,session.session.id]);
 return json({ticket:token});
}
