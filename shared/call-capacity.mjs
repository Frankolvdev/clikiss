import {readFile} from 'node:fs/promises';
import {cpus,freemem,totalmem,loadavg} from 'node:os';

const number=(value,fallback,min=0)=>Number.isFinite(Number(value))&&value!==''?Math.max(min,Number(value)):fallback;
export function callConfig(env=process.env){
 const turnUrls=(env.TURN_URLS??'').split(',').map(s=>s.trim()).filter(Boolean);
 const stunUrls=(env.STUN_URLS??'stun:stun.l.google.com:19302').split(',').map(s=>s.trim()).filter(Boolean);
 const configured=turnUrls.length>0&&turnUrls.every(s=>/^turns?:[^\s]+$/.test(s))&&(env.TURN_SHARED_SECRET??'').length>=32;
 return {
  enabled:env.VIDEO_CALLS_ENABLED!=='false',
  requireTurn:env.NODE_ENV==='production'&&env.VIDEO_CALLS_REQUIRE_TURN!=='false',
  configured,turnUrls,stunUrls,secret:env.TURN_SHARED_SECRET??'',
  // A safety ceiling, not a claim about VPS capacity. Direct calls do not relay video.
  maxActive:Math.floor(number(env.VIDEO_CALL_MAX_ACTIVE,20,1)),
  maxMinutes:Math.min(120,number(env.VIDEO_CALL_MAX_MINUTES,120,1)),
  cpuLimit:number(env.VIDEO_CALL_CPU_LIMIT,0.9,0.1),
  minFreeMb:number(env.VIDEO_CALL_MIN_FREE_MB,384),
  networkMbps:number(env.VIDEO_CALL_NETWORK_MBPS,0),
  networkInterface:env.VIDEO_CALL_NETWORK_INTERFACE??'',
  procRoot:env.VIDEO_CALL_PROC_ROOT??'/proc',
  networkPath:env.VIDEO_CALL_NETWORK_PATH??'/proc/net/dev',
  networkFraction:Math.min(1,number(env.VIDEO_CALL_NETWORK_FRACTION,0.8,0.1)),
  forceRelay:env.VIDEO_CALL_FORCE_RELAY==='true',
 };
}

export function capacityDecision(config,metrics,active){
 if(!config.enabled||config.requireTurn&&!config.configured)return {available:false,reason:'disabled'};
 if(active>=config.maxActive)return {available:false,reason:'capacity'};
 if(metrics.freeMb<config.minFreeMb||metrics.cpu>config.cpuLimit||config.networkMbps>0&&metrics.networkMbps!==null&&metrics.networkMbps>config.networkMbps*config.networkFraction)return {available:false,reason:'capacity'};
 return {available:true,reason:null};
}

let previous=null,cached=null,inflight=null;
const read=path=>readFile(path,'utf8').catch(()=>null);
export async function measureCallCapacity(config){
 if(cached&&Date.now()-cached.at<5000)return cached;
 if(inflight)return inflight;
 inflight=(async()=>{
  const [stat,mem,v2Current,v2Max,cpuStat,cpuMax,net]=await Promise.all([
   read(`${config.procRoot}/stat`),read(`${config.procRoot}/meminfo`),read('/sys/fs/cgroup/memory.current'),read('/sys/fs/cgroup/memory.max'),
   read('/sys/fs/cgroup/cpu.stat'),read('/sys/fs/cgroup/cpu.max'),read(config.networkPath),
  ]);
  // Ubuntu 20.04 hosts may still use cgroup v1; honor their container limits too.
  const [v1Current,v1Max,v1Usage,v1Quota,v1Period]=v2Current===null||cpuStat===null?await Promise.all([
   read('/sys/fs/cgroup/memory/memory.usage_in_bytes'),read('/sys/fs/cgroup/memory/memory.limit_in_bytes'),
   read('/sys/fs/cgroup/cpuacct/cpuacct.usage'),read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'),read('/sys/fs/cgroup/cpu/cpu.cfs_period_us'),
  ]):[null,null,null,null,null];
  const current=v2Current??v1Current,max=v2Max??v1Max;
  const now=Date.now();
  const ticks=stat?.split('\n')[0].trim().split(/\s+/).slice(1,9).map(Number);
  const total=ticks?.reduce((a,b)=>a+b,0)??0,idle=ticks?(ticks[3]+ticks[4]):0;
  let cpu=previous&&total>previous.total?1-(idle-previous.idle)/(total-previous.total):Math.min(1,loadavg()[0]/Math.max(1,cpus().length));
  const usage=cpuStat?Number(cpuStat.match(/usage_usec (\d+)/)?.[1]??0):Number(v1Usage??0)/1000;
  const quota=cpuMax?.trim().split(/\s+/).map(Number)??[Number(v1Quota),Number(v1Period)];
  if(previous&&usage>=previous.usage&&quota?.[0]>0&&quota[1]>0)cpu=Math.max(cpu,(usage-previous.usage)/((now-previous.at)*1000*(quota[0]/quota[1])));
  let freeMb=Number(mem?.match(/MemAvailable:\s+(\d+)/)?.[1]??freemem()/1024)/1024;
  if(Number(max)>0&&current!==null)freeMb=Math.min(freeMb,(Number(max)-Number(current))/1048576);
  let bytes=null;
  if(config.networkInterface&&net){const row=net.split('\n').find(s=>s.trim().startsWith(config.networkInterface+':'));if(row){const fields=row.split(':')[1].trim().split(/\s+/).map(Number);bytes=fields[0]+fields[8];}}
  const networkMbps=bytes!==null&&previous?.bytes!==null&&previous?.bytes!==undefined&&bytes>=previous.bytes?(bytes-previous.bytes)*8/((now-previous.at)*1000):null;
  previous={at:now,total,idle,usage,bytes};
  cached={at:now,cpu,freeMb,networkMbps,totalMb:totalmem()/1048576};
  return cached;
 })();
 try{return await inflight;}finally{inflight=null;}
}
