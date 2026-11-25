import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const paths = {}, artwork = [], indices = new Map();
async function scan(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (entry.name.endsWith('.svg')) {
      const svg = (await readFile(file, 'utf8')).trim();
      // Only self-contained artwork can be safely moved to a data URL.
      if (/(?:href|url)\s*[=(]\s*["']?(?!#|data:)/i.test(svg)) continue;
      if (!indices.has(svg)) { indices.set(svg, artwork.length); artwork.push(svg); }
      paths[path.relative('public', file).split(path.sep).join('/')] = indices.get(svg);
    }
  }
}
await scan('public/assets');
const source = JSON.stringify({ paths, artwork }) + '\n';
if (process.argv.includes('--check')) {
  if (await readFile('src/inline-icons.json', 'utf8') !== source) throw new Error('Run node scripts/sync-inline-icons.mjs');
} else await writeFile('src/inline-icons.json', source);
console.log(`${Object.keys(paths).length} icon paths share ${artwork.length} inline SVGs`);
