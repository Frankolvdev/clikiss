export function putMedia(id:string,bytes:Buffer,mime:string):Promise<void>;
export function readMedia(id:string):Promise<Buffer>;
export function removeMedia(id:string):Promise<void>;
export function mediaSize(id:string):Promise<number>;
export function streamMedia(id:string,range?:{start:number;end:number}):Promise<ReadableStream<Uint8Array>>;
