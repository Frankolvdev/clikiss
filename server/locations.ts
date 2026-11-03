import "server-only";
import {z} from "zod";
import {database} from "./db";
import {body,json,requireUser} from "./http";
import {publicProfileSql,ensureProfile} from "./profiles";

export async function saveLocation(request:Request){
 const user=await requireUser(request);
 if(request.method==='GET'){const value=(await database().query('SELECT latitude,longitude,location AS label,radar_visible AS visible FROM profiles WHERE user_id=$1',[user.id])).rows[0];return json(value??{visible:false});}
 const value=await body(request,z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),label:z.string().trim().min(1).max(100),visible:z.boolean()}));
 await ensureProfile(user.id,user.name);
 // Persist only an approximate area (~1 km), never the device's exact location.
 await database().query('UPDATE profiles SET latitude=$2,longitude=$3,location=$4,radar_visible=$5,updated_at=now() WHERE user_id=$1',[user.id,Math.round(value.latitude*100)/100,Math.round(value.longitude*100)/100,value.label,value.visible]);
 return json({ok:true});
}
export async function nearby(request:Request){
 const user=await requireUser(request),params=new URL(request.url).searchParams;
 const lat=z.coerce.number().min(-90).max(90).parse(params.get('lat')??NaN);
 const lng=z.coerce.number().min(-180).max(180).parse(params.get('lng')??NaN);
 const radius=z.coerce.number().min(1).max(200).parse(params.get('radius')??20);
 const mode=z.enum(['all','adventure','connections']).parse(params.get('mode')??'all');
 const base=publicProfileSql.replace('NULL::double precision AS distance','p.latitude,p.longitude,ROUND(d.km::numeric,1)::float8 AS distance');
 const rows=(await database().query(base+` CROSS JOIN LATERAL(SELECT 6371*2*asin(sqrt(LEAST(1.0,
  power(sin(radians(p.latitude-$2)/2),2)+cos(radians($2))*cos(radians(p.latitude))*power(sin(radians(p.longitude-$3)/2),2)))) AS km)d
  WHERE p.published AND p.suspended_at IS NULL AND p.radar_visible AND p.latitude IS NOT NULL AND p.user_id<>$1
  AND p.latitude BETWEEN $2-$4/111.0 AND $2+$4/111.0 AND d.km<=$4
  AND ($5<>'adventure' OR p.adventure_available)
  AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$1 AND b.target_id=p.user_id) OR (b.target_id=$1 AND b.user_id=p.user_id))
  ORDER BY d.km,p.user_id LIMIT 100`,[user.id,lat,lng,radius,mode])).rows;
 return json(rows);
}
