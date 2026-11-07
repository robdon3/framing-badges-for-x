import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { clearAsyncCheckers } from '../../extension/content/async-check.js';
import { applyAsyncResult, mountBadge } from '../../extension/content/badge.js';
import { startFramingBadges } from '../../extension/content/content.js';
import { scorePostWithAsync } from '../../extension/content/scorer.js';
import { normalizeState } from '../../extension/storage/state.js';
import { decodeNativeFrames, encodeNativeFrame } from '../../extension/tone/framing.js';
import { createToneLifetime, TONE_IDLE_MS } from '../../extension/tone/lifetime.js';
import { createToneMemory, TONE_MEMORY_CAP } from '../../extension/tone/memory.js';
import { frameToneRequest, normalizeToneLabel, parseHostMessage, truncateToneText } from '../../extension/tone/protocol.js';
import { createJobQueue } from '../../extension/tone/queue.js';
import { requestToneLabel } from '../../extension/tone/request.js';
import { createToneSession } from '../../extension/tone/session.js';
import { createToneController, createVisibleQueue, TONE_QUEUE_CAP } from '../../extension/tone/viewport.js';
import { watchVisiblePost } from '../../extension/tone/watch.js';
import { installObservers, NOW, snapshot } from '../helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_EXTENSION_ID = 'eadkmedlbenoalongikmdhedfinggpoh';

function extensionIdFromKey(key) {
  const der = Buffer.from(key, 'base64');
  const hex = createHash('sha256').update(der).digest().subarray(0, 16).toString('hex');
  return [...hex].map((digit) => String.fromCharCode('a'.charCodeAt(0) + parseInt(digit, 16))).join('');
}

function fakePort() {
  const messageListeners = new Set();
  const disconnectListeners = new Set();
  return {
    sent: [],
    disconnected: false,
    onMessage: { addListener(fn) { messageListeners.add(fn); } },
    onDisconnect: { addListener(fn) { disconnectListeners.add(fn); } },
    postMessage(payload) { this.sent.push(payload); },
    emit(message) {
      for (const fn of messageListeners) fn(message);
    },
    disconnect() {
      this.disconnected = true;
      for (const fn of disconnectListeners) fn();
    },
    drop() {
      for (const fn of disconnectListeners) fn();
    },
  };
}

