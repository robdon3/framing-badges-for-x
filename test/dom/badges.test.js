import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { applyAsyncResult } from '../../extension/content/badge.js';
import { startFramingBadges } from '../../extension/content/content.js';
import { extractPost } from '../../extension/content/extract.js';
import { CASES } from '../cases.js';
import { installObservers, NOW } from '../helpers.js';
import { createMemoryStorage } from '../../extension/storage/state.js';

const htmlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures.html');

describe('fixture badges', () => {
  it('runs the content script on the fixture page once per post', async () => {
    installObservers();
    const { document } = parseHTML(readFileSync(htmlPath, 'utf8'));
    const storage = createMemoryStorage({
      trustedHandles: ['trusted_desk'],
      noisyHandles: ['noisy_desk'],
    });
    const before = [...document.querySelectorAll('[data-testid="tweetText"]')].map((node) => node.textContent);
    const api = await startFramingBadges(document, {
      storage,
      debounceMs: 0,
      immediate: true,
      now: () => NOW,
    });

    for (const item of CASES) {
      const article = document.querySelector(`[data-fixture="${item.id}"]`);
      assert.ok(article, item.id);
      const badge = article.querySelector('.fcb-badge');
      if (!item.expect) {
        assert.equal(badge, null, item.id);
        assert.equal(article.querySelector('.fcb-host'), null, item.id);
        continue;
      }
      assert.equal(badge?.textContent, labelFor(item.expect), item.id);
      assert.equal(article.querySelectorAll('.fcb-host').length, 1, item.id);
      assert.equal(article.querySelector('[data-testid="tweetText"] .fcb-host'), null, item.id);
      const tip = article.querySelector('.fcb-tip').textContent;
      assert.match(tip, /scores framing, not truth/i, item.id);
      assert.doesNotMatch(tip, /Clean-ish/, item.id);
    }

    const combo = document.querySelector('[data-fixture="combo"] .fcb-tip').textContent;
    assert.match(combo, /officials claim/i);
    assert.match(combo, /BREAKING/);
    assert.match(combo, /62%/);
    assert.match(combo, /Number or odds with no as-of time/);
    assert.match(combo, /Unstamped/);
    assert.doesNotMatch(combo, /Opinion/);
    assert.match(combo, /RT if/);
    assert.match(combo, /Model check/i);
    assert.match(combo, /Precedence/);
    assert.doesNotMatch(combo, /Clean-ish/);

    assert.match(document.querySelector('[data-fixture="noisy-2"] .fcb-tip').textContent, /noisy list/);
    assert.match(document.querySelector('[data-fixture="noisy-2"] .fcb-tip').textContent, /in this browser: 2/);
    assert.match(document.querySelector('[data-fixture="noisy-1"] .fcb-tip').textContent, /in this browser: 1/);
    assert.equal(document.querySelector('[data-fixture="trusted-clean"] .fcb-badge'), null);
    assert.equal(document.querySelector('[data-fixture="trusted-clean"] .fcb-host'), null);

    assert.equal(extractPost(document.querySelector('[data-fixture="slash-date"]')).articleDateISO, null);
    assert.equal(extractPost(document.querySelector('[data-fixture="recycled-text-date"]')).articleDateISO, '2026-10-01T00:00:00.000Z');
    const old = extractPost(document.querySelector('[data-fixture="recycled-old"]'));
    assert.notEqual(old.articleDateISO, old.postDateISO);

    const after = [...document.querySelectorAll('[data-testid="tweetText"]')].map((node) => node.textContent);
    assert.deepEqual(after, before);

    await api.scanNow();
    assert.equal(document.querySelectorAll('.fcb-host').length, CASES.filter((item) => item.expect).length);
    const state = await storage.get();
    assert.equal(state.authorFlagCounts.noisy_desk, 2);
    assert.equal(state.authorFlagCounts.trusted_desk, undefined);
    assert.equal(state.countedPostIds.length, new Set(state.countedPostIds).size);

    const extra = document.createElement('article');
    extra.setAttribute('data-testid', 'tweet');
    extra.innerHTML = '<div data-testid="tweetText">RT if the late post counts.</div><div data-testid="User-Name"><span>@late_desk</span></div>';
    document.body.append(extra);
    globalThis.MutationObserver.latest.callback([{ addedNodes: [extra] }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(extra.querySelector('.fcb-badge')?.textContent, 'Bait');

    const clean = document.querySelector('[data-fixture="clean"]');
    applyAsyncResult(clean, {
      hits: [{ ruleId: 'model-check', badge: 'claim', summary: 'Extra', why: 'A future checker attached this note.' }],
      note: 'Example checker finished.',
    });
    assert.equal(clean.querySelector('.fcb-badge').textContent, 'Claim');
    assert.match(clean.querySelector('.fcb-tip').textContent, /future checker/i);
    assert.equal(clean.querySelectorAll('.fcb-host').length, 1);
  });
});

function labelFor(badge) {
  return badge.slice(0, 1).toUpperCase() + badge.slice(1);
}
