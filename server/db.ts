import "server-only";
import { Pool } from "pg";

const shared = globalThis as unknown as { conectaPool?: Pool };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!shared.conectaPool) shared.conectaPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
  return shared.conectaPool;
}
