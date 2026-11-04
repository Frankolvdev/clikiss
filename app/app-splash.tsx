"use client";
import {useEffect,useState,type CSSProperties} from 'react';
import Image from 'next/image';
import './app-splash.css';

const MINIMUM_MS=1600,MAXIMUM_MS=8000;

/** Keep the opening animation until content arrives, with a bounded fallback. */
export default function AppSplash({ready}:{ready:boolean}){
 const [minimumElapsed,setMinimumElapsed]=useState(false),[expired,setExpired]=useState(false);
 useEffect(()=>{const minimum=window.setTimeout(()=>setMinimumElapsed(true),MINIMUM_MS),maximum=window.setTimeout(()=>setExpired(true),MAXIMUM_MS);return()=>{window.clearTimeout(minimum);window.clearTimeout(maximum);};},[]);
 if(expired||(minimumElapsed&&ready))return null;
 return <div className="app-splash" style={{'--splash-duration':`${MAXIMUM_MS}ms`} as CSSProperties} role="status" aria-label="Abriendo ClicKiss">
  <div className="splash-ambience" aria-hidden="true"><i/><i/></div>
  <div className="splash-content">
   <div className="splash-brand">
    <div className="splash-orbit" aria-hidden="true"><i/><i/></div>
    <Image className="splash-logo" unoptimized src="/brand/clikiss-full.webp" alt="ClicKiss — Citas para todxs" width={640} height={427} loading="eager" fetchPriority="high"/>
   </div>
   <span className="splash-dots" aria-hidden="true"><i/><i/><i/></span>
  </div>
 </div>;
}
