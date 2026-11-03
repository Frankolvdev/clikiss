import "server-only";
import {database} from "./db";
import {json,requireUser} from "./http";
export async function chatState(request:Request){
 const user=await requireUser(request);
 const rows=(await database().query(`SELECT CASE WHEN c.user_low=$1 THEN c.user_high ELSE c.user_low END AS "targetId",
  (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1 AND m.read_at IS NULL) AS unread,
  (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) AS preview
  FROM conversations c WHERE (c.user_low=$1 OR c.user_high=$1)
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=c.user_low AND b.target_id=c.user_high) OR (b.user_id=c.user_high AND b.target_id=c.user_low)) LIMIT 200`,[user.id])).rows;
 return json(rows);
}
