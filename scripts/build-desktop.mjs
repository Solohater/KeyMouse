import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'desktop', 'build');

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  legalComments: 'none',
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'info'
};

await build({
  ...common,
  entryPoints: [path.join(root, 'desktop', 'src', 'index.ts')],
  outfile: path.join(outDir, 'kimo-server.cjs')
});

await build({
  ...common,
  entryPoints: [path.join(root, 'desktop', 'src', 'cli.ts')],
  outfile: path.join(outDir, 'kimo-cli.cjs')
});

fs.copyFileSync(
  path.join(root, 'desktop', 'src', 'platform', 'uinput_daemon.py'),
  path.join(outDir, 'uinput_daemon.py')
);

console.log(`Desktop build ready: ${outDir}`);
