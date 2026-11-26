import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const outfile = `.prompt-category-drafts-${randomUUID()}.mjs`;
try {
  await build({ entryPoints: ['scripts/test-prompt-category-drafts.tsx'], outfile,
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
    loader: { '.css': 'empty', '.svg': 'text' }, define: { 'import.meta.env.BASE_URL': '"/"' } });
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm(outfile, { force: true }); }
