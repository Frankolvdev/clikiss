export type SocialComment = { id: string; authorId: string; authorName: string; text: string; createdAt: number };
export type SocialPost = { id: string; caption: string; createdAt: number; kind: "photo" | "video"; previewStart?:number; coverTime?:number; customCover?:Blob; posterUrl?:string; previewUrl?:string; likeCount?:number; media?: Blob; mediaUrl?: string; width?: number; height?: number; story: boolean; likedBy?: string[]; savedBy?: string[]; comments?: SocialComment[] };
export type ReviewInvitation = { id: string; recipientId: string; recipientName: string; createdAt: number };
export type SocialReview = { id: string; invitationId: string; authorId: string; authorName: string; text: string; stars: number; createdAt: number; reported?: boolean; simulated?: boolean };
export type SocialRecord = { person?: {id:string;name:string;image:string;avatarVideo?:string}; profileId: string; posts: SocialPost[]; invitations: ReviewInvitation[]; reviews: SocialReview[]; avatar?: Blob; card?:Blob; cardUrl?:string; cover?: Blob; avatarUrl?: string; avatarVideoUrl?:string; coverUrl?: string };

import { api, send } from "./api-client";

export function emptySocialRecord(profileId: string): SocialRecord { return { profileId, posts: [], invitations: [], reviews: [] }; }
export function activeStories(posts: SocialPost[], now: number) { return posts.filter((post) => post.story && now - post.createdAt < 86400000); }
export function canReview(record: SocialRecord, invitationId: string, recipientId: string) { return record.profileId !== recipientId && record.invitations.some((item) => item.id === invitationId && item.recipientId === recipientId) && !record.reviews.some((item) => item.invitationId === invitationId); }

type RemoteRecord = SocialRecord & { avatarUrl?: string; avatarVideoUrl?:string; coverUrl?: string; posts: (SocialPost & { mediaUrl?: string })[] };
const snapshots = new Map<string, SocialRecord>();
export function clearSocialCache() { snapshots.clear(); }
export async function readSocialRecord(profileId: string): Promise<SocialRecord> {
 const value = await api<RemoteRecord>(`social/${encodeURIComponent(profileId)}`);
 const record: SocialRecord = value;
 snapshots.set(profileId, record); return record;
}
async function upload(file: Blob, options?:SocialPost) {
 const form=new FormData();form.set("file",file);if(options){form.set("previewStart",String(options.previewStart??0));form.set("coverTime",String(options.coverTime??0));if(options.customCover)form.set("cover",options.customCover);}const asset=await api<{id:string;status:string}>("media",{method:"POST",body:form});
 for(let attempt=0;asset.status!=='ready'&&attempt<120;attempt++){
  if(asset.status==='failed')throw new Error('El video no se pudo procesar. Intenta con otro archivo.');
  await new Promise((resolve)=>setTimeout(resolve,2000));asset.status=(await api<{status:string}>(`media-status/${asset.id}`)).status;
 }
 if(asset.status!=='ready')throw new Error('El video sigue procesándose. Intenta más tarde.');return asset;
}
export async function writeSocialRecord(next: SocialRecord) {
 const previous=snapshots.get(next.profileId)??emptySocialRecord(next.profileId);
 const route=`social/${encodeURIComponent(next.profileId)}`;
 for(const field of ["avatar","cover","card"] as const) if(next[field]&&next[field]!==previous[field]) {const media=await upload(next[field]!);await send(route,{type:"photo",field,mediaId:media.id});}
 for(const post of next.posts) if(!previous.posts.some((item)=>item.id===post.id)) {if(!post.media)throw new Error("Archivo requerido.");const media=await upload(post.media,post);await send("posts",{id:post.id,mediaId:media.id,caption:post.caption,story:post.story,width:post.width,height:post.height});}
 for(const post of previous.posts) if(!next.posts.some((item)=>item.id===post.id))await api(`posts/${post.id}`,{method:"DELETE"});
 for(const invitation of next.invitations) if(!previous.invitations.some((item)=>item.id===invitation.id))await send(route,{type:"invite",id:invitation.id,recipientId:invitation.recipientId});
 for(const invitation of previous.invitations) if(!next.invitations.some((item)=>item.id===invitation.id))await send(route,{type:"revoke",id:invitation.id});
 for(const review of next.reviews) {const old=previous.reviews.find((item)=>item.id===review.id);if(!old)await send(route,{type:"review",id:review.id,invitationId:review.invitationId,text:review.text,stars:review.stars});else if(review.reported&&!old.reported)await send(route,{type:"report",id:review.id});}
 snapshots.set(next.profileId,next);window.dispatchEvent(new Event("conecta-social-update"));
}
export async function updateSocialRecord(profileId:string, update:(record:SocialRecord)=>SocialRecord) {const previous=await readSocialRecord(profileId);await writeSocialRecord(update(previous));}
