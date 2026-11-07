import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { startFramingBadges } from '../../extension/content/content.js';
import { columnScrollRoot, findPosts } from '../../extension/content/selectors.js';
import { installObservers, NOW } from '../helpers.js';
import { createMemoryStorage } from '../../extension/storage/state.js';

const htmlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pro-fixtures.html');

const EXPECTED = {
  'pro-claim': 'Claim',
  'pro-alarm': 'Alarm',
  'pro-unstamped': 'Unstamped',
  'pro-clean': null,
  'pro-recycled': 'Recycled',
  'pro-bait': 'Bait',
};

describe('X Pro columns', () => {
  it('badges every column, including one added later, using that column scroller', async () => {
    installObservers();
    const { document, window } = parseHTML(readFileSync(htmlPath, 'utf8'));
    const before = [...document.querySelectorAll('[data-testid="tweetText"]')].map((node) => node.textContent);
    await startFramingBadges(document, {
      storage: createMemoryStorage(),
      debounceMs: 0,
      immediate: true,
      now: () => NOW,
    });

    const columns = [...document.querySelectorAll('[data-testid="column"]')];
    assert.equal(columns.length, 3);
    for (const [id, label] of Object.entries(EXPECTED)) {
      const article = document.querySelector(`[data-fixture="${id}"]`);
      if (!label) {
        assert.equal(article.querySelector('.fcb-badge'), null, id);
        assert.equal([...article.children].filter((child) => child.classList.contains('fcb-host')).length, 0, id);
      } else {
        assert.equal(article.querySelector('.fcb-badge')?.textContent, label, id);
        assert.equal([...article.children].filter((child) => child.classList.contains('fcb-host')).length, 1, id);
      }
      assert.equal(article.querySelector('[data-testid="tweetText"] .fcb-host'), null, id);
      const scroller = article.closest('[data-testid="columnContent"]');
      assert.equal(columnScrollRoot(article), scroller);
    }
    const roots = new Set(globalThis.IntersectionObserver.instances.map((observer) => observer.root));
    for (const scroller of document.querySelectorAll('[data-testid="columnContent"]')) {
      assert.equal(roots.has(scroller), true);
    }
    assert.deepEqual(before, [...document.querySelectorAll('[data-testid="tweetText"]')].map((node) => node.textContent));

    const late = document.createElement('section');
    late.setAttribute('data-testid', 'column');
    late.innerHTML = `<h2 data-testid="columnHeader">Late</h2>
      <div data-testid="columnContent">
        <article data-testid="tweet" data-fixture="pro-late">
          <div data-testid="User-Name"><a href="/late_desk"><span>@late_desk</span></a></div>
          <div data-testid="tweetText">RT if the new column counts.</div>
        </article>
      </div>`;
    document.querySelector('[data-testid="deck"]').append(late);
    globalThis.MutationObserver.latest.callback([{ addedNodes: [late] }]);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const lateArticle = document.querySelector('[data-fixture="pro-late"]');
    assert.equal(lateArticle.querySelector('.fcb-badge')?.textContent, 'Bait');
    assert.equal(columnScrollRoot(lateArticle), late.querySelector('[data-testid="columnContent"]'));
    assert.equal(
      globalThis.IntersectionObserver.instances.some((observer) => observer.root === late.querySelector('[data-testid="columnContent"]')),
      true,
    );

    const bare = document.createElement('article');
    bare.setAttribute('data-testid', 'tweet');
    bare.innerHTML = '<div data-testid="tweetText">Hello from the timeline.</div>';
    assert.equal(columnScrollRoot(bare), null);
    assert.equal(findPosts(bare).length, 1);

    const claim = document.querySelector('[data-fixture="pro-claim"] .fcb-badge');
    claim.dispatchEvent(new window.Event('mouseenter'));
    const tip = document.querySelector('.fcb-tip.fcb-tip-portal');
    assert.equal(tip?.parentElement, document.body);
    assert.equal(document.querySelector('[data-testid="columnContent"]').contains(tip), false);
    assert.match(tip.textContent, /scores framing, not truth/i);
    assert.match(tip.textContent, /Number or odds with no as-of time/);
  });
});