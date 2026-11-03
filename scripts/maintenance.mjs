import {Pool} from 'pg';
import {removeMedia} from '../shared/media-storage.mjs';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(),true);
const db=new Pool({connectionString:process.env.DATABASE_URL});
try{
 await db.query("UPDATE media_assets SET status='failed' WHERE status='processing' AND processing_attempts>=3 AND processing_started_at<now()-interval '5 minutes'");
 await db.query('DELETE FROM realtime_tickets WHERE expires_at<now()');
 await db.query('DELETE FROM chat_typing WHERE expires_at<now()');
 await db.query('DELETE FROM rate_limits WHERE bucket < floor(extract(epoch FROM now())/60)-120');
 await db.query("DELETE FROM posts p WHERE (p.expires_at<now()-interval '24 hours' OR p.deleted_at<now()-interval '24 hours') AND NOT EXISTS(SELECT 1 FROM reports r WHERE r.post_id=p.id)");
 await db.query(`WITH removed AS (DELETE FROM media_assets m WHERE m.created_at<now()-interval '24 hours'
  AND NOT EXISTS(SELECT 1 FROM posts p WHERE p.media_id=m.id)
  AND NOT EXISTS(SELECT 1 FROM profiles p WHERE p.avatar_id=m.id OR p.cover_id=m.id OR p.card_photo_id=m.id)
  RETURNING object_key,preview_key,loop_key)
 INSERT INTO media_deletions(object_key) SELECT object_key FROM removed UNION SELECT preview_key FROM removed WHERE preview_key IS NOT NULL UNION SELECT loop_key FROM removed WHERE loop_key IS NOT NULL ON CONFLICT DO NOTHING`);
 let deleted=0;
 for(const row of (await db.query('SELECT object_key FROM media_deletions ORDER BY created_at LIMIT 500')).rows){try{await removeMedia(row.object_key);await db.query('DELETE FROM media_deletions WHERE object_key=$1',[row.object_key]);deleted++;}catch{/* Retain the job for the next maintenance pass. */}}
 console.log(`Mantenimiento completado. Objetos eliminados: ${deleted}.`);
}finally{await db.end();}