function concatFrames(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

describe('tone', { concurrency: 1 }, () => {
  it('derives the stable unpacked extension id from the manifest key', () => {
    const manifest = JSON.parse(readFileSync(path.join(root, 'extension/manifest.json'), 'utf8'));
    assert.equal(extensionIdFromKey(manifest.key), EXPECTED_EXTENSION_ID);
    assert.equal(manifest.version, '1.3.1');
  });

  it('frames native messages as a little-endian length plus JSON', () => {
    const payload = frameToneRequest('42', '  hello  ');
    assert.deepEqual(payload, { id: '42', text: 'hello' });
    const frame = encodeNativeFrame(payload);
    assert.equal(frame[0] + (frame[1] << 8) + (frame[2] << 16) + (frame[3] << 24), frame.byteLength - 4);
    assert.equal(frame[1], 0);
    const decoded = decodeNativeFrames(frame);
    assert.deepEqual(decoded.messages, [payload]);
    assert.equal(decoded.rest.byteLength, 0);

    const second = encodeNativeFrame({ id: '7', label: 'Hype', ms: 300 });
    const partial = concatFrames([frame, second]).subarray(0, frame.byteLength + second.byteLength - 3);
    const split = decodeNativeFrames(partial);
    assert.deepEqual(split.messages, [payload]);
    const rest = concatFrames([split.rest, second.subarray(second.byteLength - 3)]);
    assert.deepEqual(decodeNativeFrames(rest).messages, [{ id: '7', label: 'Hype', ms: 300 }]);
  });

  it('truncates post text and normalizes labels, including a capitalized Hype', () => {
    assert.equal(truncateToneText(` ${'a'.repeat(1005)} `).length, 1000);
    assert.equal(normalizeToneLabel('Hype'), 'hype');
    assert.equal(normalizeToneLabel(' sarcastic '), 'sarcastic');
    assert.equal(normalizeToneLabel('Opinion'), null);
    const request = frameToneRequest(9, 'b'.repeat(1200));
    assert.equal(request.id, '9');
    assert.equal(request.text.length, 1000);
    assert.deepEqual(parseHostMessage({ id: 9, label: 'Hype', ms: 312.4 }), {
      id: '9',
      label: 'hype',
      ms: 312,
    });
    const failure = parseHostMessage({
      id: '9',
      error: 'Apple on-device model is unavailable: Apple Intelligence is turned off.',
      text: 'should not leak',
    });
    assert.equal(failure.error, 'Apple on-device model is unavailable: Apple Intelligence is turned off.');
    assert.equal('label' in failure, false);
    assert.equal(JSON.stringify(failure).includes('should not leak'), false);
    assert.equal(parseHostMessage({ id: '9', label: 'Opinion' }).error, 'Tone host returned an unknown label.');
  });

  it('keeps labels in a memory map and does not put them in extension state', () => {
    const memory = createToneMemory(2);
    assert.equal(memory.set('a', 'Hype'), true);
    memory.set('b', 'sad');
    assert.equal(memory.get('a'), 'hype');
    memory.set('c', 'fun');
    assert.equal(memory.get('b'), null);
    assert.equal(memory.get('a'), 'hype');
    assert.equal(memory.set('d', 'not-a-tone'), false);
    assert.equal(memory.get('d'), null);
    assert.equal(TONE_MEMORY_CAP, 300);
    const state = normalizeState({
      toneEnabled: 'yes',
      toneCache: { entries: [{ id: 'a', label: 'hype', text: 'secret post' }] },
    });
    assert.equal(state.toneEnabled, false);
    assert.equal(Object.hasOwn(state, 'toneCache'), false);
    assert.equal(JSON.stringify(state).includes('secret post'), false);
  });

  it('does not keep a failed label, and does not echo post text', async () => {
    let calls = 0;
    const miss = await requestToneLabel({
      id: '100',
      text: 'secret wording',
      send: (request) => {
        calls += 1;
        assert.equal(request.text, 'secret wording');
        return { id: '100', error: 'Tone host not installed', text: 'secret wording' };
      },
    });
    assert.equal(calls, 1);
    assert.equal(miss.label, null);
    assert.equal(JSON.stringify(miss).includes('secret wording'), false);
  });

  it('serves the latest visible post first and drops a post that leaves before the send', async () => {
    const queue = createVisibleQueue(2);
    assert.equal(TONE_QUEUE_CAP, 10);
    queue.add({ id: 'old', text: 'old text' });
    queue.add({ id: 'mid', text: 'mid text' });
    const dropped = queue.add({ id: 'new', text: 'new text' });
    assert.deepEqual(dropped, ['old']);
    assert.equal(queue.takeLatest().id, 'new');
    assert.equal(queue.drop('mid'), true);
    assert.equal(queue.size, 0);

    const sent = [];
    let releaseFirst;
    const memory = createToneMemory();
    const timers = [];
    let onVisible = null;
    const posts = {
      first: { isConnected: true, id: 'first' },
      second: { isConnected: true, id: 'second' },
    };
    const controller = createToneController({
      memory,
      delayMs: 500,
      queueCap: 2,
      schedule(fn, ms) {
        const timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return timer;
      },
      cancel(timer) {
        timer.cancelled = true;
      },
      observe(_post, callback) {
        onVisible = callback;
        return () => {};
      },
      readPost(post) {
        return { id: post.id, text: `${post.id} text` };
      },
      paint() {},
      send(request) {
        sent.push(request.id);
        if (request.id === 'first') {
          return new Promise((resolve) => {
            releaseFirst = () => resolve({ id: request.id, label: 'fun', ms: 1 });
          });
        }
        return { id: request.id, label: 'sad', ms: 1 };
      },
    });
    controller.watch(posts.first);
    onVisible(true);
    timers[0].fn();
    assert.deepEqual(sent, ['first']);
    controller.watch(posts.second);
    onVisible(true);
    timers[1].fn();
    assert.deepEqual(sent, ['first']);
    assert.equal(controller.queue.ids().includes('second'), true);
    onVisible(false);
    assert.equal(controller.queue.ids().includes('second'), false);
    releaseFirst();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sent, ['first']);
    assert.equal(memory.get('first'), 'fun');
    controller.pause();
  });

  it('runs at most the configured number of tone jobs at once', async () => {
    async function peak(concurrency) {
      const queue = createJobQueue({ concurrency });
      let active = 0;
      let max = 0;
      const releases = [];
      const jobs = [1, 2, 3].map(() => queue.enqueue(() => new Promise((resolve) => {
        active += 1;
        max = Math.max(max, active);
        releases.push(() => {
          active -= 1;
          resolve();
        });
      })));
      for (let finished = 0; finished < jobs.length; finished += 1) {
        while (releases.length === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        assert.ok(active <= concurrency);
        releases.shift()();
        await new Promise((resolve) => setImmediate(resolve));
      }
      await Promise.all(jobs);
      assert.equal(active, 0);
      return max;
    }
    assert.equal(await peak(1), 1);
    assert.equal(await peak(2), 2);

    const queue = createJobQueue({ concurrency: 1 });
    const seen = [];
    await queue.enqueue(async () => {
      seen.push('fail');
      throw new Error('boom');
    }).catch((error) => {
      assert.equal(error.message, 'boom');
    });
    await queue.enqueue(async () => {
      seen.push('next');
    });
    assert.deepEqual(seen, ['fail', 'next']);
  });

  it('uses one native port, normalizes Hype, and reports a missing host', async () => {
    const ports = [];
    let disconnectMessage = '';
    const session = createToneSession({
      concurrency: 1,
      timeoutMs: 50,
      connect() {
        const port = fakePort();
        ports.push(port);
        return port;
      },
      readDisconnectError: () => disconnectMessage,
    });

    const first = session.classify({ id: 'a', text: ` ${'n'.repeat(50)} ` });
    const second = session.classify({ id: 'b', text: 'second post' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(ports.length, 1);
    assert.equal(ports[0].sent.length, 1);
    assert.equal(ports[0].sent[0].id, 'a');
    assert.equal(ports[0].sent[0].text, 'n'.repeat(50));
    ports[0].emit({ id: 'a', label: 'Hype', ms: 280 });
    assert.deepEqual(await first, { id: 'a', label: 'hype', ms: 280 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(ports[0].sent.length, 2);
    assert.equal(ports[0].sent[1].id, 'b');
    ports[0].emit({ id: 'b', label: 'sad', ms: 20 });
    assert.deepEqual(await second, { id: 'b', label: 'sad', ms: 20 });

    const parallel = createToneSession({
      concurrency: 2,
      connect() {
        return fakePort();
      },
    });
    const left = parallel.classify({ id: 'l', text: 'left' });
    const right = parallel.classify({ id: 'r', text: 'right' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const port = parallel.open();
    assert.equal(port.ok, true);
    disconnectMessage = '';
    const openPort = ports[0];
    openPort.emit({ id: 'nope', label: 'fun', ms: 1 });

    const missing = createToneSession({
      connect() {
        const port = fakePort();
        queueMicrotask(() => {
          disconnectMessage = 'Specified native messaging host not found.';
          port.drop();
        });
        return port;
      },
      readDisconnectError: () => disconnectMessage,
    });
    const failed = await missing.classify({ id: 'post', text: 'private post text' });
    assert.equal(failed.error, 'Tone host not installed');
    assert.equal(JSON.stringify(failed).includes('private'), false);

    const unavailable = createToneSession({
      connect: () => fakePort(),
    });
    const pending = unavailable.classify({ id: 'p', text: 'hello' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    unavailable.open();
    const live = createToneSession({ connect: () => fakePort() });
    const hung = live.classify({ id: 'slow', text: 'hello' });
    assert.equal((await Promise.race([
      hung.then(() => 'done'),
      new Promise((resolve) => setTimeout(() => resolve('wait'), 10)),
    ])), 'wait');

    session.close();
    parallel.close();
    missing.close();
    unavailable.close();
    live.close();
    await Promise.allSettled([left, right, pending, hung]);
  });

  it('sends only after the post stays visible, and cancels when it leaves', async () => {
    const timers = [];
    let ready = 0;
    const post = { isConnected: true };
    const watch = watchVisiblePost({
      post,
      delayMs: 500,
      schedule(fn, ms) {
        const timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return timer;
      },
      cancel(timer) {
        timer.cancelled = true;
      },
      onReady() {
        ready += 1;
      },
    });
    watch.show();
    watch.show();
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 500);
    assert.equal(ready, 0);
    watch.hide();
    assert.equal(timers[0].cancelled, true);
    timers[0].fn();
    assert.equal(ready, 0);
    watch.show();
    timers[1].fn();
    assert.equal(ready, 1);
    post.isConnected = false;
    watch.show();
    timers[2].fn();
    assert.equal(ready, 1);
  });

  it('opens the native host on the first request and closes it when idle or the last tab leaves', async () => {
    const ports = [];
    const session = createToneSession({
      connect() {
        const port = fakePort();
        ports.push(port);
        return port;
      },
    });
    const timers = [];
    let idled = 0;
    const lifetime = createToneLifetime({
      session,
      idleMs: TONE_IDLE_MS,
      onIdle() {
        idled += 1;
      },
      schedule(fn, ms) {
        const timer = { fn, ms, cancelled: false };
        timers.push(timer);
        return timer;
      },
      cancel(timer) {
        timer.cancelled = true;
      },
    });
    lifetime.setEnabled(true);
    assert.equal(ports.length, 0);
    assert.equal(TONE_IDLE_MS, 60000);
    lifetime.tabOpened();
    const pending = lifetime.request({ id: 'a', text: 'hello' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ports.length, 1);
    ports[0].emit({ id: 'a', label: 'whining', ms: 917 });
    assert.equal((await pending).label, 'whining');
    assert.equal(timers.at(-1).ms, 60000);
    assert.equal(session.isOpen(), true);
    timers.at(-1).fn();
    assert.equal(session.isOpen(), false);
    assert.equal(idled, 1);

    const again = lifetime.request({ id: 'b', text: 'again' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ports.length, 2);
    ports[1].emit({ id: 'b', label: 'fun', ms: 4 });
    await again;
    lifetime.tabClosed();
    assert.equal(session.isOpen(), false);
    assert.equal(timers.at(-1).cancelled, true);
    lifetime.setEnabled(false);
  });

  it('paints a tone chip without changing the framing badge', () => {
    const { document } = parseHTML('<article data-testid="tweet"></article>');
    const article = document.querySelector('article');
    mountBadge(article, {
      badge: 'bait',
      hits: [{ badge: 'bait', ruleId: 'bait', why: 'RT if' }],
      errors: [],
      author: { handle: 'someone', flagCount: 0 },
      asyncNote: null,
    });
    const tip = article.querySelector('.fcb-tip').textContent;
    applyAsyncResult(article, { hits: [], tone: { label: 'Hype' } });
    assert.equal(article.querySelector('.fcb-badge').textContent, 'Bait');
    assert.equal(article.querySelector('.fcb-tone').textContent, 'Hype');
    assert.equal(article.dataset && article.querySelector('.fcb-host').dataset.fcbTone, 'hype');
    assert.equal(article.querySelector('.fcb-tip').textContent, tip);
    assert.match(tip, /Model check/i);
    applyAsyncResult(article, { hits: [], tone: null });
    assert.equal(article.querySelector('.fcb-tone'), null);
    assert.equal(article.querySelector('.fcb-badge').textContent, 'Bait');

    const bare = document.createElement('article');
    document.body.append(bare);
    assert.equal(mountBadge(bare, { badge: null, hits: [] }), null);
    assert.equal(bare.querySelector('.fcb-host'), null);
    applyAsyncResult(bare, { hits: [], tone: { label: 'sad' } });
    assert.equal(bare.querySelector('.fcb-badge'), null);
    assert.equal(bare.querySelector('.fcb-tone').textContent, 'Sad');
  });

  it('asks the registered checker after a visible pause and leaves framing rules alone', async () => {
    clearAsyncCheckers();
    const unregister = (await import('../../extension/content/async-check.js')).registerAsyncChecker(async () => ({
      hits: [],
      tone: { label: 'angry' },
    }));
    const checked = await scorePostWithAsync(snapshot({ text: 'Here is the meeting agenda for Thursday.' }));
    assert.equal(checked.badge, null);
    assert.equal(checked.tone.label, 'angry');
    assert.equal(checked.asyncNote, null);
    unregister();
    clearAsyncCheckers();

    installObservers();
    const { document } = parseHTML(`<html><body>
      <article data-testid="tweet">
        <div data-testid="tweetText">Hello from the timeline today.</div>
        <div data-testid="User-Name"><span>@tone_user</span></div>
        <a href="/tone_user/status/99"><time datetime="2026-11-07T12:00:00.000Z">now</time></a>
      </article>
    </body></html>`);
    const sent = [];
    const storage = (await import('../../extension/storage/state.js')).createMemoryStorage({ toneEnabled: true });
    const api = await startFramingBadges(document, {
      storage,
      debounceMs: 0,
      immediate: true,
      now: () => NOW,
      toneDelayMs: 0,
      toneSend: async (request) => {
        sent.push(request);
        return { id: request.id, label: 'fun', ms: 12 };
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const article = document.querySelector('article');
    assert.equal(article.querySelector('.fcb-badge'), null);
    assert.equal(article.querySelector('.fcb-tone').textContent, 'Fun');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].id, '99');
    assert.equal(sent[0].text, 'Hello from the timeline today.');
    const saved = await storage.get();
    assert.equal(Object.hasOwn(saved, 'toneCache'), false);
    assert.equal(JSON.stringify(saved).includes('Hello from the timeline'), false);
    await api.scanNow();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sent.length, 1);
    api.disconnect();
    clearAsyncCheckers();
  });
});
