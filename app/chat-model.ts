import type {Message,Profile} from "./data";

/** Contacts are authoritative; discovery responses can overlap or finish out of order. */
export function uniqueProfiles(profiles:Profile[]):Profile[]{return [...new Map(profiles.map(profile=>[profile.id,profile])).values()];}
export function chatContacts(discovery:Profile[],contacts:Profile[],ids:string[]):Profile[]{
 const unique=new Map(discovery.map(profile=>[profile.id,profile]));
 for(const profile of contacts)unique.set(profile.id,profile);
 const allowed=new Set(ids);
 return [...unique.values()].filter(profile=>allowed.has(profile.id));
}

/** HTTP acknowledgements and realtime refreshes may arrive in either order. */
export function mergeMessages(current:Message[],incoming:Message[]):Message[]{
 const unique=new Map(current.map((message)=>[message.id,message]));
 for(const message of incoming){const old=unique.get(message.id);unique.set(message.id,{...message,readAt:message.readAt??old?.readAt});}
 return [...unique.values()].sort((a,b)=>(a.createdAt??'').localeCompare(b.createdAt??'')||a.id.localeCompare(b.id));
}
