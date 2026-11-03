import {spawn} from 'node:child_process';
const production=process.argv.includes('--production');
const args=process.argv.slice(2).filter((arg)=>arg!=='--production');
const env={...process.env,NODE_ENV:production?'production':'development'};
const children=[spawn(process.execPath,['node_modules/next/dist/bin/next',production?'start':'dev',...args],{env,stdio:'inherit'}),spawn(process.execPath,['scripts/realtime-server.mjs'],{env,stdio:'inherit'}),spawn(process.execPath,['scripts/media-worker.mjs'],{env,stdio:'inherit'}),spawn(process.execPath,['scripts/test-users-worker.mjs'],{env,stdio:'inherit'})];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),250).unref();}
for(const child of children){child.on('error',()=>stop(1));child.on('exit',(code)=>stop(code??1));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
