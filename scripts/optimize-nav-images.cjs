const path = require('node:path');
const fs = require('node:fs/promises');
const sharp = require('sharp');

async function main() {
  const [name, source] = process.argv.slice(2);
  if (!['connections', 'adventure', 'moments'].includes(name) || !source) throw new Error('Expected a navigation category and a source image.');
  const directory = path.resolve(__dirname, '../public/images');
  await fs.mkdir(directory, { recursive: true });
  const output = path.join(directory, `experience-${name}.webp`);
  await sharp(source).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 82 }).toFile(output);
  process.stdout.write(`${name}: ${path.relative(process.cwd(), output)}\n`);
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
