import type {PoolClient} from 'pg';
export type FolderPerson={key:string;name:string;gender:string;age:number;location:string;latitude:number;longitude:number;bio:string;interests:string[];adventure:boolean;ready:boolean;fingerprint:string;issues:string[];files:{relative:string;kind:'profile'|'post'|'story';size:number;mtime:number;video:boolean}[]};
export function populationRoot():string;
export function populationCatalog():Promise<FolderPerson[]>;
export function profilePhoto(person:FolderPerson):Promise<Buffer>;
export function sourceBytes(person:FolderPerson,file:FolderPerson['files'][number]):Promise<Buffer>;
export function syncFolderBatch(client:PoolClient,batch:{id:string},options:{encrypt:(value:{email:string;password:string})=>string}):Promise<boolean>;
