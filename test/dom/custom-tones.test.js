import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseHTML } from 'linkedom';
import { startFramingBadges } from '../../extension/content/content.js';
import { createMemoryStorage } from '../../extension/storage/state.js';
import { bindHiddenTones } from '../../extension/tone/filter-ui.js';
import { DEFAULT_TONE_LABELS } from '../../extension/tone/protocol.js';
import { installObservers, NOW } from '../helpers.js';

const POST = `<article data-testid="tweet">
  <div data-testid="tweetText">Here is the meeting agenda for Thursday.</div>
  <div data-testid="User-Name"><span>@tone_user</span></div>
  <a href="/tone_user/status/42"><time datetime="2026-11-07T12:00:00.000Z">now</time></a>
</article>`;

const CUSTOM = ['political', 'doomer', 'wholesome'];

function page() {
  return parseHTML(`<html><body>${POST}<div id="tones"></div></body></html>`);
}

function wait(ms = 40) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bridge(storage) {
  const listeners = new Set();
  return {
    storage: {
      local: {
        async get() {
          return storage.get();
        },
        async set(patch) {
          await storage.set(patch);
          const changes = {};
          for (const [key, value] of Object.entries(patch)) changes[key] = { newValue: value };
          for (const listener of listeners) listener(changes, 'local');
        },
      },
      onChanged: {
        addListener(fn) {
          listeners.add(fn);
        },
      },
    },
  };
}

describe('custom tones', { concurrency: 1 }, () => {
  it('follows popup add, remove, and rename onto the page and classifies that list', async () => {
    installObservers();
    const { document } = page();
    const storage = createMemoryStorage({ toneEnabled: true });
    const sent = [];
    const api = await startFramingBadges(document, {
      storage,
      debounceMs: 0,
      immediate: true,
      now: () => NOW,
      toneDelayMs: 0,
      toneSend: async (request) => {
        const labels = request.labels.slice();
        sent.push(labels);
        const exact = labels.length === CUSTOM.length && CUSTOM.every((name, index) => labels[index] === name);
        if (exact) return { id: request.id, label: 'doomer', ms: 3 };
        if (labels.includes('fun')) return { id: request.id, label: 'fun', ms: 1 };
        return { id: request.id, label: null, ms: 1 };
      },
    });
    const popup = document.querySelector('#tones');
    bindHiddenTones({ container: popup, chromeApi: bridge(storage) });
    await wait();
    assert.deepEqual(sent[0], [...DEFAULT_TONE_LABELS]);
    assert.equal(document.querySelector('.fcb-tone').textContent, 'Fun');

    const form = popup.querySelector('form');
    const field = popup.querySelector('input[aria-label="New tone"]');
    async function add(name) {
      field.value = name;
      form.dispatchEvent(new document.defaultView.Event('submit', { bubbles: true, cancelable: true }));
      await wait();
    }
    async function remove(name) {
      popup.querySelector(`[aria-label="Remove ${name}"]`).click();
      await wait();
    }

    await add('doomer');
    assert.ok(sent.at(-1).includes('doomer'));
    await remove('fun');
    assert.ok(sent.at(-1).includes('doomer') && !sent.at(-1).includes('fun'));
    assert.notEqual(document.querySelector('.fcb-tone')?.textContent, 'Fun');

    popup.querySelector('.tone-reset').click();
    await wait();
    await add('political');
    await add('doomer');
    await add('wholesome');
    for (const name of DEFAULT_TONE_LABELS) await remove(name);
    await wait();
    assert.deepEqual(sent.at(-1), CUSTOM);
    assert.equal(document.querySelector('.fcb-tone').textContent, 'Doomer');
    assert.equal(document.querySelector('.fcb-hidden-bar'), null);

    popup.querySelector('input[value="doomer"]').checked = true;
    popup.querySelector('input[value="doomer"]').dispatchEvent(new document.defaultView.Event('change'));
    await wait();
    const article = document.querySelector('article');
    assert.equal(article.querySelector('.fcb-hidden-label').textContent, 'Hidden: Doomer');
    assert.equal(article.getAttribute('data-fcb-collapsed'), '1');
    const saved = await storage.get();
    assert.equal(JSON.stringify(saved).includes('meeting agenda'), false);
    api.disconnect();
  });

  it('drops an in-flight reply from the previous list even when that label is still allowed', async () => {
    installObservers();
    const { document } = page();
    const storage = createMemoryStorage({ toneEnabled: true });
    const sent = [];
    let release;
    const api = await startFramingBadges(document, {
      storage,
      debounceMs: 0,
      immediate: true,
      now: () => NOW,
      toneDelayMs: 0,
      toneSend: (request) => {
        sent.push(request.labels.slice());
        if (!release) {
          return new Promise((resolve) => {
            release = () => resolve({ id: request.id, label: 'fun', ms: 1 });
          });
        }
        return { id: request.id, label: 'doomer', ms: 2 };
      },
    });
    await wait();
    assert.deepEqual(sent[0], [...DEFAULT_TONE_LABELS]);
    await storage.set({ toneLabels: ['political', 'doomer', 'wholesome', 'fun'] });
    await wait();
    assert.equal(document.querySelector('.fcb-tone')?.textContent, undefined);
    release();
    assert.notEqual(document.querySelector('.fcb-tone')?.textContent, 'Fun');
    await wait();
    assert.deepEqual(sent.at(-1), ['political', 'doomer', 'wholesome', 'fun']);
    assert.equal(document.querySelector('.fcb-tone').textContent, 'Doomer');
    api.disconnect();
  });

  it('leaves a null host label unlabeled and does not hide or resend it', async () => {
    installObservers();
    const { document } = page();
    const storage = createMemoryStorage({ toneEnabled: true, hiddenTones: ['fun'] });
    const sent = [];
    await startFramingBadges(document, {
      storage,
      debounceMs: 0,
      immediate: true,
      now: () => NOW,
      toneDelayMs: 0,
      toneSend: async (request) => {
        sent.push(request.id);
        return { id: request.id, label: null, ms: 5 };
      },
    });
    await wait();
    assert.equal(sent.length, 1);
    assert.equal(document.querySelector('.fcb-tone')?.textContent, undefined);
    assert.equal(document.querySelector('.fcb-hidden-bar')?.textContent, undefined);
    const article = document.querySelector('article');
    const fresh = document.createElement('article');
    fresh.setAttribute('data-testid', 'tweet');
    fresh.innerHTML = article.innerHTML;
    article.remove();
    document.body.append(fresh);
    const api = await startFramingBadges(document);
    await api.scanNow();
    await wait();
    assert.deepEqual(sent, ['42']);
    assert.equal(fresh.querySelector('.fcb-tone')?.textContent, undefined);
    assert.equal(fresh.querySelector('.fcb-hidden-bar')?.textContent, undefined);
    api.disconnect();
  });
});
