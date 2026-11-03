import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
const root=()=>path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_ROOT??'.data/media');
let s3;
function client(){if(!s3)s3=new S3Client({region:process.env.S3_REGION??'us-east-1',...(process.env.S3_ENDPOINT?{endpoint:process.env.S3_ENDPOINT,forcePathStyle:process.env.S3_FORCE_PATH_STYLE==='true'}:{})});return s3;}
function key(value){if(!/^[a-f0-9-]{36}(?:\.(?:preview|loop))?$/.test(value))throw new Error('INVALID_OBJECT_KEY');return value;}
export async function putMedia(id,bytes,mime){key(id);if(process.env.S3_BUCKET){await client().send(new PutObjectCommand({Bucket:process.env.S3_BUCKET,Key:id,Body:bytes,ContentType:mime}));}else{await mkdir(root(),{recursive:true});await writeFile(/* turbopackIgnore: true */ path.join(root(),id),bytes);}}
export async function readMedia(id){key(id);if(process.env.S3_BUCKET){const result=await client().send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:id}));return Buffer.from(await result.Body.transformToByteArray());}return readFile(/* turbopackIgnore: true */ path.join(root(),id));}
export async function removeMedia(id){key(id);if(process.env.S3_BUCKET)await client().send(new DeleteObjectCommand({Bucket:process.env.S3_BUCKET,Key:id}));else await unlink(/* turbopackIgnore: true */ path.join(root(),id)).catch((error)=>{if(error.code!=='ENOENT')throw error;});}
export async function mediaSize(id){key(id);if(process.env.S3_BUCKET)return (await client().send(new HeadObjectCommand({Bucket:process.env.S3_BUCKET,Key:id}))).ContentLength;return (await stat(/* turbopackIgnore: true */ path.join(root(),id))).size;}
export async function streamMedia(id,range){key(id);if(process.env.S3_BUCKET){const result=await client().send(new GetObjectCommand({Bucket:process.env.S3_BUCKET,Key:id,...(range?{Range:`bytes=${range.start}-${range.end}`}:{})}));return result.Body.transformToWebStream();}return Readable.toWeb(createReadStream(/* turbopackIgnore: true */ path.join(root(),id),range?{start:range.start,end:range.end}:{}));}
