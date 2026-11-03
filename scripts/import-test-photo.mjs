import sharp from 'sharp';
import path from 'node:path';
const [key,source]=process.argv.slice(2);
if(!/^person-\d{4}$/.test(key??'')||!source)throw new Error('INVALID_ARGUMENTS');
const allowed=path.resolve(process.env.CODEX_HOME??path.join(process.env.USERPROFILE,'.codex'),'generated_images');
const resolved=path.resolve(source),relative=path.relative(allowed,resolved);
if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('INVALID_SOURCE');
await sharp(resolved).rotate().resize({width:720,height:1080,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toFile(path.resolve('assets/test-users',`${key}.webp`));
console.log(`Imagen incorporada: ${key}`);
