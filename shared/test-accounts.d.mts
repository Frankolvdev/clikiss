import type {Pool} from 'pg';
export type TestPerson={key:string;name:string;gender:string;age:number;location:string;latitude:number;longitude:number;category:string;adventure:boolean;caption:string;bio:string;interests:string[];file:string;prompt:string;ready:boolean};
export function testCatalog():Promise<TestPerson[]>;
export function testImage(key:string):Promise<Buffer>;
export function encryptTestCredential(value:{email:string;password:string}):string;
export function decryptTestCredential(value:string):{email:string;password:string};
export function processTestBatch(pool:Pool,options?:{creationEnabled?:boolean}):Promise<boolean>;
