import "server-only";
import { z } from "zod";
import { authentication } from "./auth";
import { isSuspended,allowRequest } from "./access";
import {emailVerificationRequired} from './registration-settings';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function viewer(request: Request) {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;
  const session = await authentication().api.getSession({ headers: request.headers });
  if(session&&await isSuspended(session.user.id))throw new HttpError(403,"Esta cuenta está suspendida. Contacta con soporte.");
  return session?.user ?? null;
}
export async function requireUser(request: Request) {
  const user = await viewer(request);
  if (!user) throw new HttpError(401, "Inicia sesión para continuar.");
  if (!user.emailVerified&&await emailVerificationRequired()) throw new HttpError(403, "Confirma tu correo para continuar.");
  if(!['GET','HEAD'].includes(request.method)&&!await allowRequest(new URL(request.url).pathname.split("/").slice(0,4).join("/"),user.id,120))throw new HttpError(429,"Demasiadas solicitudes. Espera un momento.");
  return user;
}
export function checkOrigin(request: Request) {
  const expected = process.env.APP_URL;
  if (!expected || request.headers.get("origin") !== new URL(expected).origin) throw new HttpError(403,"Origen no permitido.");
}
export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (Number(request.headers.get("content-length")) > 64000) throw new HttpError(413,"Solicitud demasiado grande.");
  try {
    if(!request.body)throw new Error('BODY_REQUIRED');
    const reader=request.body.getReader();let size=0;const parts:Uint8Array[]=[];
    while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>64000){await reader.cancel();throw new HttpError(413,'Solicitud demasiado grande.');}parts.push(result.value);}
    return schema.parse(JSON.parse(Buffer.concat(parts).toString('utf8')));
  }
  catch(error) { if(error instanceof HttpError)throw error;throw new HttpError(400,"Revisa los datos enviados."); }
}
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ message: error.message },error.status);
  if (error instanceof z.ZodError) return json({ message: "Revisa los datos enviados." },400);
  // Never return SQL, connection URLs, credentials or internal errors to the browser.
  return json({ message: "El servicio no está disponible. Inténtalo más tarde." },503);
}
