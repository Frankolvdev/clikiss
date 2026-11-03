import "server-only";
import {database} from "./db";

export async function isSuspended(userId:string){return Boolean((await database().query('SELECT 1 FROM profiles WHERE user_id=$1 AND suspended_at IS NOT NULL',[userId])).rowCount);}
export async function allowRequest(scope:string,actorId:string,limit:number,seconds=60){
 const bucket=Math.floor(Date.now()/(seconds*1000));
 const result=await database().query(`INSERT INTO rate_limits(scope,actor_id,bucket,count) VALUES($1,$2,$3,1)
 ON CONFLICT(scope,actor_id,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count`,[scope,actorId,bucket]);
 return result.rows[0].count<=limit;
}
