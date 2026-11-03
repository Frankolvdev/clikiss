import type { CSSProperties, ReactNode } from "react";
import type { Profile } from "./data";
import AnimatedAvatar from "./animated-avatar";

export function ProfilePhoto({ profile, className = "", children,discovery=false }: { profile: Pick<Profile, "image" | "name" | "avatarVideo" | "discoveryImage" | "hasDiscoveryPhoto">; className?: string; children?: ReactNode;discovery?:boolean }) {
  const image=discovery?(profile.discoveryImage||profile.image):profile.image;
  const style: CSSProperties = { backgroundImage: `url("${image}")` };
  return <div className={`profile-photo ${className}`} style={style} role={children ? "group" : "img"} aria-label={`Fotografía de ${profile.name}`}>{profile.avatarVideo&&!(discovery&&profile.hasDiscoveryPhoto)&&<AnimatedAvatar image={image} video={profile.avatarVideo} alt=""/>}{children}</div>;
}

export function InterestTag({ children }: { children: ReactNode }) {
  return <span className="interest-tag">{children}</span>;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-state-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
