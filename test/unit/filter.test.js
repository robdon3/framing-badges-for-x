import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import { startFramingBadges } from '../../extension/content/content.js';
import { createMemoryStorage, DEFAULT_STATE } from '../../extension/storage/state.js';
import { installObservers, NOW } from '../helpers.js';
import { createToneMemory } from '../../extension/tone/memory.js';
import {
  collapsedCount,
  normalizeHiddenTones,
  shouldCollapsePost,
  syncPostCollapse,
} from '../../extension/tone/filter.js';
import { bindHiddenCount, bindHiddenTones, hiddenCountLabel } from '../../extension/tone/filter-ui.js';
import { createToneController } from '../../extension/tone/viewport.js';

function articleWithAction() {
  const { document } = parseHTML(`<article data-testid="tweet">
    <button class="x-action">More</button>
    <div data-testid="tweetText">The notes are in the folder.</div>
  </article>`);
  const article = document.querySelector('article');
  let clicks = 0;
  article.querySelector('.x-action').addEventListener('click', () => {
    clicks += 1;
  });
  return { document, article, clicks: () => clicks };
}

describe('tone filter', () => {
  it('saves only known tone ids and hides none by default', () => {
    assert.deepEqual(normalizeHiddenTones(undefined), []);
    assert.deepEqual(normalizeHiddenTones(['Hype', 'nope', 'sad', 'sad']), ['sad', 'hype']);
    assert.equal(shouldCollapsePost({ label: 'hype', hiddenTones: [], revealed: new Set(), postId: '1' }), false);
    assert.equal(shouldCollapsePost({ label: 'hype', hiddenTones: ['hype'], revealed: new Set(), postId: '1' }), true);
    assert.equal(shouldCollapsePost({
      label: 'hype',
      hiddenTones: ['hype'],
      revealed: new Set(['1']),
      postId: '1',
    }), false);
  });

  it('collapses a labeled post and lets Show reveal only that post', () => {
    const { article, clicks } = articleWithAction();
    const revealed = new Set();
    const options = {
      label: 'whining',
      hiddenTones: ['whining'],
      revealed,
      postId: 'post-1',
      onShow(id) {
        revealed.add(id);
        syncPostCollapse(article, { ...options, revealed });
      },
    };
    assert.equal(syncPostCollapse(article, options), true);
    assert.equal(article.querySelector('.fcb-hidden-label').textContent, 'Hidden: Whining');
    assert.equal(article.classList.contains('fcb-collapsed'), true);
    assert.equal(article.querySelector('.x-action').textContent, 'More');
    article.querySelector('.fcb-show').click();
    assert.equal(clicks(), 0);
    assert.equal(article.querySelector('.fcb-hidden-bar'), null);
    assert.equal(article.querySelector('.x-action').textContent, 'More');
    assert.equal(syncPostCollapse(article, options), false);
    assert.equal(collapsedCount(article.ownerDocument), 0);
  });

  it('restores collapsed posts when the tone is unchecked', () => {
    const { article } = articleWithAction();
    const revealed = new Set();
    syncPostCollapse(article, {
      label: 'angry',
      hiddenTones: ['angry'],
      revealed,
      postId: 'post-2',
      onShow() {},
    });
    assert.equal(article.querySelector('.fcb-hidden-bar') != null, true);
    syncPostCollapse(article, {
      label: 'angry',
      hiddenTones: [],
      revealed,
      postId: 'post-2',
      onShow() {},
    });
    assert.equal(article.querySelector('.fcb-hidden-bar'), null);
    assert.equal(article.classList.contains('fcb-collapsed'), false);
    assert.equal(article.querySelector('.x-action').textContent, 'More');
  });

  it('writes the hide list live and does not store post text', async () => {
    const { document } = parseHTML('<div id="root"></div>');
    let stored = { ...DEFAULT_STATE };
    const listeners = new Set();
    const chromeApi = {
      storage: {
        local: {
          async get() {
            return structuredClone(stored);
          },
          async set(patch) {
            stored = { ...stored, ...patch };
            const changes = {};
            for (const [key, value] of Object.entries(patch)) changes[key] = { newValue: value };
            for (const listener of listeners) listener(changes, 'local');
          },
        },
        onChanged: { addListener(fn) { listeners.add(fn); } },
      },
      runtime: {
        connect() {
          return {
            onMessage: { addListener() {} },
            onDisconnect: { addListener() {} },
            postMessage() {},
          };
        },
      },
    };
    const container = document.querySelector('#root');
    bindHiddenTones({ container, chromeApi });
    await new Promise((resolve) => setImmediate(resolve));
    const sad = [...container.querySelectorAll('input')].find((input) => input.value === 'sad');
    sad.checked = true;
    sad.dispatchEvent(new document.defaultView.Event('change'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(stored.hiddenTones, ['sad']);
    assert.equal(JSON.stringify(stored).includes('tweet'), false);

    const output = document.createElement('p');
    let posted = null;
    chromeApi.runtime.connect = () => ({
      onMessage: {
        addListener(fn) {
          posted = fn;
        },
      },
      onDisconnect: { addListener() {} },
      postMessage() {},
    });
    bindHiddenCount({ output, chromeApi });
    posted({ type: 'fcb-hidden-count', count: 2 });
    assert.equal(output.textContent, hiddenCountLabel(2));
    assert.equal(output.textContent, 'Hidden this page: 2');
  });

  it('does not send a post again once its tone label is known', async () => {
    const memory = createToneMemory();
    memory.set('9', 'fun');
    const sent = [];
    let onVisible = null;
    const controller = createToneController({
      memory,
      delayMs: 0,
      observe(_post, callback) {
        onVisible = callback;
        return () => {};
      },
      readPost: () => ({ id: '9', text: 'secret wording that must not be sent' }),
      paint() {},
      send(request) {
        sent.push(request);
        return { id: request.id, label: 'sad', ms: 1 };
      },
    });
    const post = { isConnected: true };
    controller.watch(post);
    onVisible(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(sent, []);
    assert.equal(controller.queue.size, 0);
    controller.pause();
  });

  it('applies a hide-list change without reloading or rescoring', async () => {
    installObservers();
    const { document } = parseHTML(`<html><body>
      <article data-testid="tweet">
        <div data-testid="tweetText">Here is the meeting agenda for Thursday.</div>
        <div data-testid="User-Name"><span>@tone_user</span></div>
        <a href="/tone_user/status/42"><time datetime="2026-11-07T12:00:00.000Z">now</time></a>
        <button class="x-action">More</button>
      </article>
    </body></html>`);
    const storage = createMemoryStorage({ toneEnabled: true });
    const sent = [];
    await startFramingBadges(document, {
      storage,
      debounceMs: 0,
      immediate: true,
      now: () => NOW,
      toneDelayMs: 0,
      toneSend: async (request) => {
        sent.push(request.id);
        return { id: request.id, label: 'whining', ms: 4 };
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(document.querySelector('.fcb-badge'), null);
    assert.equal(document.querySelector('.fcb-tone').textContent, 'Whining');
    await storage.set({ hiddenTones: ['whining'] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(document.querySelector('.fcb-hidden-label').textContent, 'Hidden: Whining');
    assert.equal(document.querySelector('.x-action').textContent, 'More');
    document.querySelector('.fcb-show').click();
    assert.equal(document.querySelector('.fcb-hidden-bar'), null);
    assert.equal(document.querySelector('.x-action').textContent, 'More');
    await storage.set({ hiddenTones: [] });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(document.querySelector('.fcb-hidden-bar'), null);
    assert.deepEqual(sent, ['42']);
  });
});
