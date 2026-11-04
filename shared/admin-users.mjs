import {randomUUID} from 'node:crypto';

export class AdminUserError extends Error {
 constructor(status,message,field){super(message);this.status=status;this.field=field;}
}
const joins='FROM "user" u LEFT JOIN profiles p ON p.user_id=u.id LEFT JOIN staff_roles s ON s.user_id=u.id';
const columns=`u.id,u.name,u.email,u."emailVerified" AS verified,u."createdAt" AS created_at,
 p.suspended_at,s.role,COALESCE(p.location,'') AS location,COALESCE(p.gender,'Prefiero no decirlo') AS gender,
 COALESCE(p.bio,'') AS bio,COALESCE(p.synthetic,false) AS synthetic,
 md5(concat_ws('|',u."updatedAt"::text,p.updated_at::text)) AS version`;

export async function listAdminUsers(db,params){
 const integer=(key,fallback,max)=>{const raw=params.get(key);return raw!==null&&/^\d+$/.test(raw)?Math.min(max,Number(raw)):fallback;};
 const draw=integer('draw',0,2147483647),start=integer('start',0,10000000);
 const requested=integer('length',25,100),length=[10,25,50,100].includes(requested)?requested:25;
 const conditions=[],values=[];
 const bind=value=>{values.push(value);return '$'+values.length;};
 const search=(params.get('search[value]')??'').trim().slice(0,254);
 if(search){const parameter=bind('%'+search.replace(/[\\%_]/g,'\\$&')+'%');conditions.push(`(u.name ILIKE ${parameter} OR u.email ILIKE ${parameter})`);}
 if(['admin','moderator','support'].includes(params.get('role')))conditions.push('s.role='+bind(params.get('role')));
 else if(params.get('role')==='none')conditions.push('s.role IS NULL');
 if(params.get('status')==='active')conditions.push('p.suspended_at IS NULL');
 else if(params.get('status')==='suspended')conditions.push('p.suspended_at IS NOT NULL');
 if(['verified','pending'].includes(params.get('verification')))conditions.push('u."emailVerified"='+bind(params.get('verification')==='verified'));
 const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
 const orderColumns=['u.name','u.email',"COALESCE(s.role,'')",'u."emailVerified"','p.suspended_at','u."createdAt"'];
 const order=orderColumns[integer('order[0][column]',5,6)]??orderColumns[5];
 const direction=params.get('order[0][dir]')==='asc'?'ASC':'DESC';
 // One snapshot keeps the counts consistent with the rows during concurrent registrations.
 const client=await db.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const total=Number((await client.query('SELECT count(*) AS count FROM "user"')).rows[0].count);
  const filtered=conditions.length?Number((await client.query('SELECT count(*) AS count '+joins+where,values)).rows[0].count):total;
  const data=(await client.query(`SELECT ${columns} ${joins}${where} ORDER BY ${order} ${direction} NULLS LAST,u.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,length,start])).rows;
  await client.query('COMMIT');return {draw,recordsTotal:total,recordsFiltered:filtered,data};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export async function saveAdminUser(db,actorId,value,passwordHash){
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73190211)');
  const actor=(await client.query('SELECT s.role,u."emailVerified",p.suspended_at FROM staff_roles s JOIN "user" u ON u.id=s.user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE s.user_id=$1',[actorId])).rows[0];
  if(actor?.role!=='admin'||!actor.emailVerified||actor.suspended_at)throw new AdminUserError(403,'Tus permisos cambiaron. Actualiza el panel.');
  const id=value.action==='create'?randomUUID():value.userId;
  let previous;
  if(value.action!=='create'){
   if(!(await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE',[id])).rowCount)throw new AdminUserError(404,'La cuenta ya no existe.');
   await client.query('SELECT user_id FROM profiles WHERE user_id=$1 FOR UPDATE',[id]);
   previous=(await client.query(`SELECT ${columns} ${joins} WHERE u.id=$1`,[id])).rows[0];
   if(previous.version!==value.version)throw new AdminUserError(409,'La cuenta cambió. Actualiza la tabla y vuelve a abrir el formulario.');
   if(value.action==='edit'&&previous.role&&!value.verified)throw new AdminUserError(400,'Las cuentas del equipo deben mantener su correo confirmado.','verified');
  }
  if(value.action!=='password'&&(await client.query('SELECT id FROM "user" WHERE lower(email)=lower($1) AND id<>$2',[value.email,id])).rowCount)throw new AdminUserError(409,'Ya existe una cuenta con este correo.','email');
  if(value.action==='create'){
   await client.query('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,$4,clock_timestamp(),clock_timestamp())',[id,value.name,value.email,value.verified]);
  }
  if(value.action!=='password'){
   await client.query('INSERT INTO profiles(user_id,name) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',[id,value.name]);
   await client.query('INSERT INTO preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
  }
  if(value.action==='edit'){
   await client.query('UPDATE "user" SET name=$2,email=$3,"emailVerified"=$4,"updatedAt"=clock_timestamp() WHERE id=$1',[id,value.name,value.email,value.verified]);
   await client.query('UPDATE profiles SET name=$2,location=$3,gender=$4,bio=$5,updated_at=clock_timestamp() WHERE user_id=$1',[id,value.name,value.location,value.gender,value.bio]);
  }
  if(value.action==='create'||value.action==='password'){
   if(!passwordHash)throw new Error('PASSWORD_HASH_REQUIRED');
   const updated=await client.query('UPDATE account SET password=$2,"updatedAt"=clock_timestamp() WHERE "userId"=$1 AND "providerId"=\'credential\'',[id,passwordHash]);
   if(!updated.rowCount)await client.query('INSERT INTO account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$2,$3,clock_timestamp(),clock_timestamp())',[randomUUID(),id,passwordHash]);
   if(value.action==='password')await client.query('UPDATE "user" SET "updatedAt"=clock_timestamp() WHERE id=$1',[id]);
  }
  const revoke=value.action==='password'||(value.action==='edit'&&(previous.email!==value.email||(previous.verified&&!value.verified)));
  let sessionsRevoked=0;
  if(revoke){
   sessionsRevoked=(await client.query('DELETE FROM session WHERE "userId"=$1',[id])).rowCount;
   await client.query('DELETE FROM verification WHERE value=$1 AND identifier LIKE \'reset-password:%\'',[id]);
   await client.query("UPDATE video_calls SET status='ended',ended_at=clock_timestamp(),end_reason='connection-lost' WHERE (caller_id=$1 OR callee_id=$1) AND status IN ('ringing','connecting','active')",[id]);
  }
  const fields=value.action==='password'?['password']:value.action==='create'?['name','email','verified','password']:['name','email','verified','location','gender','bio'].filter(field=>previous[field]!==value[field]);
  await client.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)',[actorId,'user.'+value.action,id,JSON.stringify({fields,reason:value.reason,sessionsRevoked})]);
  await client.query('COMMIT');return {ok:true,id,sessionsRevoked,self:actorId===id,sessionRevoked:revoke};
 }catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw new AdminUserError(409,'Ya existe una cuenta con este correo.','email');throw error;}finally{client.release();}
}
