/**
 * scripts/compress-data.js
 * Run once: node scripts/compress-data.js
 * Creates data/*.json.gz files alongside the originals.
 * Used as a fallback if Netlify auto-compression is not applied.
 */

import { createReadStream, createWriteStream, statSync } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

const files = [
  'data/fife_interventions_db_v9.json',
  'data/problems_v2.json',
];

console.log('\n=== Compressing data files ===\n');

for (const file of files) {
  await pipeline(
    createReadStream(file),
    createGzip({ level: 9 }),
    createWriteStream(file + '.gz')
  );
  const orig = statSync(file).size;
  const comp = statSync(file + '.gz').size;
  const ratio = (orig / comp).toFixed(1);
  const savedKB = ((orig - comp) / 1024).toFixed(0);
  console.log(`  ${file}`);
  console.log(`    ${(orig / 1024).toFixed(0)} KB → ${(comp / 1024).toFixed(0)} KB  (${ratio}x compression, ${savedKB} KB saved)\n`);
}

console.log('Done. To serve pre-compressed files, update _headers as documented in Prompt 9.\n');
