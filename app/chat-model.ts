import type {Message} from "./data";

/** HTTP acknowledgements and realtime refreshes may arrive in either order. */
export function mergeMessages(current:Message[],incoming:Message[]):Message[]{
 const unique=new Map(current.map((message)=>[message.id,message]));
 for(const message of incoming){const old=unique.get(message.id);unique.set(message.id,{...message,readAt:message.readAt??old?.readAt});}
 return [...unique.values()].sort((a,b)=>(a.createdAt??'').localeCompare(b.createdAt??'')||a.id.localeCompare(b.id));
}
