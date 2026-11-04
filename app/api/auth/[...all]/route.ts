import { authentication } from "../../../../server/auth";
import {emailVerificationRequired} from '../../../../server/registration-settings';
async function handler(request: Request) {
  try { return await authentication(await emailVerificationRequired()).handler(request); }
  catch { return Response.json({ message: "El acceso no está disponible. Inténtalo más tarde." }, { status: 503 }); }
}
export const GET = handler;
export const POST = handler;
