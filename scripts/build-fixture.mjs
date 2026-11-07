import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await esbuild.build({
  entryPoints: [path.join(root, 'test/run-fixture.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(root, 'test/fixture-bundle.js'),
  platform: 'browser',
  target: 'chrome110',
  legalComments: 'none',
});

await esbuild.build({
  entryPoints: [path.join(root, 'extension/content/content.js')],
  bundle: true,
  format: 'iife',
  outfile: path.join(root, 'extension/content/content-bundle.js'),
  platform: 'browser',
  target: 'chrome110',
  legalComments: 'none',
});

console.log(path.join(root, 'test/fixture-bundle.js'));
