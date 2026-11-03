import {performance} from 'node:perf_hooks';
const origin=process.env.APP_URL??'http://localhost:3000';
if(!['localhost','127.0.0.1'].includes(new URL(origin).hostname))throw new Error('Solo carga local.');
const times=[];let failures=0;
await Promise.all(Array.from({length:8},async()=>{for(let index=0;index<15;index++){const start=performance.now();try{const response=await fetch(origin+(index%3===0?'/api/health':index%3===1?'/api/v1/profiles':'/api/v1/feed'));await response.arrayBuffer();if(!response.ok)failures++;}catch{failures++;}times.push(performance.now()-start);}}));
times.sort((a,b)=>a-b);const percentile=(p)=>Math.round(times[Math.min(times.length-1,Math.floor(times.length*p))]);
console.log(JSON.stringify({requests:times.length,concurrency:8,failures,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),note:'Prueba local breve; no representa capacidad de producción.'}));
if(failures)process.exitCode=1;
