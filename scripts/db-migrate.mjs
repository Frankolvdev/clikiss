import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
import nextEnv from "@next/env";
import {twoFactor} from 'better-auth/plugins';

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("Configura DATABASE_URL en .env.local.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(73190210)");
  // Use the installed library's schema, including its password/session fields.
  const auth = await getMigrations({ database: pool, emailAndPassword: { enabled: true },plugins:[twoFactor({issuer:'CliKiss'})] });
  await auth.runMigrations();
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  for (const name of (await readdir(new URL("../db/migrations/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = await readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await client.query("SELECT checksum FROM schema_migrations WHERE name=$1", [name]);
    if (applied.rowCount) { if (applied.rows[0].checksum !== checksum) throw new Error(`No edites una migración aplicada: ${name}`); continue; }
    await client.query("BEGIN");
    try { await client.query(sql); await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",[name,checksum]); await client.query("COMMIT"); console.log(`Aplicada: ${name}`); }
    catch (error) { await client.query("ROLLBACK"); throw error; }
  }
} finally { await client.query("SELECT pg_advisory_unlock(73190210)"); client.release(); await pool.end(); }
