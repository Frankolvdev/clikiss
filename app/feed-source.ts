import { api, send } from "./api-client";
import type { SocialRecord, SocialPost } from "./social-store";
import type { FeedCursor, FeedFilter, FeedPage, PostCommand } from "./feed-model";
export interface FeedDataSource {
 page(filter:FeedFilter,cursor:FeedCursor|null,limit:number,profileIds:string[]):Promise<FeedPage>;
 stories(now:number):Promise<SocialRecord[]>;
 media(postId:string):Promise<Blob|string>;
 mutate(profileId:string,postId:string,command:PostCommand):Promise<void>;
}
const mediaUrls=new Map<string,string>();
export const feedDataSource:FeedDataSource={
 async page(filter,cursor,limit){const params=new URLSearchParams({filter,limit:String(Math.min(50,limit))});if(cursor){params.set("at",String(cursor.createdAt));params.set("id",cursor.id);}const page=await api<FeedPage>(`feed?${params}`);for(const item of page.items){const post=item.post as SocialPost&{mediaUrl:string};mediaUrls.set(post.id,post.mediaUrl);}return page;},
 async stories(){return api<SocialRecord[]>("stories");},
 async media(id){const url=mediaUrls.get(id);if(!url)throw new Error("Archivo no disponible.");return url;},
 async mutate(_profileId,postId,command){await send(`posts/${postId}`,command,"PATCH");},
};
