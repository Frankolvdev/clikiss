import sharp from 'sharp';
import {mkdir,stat,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const source = fileURLToPath(new URL('../assets/clikiss-logo-original.png', import.meta.url));
const directory = new URL('../public/brand/', import.meta.url);
await mkdir(directory, {recursive:true});
// All in-app logos retain the complete supplied artwork, including its tagline.
// Keep the old wordmark URL compatible without serving the previous cropped logo.
const variants = [
  ['clikiss-full.webp', null, 640],
  ['clikiss-wordmark.webp', null, 528],
  ['clikiss-symbol.webp', {left:365,top:0,width:850,height:590}, 256],
];
for (const [name, crop, width] of variants) {
  let pipeline = sharp(source);
  if (crop) pipeline = pipeline.extract(crop);
  const destination = new URL(name, directory);
  await pipeline.resize({width,withoutEnlargement:true}).webp({quality:85,effort:6}).toFile(fileURLToPath(destination));
  console.log(`${name}: ${(await stat(destination)).size} bytes`);
}
const symbol = {left:365,top:0,width:850,height:590};
await sharp(source).extract(symbol).resize(180,180,{fit:'contain',background:'#090609'}).png().toFile(fileURLToPath(new URL('clikiss-apple.png',directory)));
await sharp(source).extract(symbol).resize(32,32,{fit:'contain',background:'#090609'}).png().toFile(fileURLToPath(new URL('clikiss-icon.png',directory)));
// Replace the starter favicon too; ICO supports embedding a PNG image.
const png = await readFile(new URL('clikiss-icon.png',directory));
const header = Buffer.alloc(22);
header.writeUInt16LE(1,2);
header.writeUInt16LE(1,4);
header[6]=32; header[7]=32;
header.writeUInt16LE(1,10);
header.writeUInt16LE(32,12);
header.writeUInt32LE(png.length,14);
header.writeUInt32LE(22,18);
await writeFile(new URL('../app/favicon.ico',import.meta.url),Buffer.concat([header,png]));
