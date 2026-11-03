import {Pool} from 'pg';
import nextEnv from '@next/env';
import {populationCatalog,sourceBytes} from '../shared/folder-population.mjs';
import {avatarLoop} from '../shared/video-preview.mjs';
import {putMedia} from '../shared/media-storage.mjs';
nextEnv.loadEnvConfig(process.cwd(),true);
const db=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const catalog=await populationCatalog();let count=0,total=0;
 for(const person of catalog){
  const file=person.files.find((item)=>item.kind==='profile'&&item.video);if(!file)continue;
  const target=(await db.query('SELECT p.avatar_id,m.loop_key FROM test_accounts t JOIN profiles p ON p.user_id=t.user_id JOIN media_assets m ON m.id=p.avatar_id WHERE t.population_key=$1',[person.key])).rows[0];
  if(!target||target.loop_key)continue;
  const bytes=await avatarLoop(await sourceBytes(person,file)),key=`${target.avatar_id}.loop`;
  await putMedia(key,bytes,'video/mp4');await db.query('UPDATE media_assets SET loop_key=$2 WHERE id=$1',[target.avatar_id,key]);
  count++;total+=bytes.length;console.log(`${person.key}: ${(bytes.length/1024).toFixed(1)} KB`);
 }
 console.log(`Avatares animados preparados: ${count}. Total: ${(total/1024).toFixed(1)} KB.`);
}finally{await db.end();}
