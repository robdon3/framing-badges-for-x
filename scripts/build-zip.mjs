import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const zipPath = path.join(root, 'dist', 'x-framing-badges.zip');

export function buildZip() {
  mkdirSync(path.dirname(zipPath), { recursive: true });
  rmSync(zipPath, { force: true });
  const result = spawnSync('zip', ['-r', '-X', zipPath, '.'], {
    cwd: path.join(root, 'extension'),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'zip failed');
  }
  return zipPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(buildZip());
}
