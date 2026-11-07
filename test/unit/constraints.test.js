import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionDir = path.join(root, 'extension');

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

describe('constraints', () => {
  it('locks the manifest to storage and x.com', () => {
    const manifest = JSON.parse(readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, '1.3.0');
    assert.equal(typeof manifest.key, 'string');
    assert.ok(manifest.key.length > 100);
    assert.deepEqual(manifest.permissions, ['storage', 'nativeMessaging']);
    assert.equal(manifest.background.service_worker, 'background/service-worker.js');
    assert.equal(manifest.background.type, 'module');
    assert.deepEqual(manifest.host_permissions, [
      'https://x.com/*',
      'https://www.x.com/*',
      'https://pro.x.com/*',
    ]);
    assert.deepEqual(manifest.content_scripts[0].matches, [
      'https://x.com/*',
      'https://www.x.com/*',
      'https://pro.x.com/*',
    ]);
    assert.deepEqual(manifest.content_scripts[0].js, ['content/content-bundle.js']);
    const csp = manifest.content_security_policy.extension_pages;
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|http:/);
    assert.equal(manifest.web_accessible_resources, undefined);
    const protocol = readFileSync(path.join(extensionDir, 'tone/protocol.js'), 'utf8');
    assert.match(protocol, /com\.xframingbadges\.tone/);
  });

  it('keeps personal machine and identity strings out of the tree', () => {
    const roots = [extensionDir, path.join(root, 'native-host'), path.join(root, 'docs'), path.join(root, 'README.md'), path.join(root, 'LICENSE')];
    const files = [];
    for (const entry of roots) {
      if (statSync(entry).isDirectory()) files.push(...filesUnder(entry));
      else files.push(entry);
    }
    const word = (...codes) => String.fromCharCode(...codes);
    const banned = [
      new RegExp(word(114, 111, 98, 100, 111, 110, 51), 'i'),
      new RegExp(word(100, 111, 110, 111, 104, 117, 101), 'i'),
      new RegExp(`${word(111, 117, 116, 108, 111, 111, 107)}\\.com`, 'i'),
      new RegExp(word(109, 97, 99, 98, 111, 111, 107, 112, 114, 111, 50, 48, 50, 53), 'i'),
      new RegExp(word(82, 111, 98, 101, 114, 116, 115, 45, 77, 97, 99, 66, 111, 111, 107), 'i'),
      new RegExp(`/${word(85, 115, 101, 114, 115)}/`),
      new RegExp(word(65, 114, 108, 105, 110, 103, 116, 111, 110)),
      /News Bot/,
      /AGENCY\.md/,
      /BEGIN (?:RSA |OPENSSH |PRIVATE )/,
    ];
    for (const file of files) {
      if (file.endsWith('content-bundle.js')) continue;
      const text = readFileSync(file, 'utf8');
      const rel = path.relative(root, file);
      for (const pattern of banned) {
        assert.equal(pattern.test(text), false, `${rel} matches ${pattern}`);
      }
    }
  });

  it('keeps selectors in one file and makes no network calls', () => {
    const sources = filesUnder(extensionDir).filter((file) => /\.(js|css|html|json)$/.test(file) && !file.endsWith('content-bundle.js'));
    const allowedUrl = /https:\/\/(?:(?:www|pro)\.)?x\.com/;
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      const rel = path.relative(extensionDir, file);
      assert.doesNotMatch(text, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bchrome\.tabs\b|\bchrome\.scripting\b|\beval\s*\(|\bnew Function\b/);
      if (rel !== 'content/selectors.js') {
        assert.equal(text.includes('data-testid'), false, rel);
      }
      if (rel.endsWith('.css')) assert.doesNotMatch(text, /url\(|@import/);
      const urls = text.match(/https?:\/\/[^\s"'`)>]+/g) || [];
      for (const url of urls) {
        assert.match(url, allowedUrl, `${rel} has ${url}`);
      }
    }
  });
});
