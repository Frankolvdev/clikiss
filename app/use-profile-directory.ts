"use client";
import {useCallback,useEffect,useState} from 'react';
import type {Profile} from './data';
import {uniqueProfiles} from './chat-model';

export function useProfileDirectory(accountId?:string){
 const [profiles,setProfiles]=useState<Profile[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[revision,setRevision]=useState(0);
 const refresh=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{
  let stopped=false,activeRequest:AbortController|undefined;
  async function load(){
   await Promise.resolve();if(stopped)return;setStatus('loading');
   for(let attempt=0;attempt<2;attempt++){
    activeRequest=new AbortController();const timeout=window.setTimeout(()=>activeRequest?.abort(),6000);
    let retryable=true;
    try{
     const response=await fetch('/api/v1/profiles',{credentials:'same-origin',cache:'no-store',signal:activeRequest.signal});
     retryable=response.status>=500||response.status===408||response.status===429;
     if(!response.ok)throw new Error('Profiles unavailable');
     const value=await response.json();if(!Array.isArray(value))throw new Error('Invalid profile response');
     if(!stopped){setProfiles(uniqueProfiles(value));setStatus('ready');}return;
    }catch{if(stopped)return;if(!retryable||attempt===1){setStatus('error');return;}}
    finally{window.clearTimeout(timeout);}
    await new Promise(resolve=>window.setTimeout(resolve,400));if(stopped)return;
   }
  }
  void load();
  const online=()=>refresh();window.addEventListener('online',online);
  return()=>{stopped=true;activeRequest?.abort();window.removeEventListener('online',online);};
 },[accountId,revision,refresh]);
 return {profiles,setProfiles,status,refresh};
}
