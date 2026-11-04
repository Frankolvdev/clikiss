"use client";

import Image from "next/image";
import {useState} from "react";

export default function SidebarAvatar({image,name}:{image?:string;name?:string}) {
  const [failed,setFailed]=useState(false);
  const initial=name?.trim()[0]?.toUpperCase() || "✦";
  return <div className="user-avatar">
    {image&&!failed
      ? <Image unoptimized src={image} alt={`Foto de perfil de ${name || 'tu cuenta'}`} width={38} height={38} onError={()=>setFailed(true)}/>
      : initial}
  </div>;
}
