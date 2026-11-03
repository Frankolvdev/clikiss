import { randomBytes } from "node:crypto";
import { readFile,writeFile } from "node:fs/promises";
let env=await readFile('.env.local','utf8').catch(()=> '');
const password=randomBytes(24).toString('hex');
const settings={POSTGRES_PASSWORD:password,POSTGRES_PORT:'25432',DATABASE_URL:`postgresql://conecta:${password}@127.0.0.1:25432/conecta`,APP_URL:'http://localhost:3000',BETTER_AUTH_SECRET:randomBytes(48).toString('hex'),MEDIA_ROOT:'.data/media'};
if(/^DATABASE_URL=/m.test(env)){console.log('DATABASE_URL ya existe; configuración conservada.');process.exit(0);}
for(const [key,value] of Object.entries(settings))if(!new RegExp(`^${key}=`,'m').test(env))env+=`\n${key}=${value}`;
await writeFile('.env.local',env.trim()+'\n',{mode:0o600});
console.log('Configuración local creada. No compartas .env.local.');
