import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { database } from "./db";
import { sendAccountMail } from "./mail";
import {twoFactor} from "better-auth/plugins";
import {normalizePersonName} from "../shared/person-name.mjs";

let instance: ReturnType<typeof betterAuth> | undefined;
export function authentication() {
  if (!process.env.BETTER_AUTH_SECRET || !process.env.APP_URL) throw new Error("AUTH_NOT_CONFIGURED");
  if (!instance) { const options: BetterAuthOptions = {
    database: database(), secret: process.env.BETTER_AUTH_SECRET,
    databaseHooks: {user: {
      create: {before: async (user) => ({data: {...user,name:normalizePersonName(user.name)}})},
      update: {before: async (user) => ({data: {...user,...(typeof user.name==='string'?{name:normalizePersonName(user.name)}:{})}})},
    }},
    plugins:[twoFactor({issuer:'Conecta'})],
    baseURL: process.env.APP_URL,
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128,
      requireEmailVerification: true, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({user,url}) => { await sendAccountMail(user.email,'Restablece tu contraseña de Conecta',url); },
    },
    emailVerification: { sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({user,url}) => { await sendAccountMail(user.email,'Confirma tu cuenta de Conecta',url); },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    socialProviders: {
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } } : {}),
      ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET ? { facebook: { clientId: process.env.FACEBOOK_CLIENT_ID, clientSecret: process.env.FACEBOOK_CLIENT_SECRET } } : {}),
      ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET ? { apple: { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET } } : {}),
      ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET ? { microsoft: { clientId: process.env.MICROSOFT_CLIENT_ID, clientSecret: process.env.MICROSOFT_CLIENT_SECRET } } : {}),
    },
    rateLimit: { enabled: true, window: 60, max: 60 },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  }; instance = betterAuth(options); }
  return instance;
}
