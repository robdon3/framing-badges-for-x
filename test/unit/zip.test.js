import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { buildZip, zipPath } from '../../scripts/build-zip.mjs';

describe('zip', () => {
  it('packs the extension with manifest.json at the archive root', () => {
    buildZip();
    const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    const names = listing.stdout.split('\n').filter(Boolean);
    assert.ok(names.includes('manifest.json'));
    assert.ok(names.includes('content/content.js'));
    assert.ok(names.includes('content/content-bundle.js'));
    assert.ok(names.includes('rules/urgency.js'));
    assert.ok(names.includes('options/options.html'));
    assert.equal(names.some((name) => name.includes('fixtures') || name.includes('node_modules')), false);
  });
});
