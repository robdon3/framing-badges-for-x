import { registerAsyncChecker } from './async-check.js';
import { applyAsyncResult, hideOpenTips, mountBadge } from './badge.js';
import { extractPost } from './extract.js';
import { columnScrollRoot, findPosts } from './selectors.js';
import { scorePost } from './scorer.js';
import { authorKey } from '../rules/sources.js';
import { createChromeStorage, createMemoryStorage, hasChromeStorage, normalizeState, recordFlag } from '../storage/state.js';
import { syncPostCollapse } from '../tone/filter.js';
import { hiddenCountMessage } from '../tone/filter-ui.js';
import { createToneMemory } from '../tone/memory.js';
import { TONE_MESSAGE_TYPE, TONE_PAGE_PORT } from '../tone/protocol.js';
import { requestToneLabel } from '../tone/request.js';
import { createToneController } from '../tone/viewport.js';

const running = new WeakMap();
const BATCH = 20;

function readFixtureNow(doc) {
  const root = doc?.documentElement;
  if (root?.dataset?.fcbFixture !== '1') return null;
  const raw = root.getAttribute('data-fcb-fixture-now');
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return () => new Date(date.getTime());
}

function debounce(fn, ms) {
  let timer = null;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

async function start(doc, options) {
  if (!doc.body) {
    await new Promise((resolve) => {
      doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    });
  }
  const storage = options.storage || (hasChromeStorage() ? createChromeStorage() : createMemoryStorage());
  const debounceMs = options.debounceMs ?? 150;
  const nowFn = options.now || readFixtureNow(doc) || (() => new Date());
  let state = normalizeState(await storage.get().catch(() => ({})));
  let toneUnregister = null;
  let pagePort = null;
  const revealedPosts = new Set();
  const toneMemory = options.toneMemory || createToneMemory();
  const toneController = createToneController({
    memory: toneMemory,
    delayMs: options.toneDelayMs ?? 500,
    readPost(post) {
      try {
        const snap = extractPost(post);
        if (!snap?.id || !snap.text) return null;
        if (post.dataset) post.dataset.fcbPostId = String(snap.id);
        return { id: String(snap.id), text: snap.text };
      } catch {
        return null;
      }
    },
    paint(id, label) {
      const post = findTonePost(id);
      if (!post || post.isConnected === false) return;
      applyAsyncResult(post, { hits: [], tone: { label } });
      applyHiddenTones();
    },
    observe(post, onVisible) {
      const IO = globalThis.IntersectionObserver;
      if (typeof IO !== 'function') {
        onVisible(true);
        return () => {};
      }
      const observer = new IO((entries) => {
        const visible = entries.some((entry) => entry.isIntersecting && entry.target === post);
        onVisible(visible);
      }, { root: columnScrollRoot(post), threshold: 0.01 });
      observer.observe(post);
      return () => observer.disconnect();
    },
    send(entry) {
      return requestToneLabel({ id: entry.id, text: entry.text, send: toneSender });
    },
  });

  function findTonePost(id) {
    const key = String(id);
    for (const post of findPosts(doc.body || doc)) {
      if (post.dataset?.fcbPostId === key) return post;
    }
    return null;
  }

  function toneSender(request) {
    if (typeof options.toneSend === 'function') return options.toneSend(request);
    syncPagePort();
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.runtime?.sendMessage) {
      return Promise.resolve({ id: request.id, error: 'Tone host not installed' });
    }
    return chromeApi.runtime.sendMessage({
      type: TONE_MESSAGE_TYPE,
      id: request.id,
      text: request.text,
    });
  }

  function syncPagePort() {
    if (!state.toneEnabled || typeof options.toneSend === 'function') {
      pagePort?.disconnect?.();
      pagePort = null;
      return;
    }
    if (pagePort) return;
    const chromeApi = globalThis.chrome;
    if (!chromeApi?.runtime?.connect) return;
    try {
      pagePort = chromeApi.runtime.connect({ name: TONE_PAGE_PORT });
      pagePort.onDisconnect.addListener(() => {
        pagePort = null;
      });
      reportHiddenCount();
    } catch {
      pagePort = null;
    }
  }

  function toneChecker(snapshot) {
    const label = toneMemory.get(snapshot?.id);
    if (!label) return { hits: [], tone: null };
    return { hits: [], tone: { label } };
  }

  function removeToneChips() {
    for (const chip of doc.querySelectorAll('.fcb-tone')) chip.remove();
    for (const host of doc.querySelectorAll('.fcb-host')) {
      if (host.dataset) delete host.dataset.fcbTone;
    }
    for (const post of findPosts(doc.body || doc)) {
      if (post.dataset) delete post.dataset.fcbToneLive;
    }
  }

  function stopToneWatches() {
    toneController.pause();
    toneUnregister?.();
    toneUnregister = null;
    pagePort?.disconnect?.();
    pagePort = null;
    removeToneChips();
  }

  function syncToneRegistration() {
    toneUnregister?.();
    toneUnregister = null;
    if (!state.toneEnabled) return;
    toneController.resume();
    toneUnregister = registerAsyncChecker(toneChecker);
    syncPagePort();
  }

  function roughlyInView(post) {
    const rect = post.getBoundingClientRect?.();
    if (!rect) return true;
    if (!rect.height && !rect.width && !rect.top && !rect.bottom) return true;
    const root = columnScrollRoot(post);
    const box = root?.getBoundingClientRect?.();
    const top = box?.top ?? 0;
    const bottom = box?.bottom ?? (post.ownerDocument?.defaultView?.innerHeight || 800);
    return rect.bottom > top - 40 && rect.top < bottom + 40;
  }

  function armTone(post) {
    if (!state.toneEnabled || !post || post.dataset?.fcbToneLive === '1') return;
    if (!roughlyInView(post)) return;
    if (post.dataset) post.dataset.fcbToneLive = '1';
    toneController.watch(post, () => {
      if (post.dataset) delete post.dataset.fcbToneLive;
    });
  }

  function rescanTone() {
    if (!state.toneEnabled) return;
    for (const post of findPosts(doc.body || doc)) {
      if (post.dataset?.fcbScored !== '1') continue;
      armTone(post);
    }
    applyHiddenTones();
  }

  function collapsePost(post, visibleOnly = true) {
    const id = post?.dataset?.fcbPostId;
    if (!id) return;
    if (visibleOnly && !roughlyInView(post)) return;
    syncPostCollapse(post, {
      label: toneMemory.get(id),
      hiddenTones: state.hiddenTones,
      revealed: revealedPosts,
      postId: id,
      onShow(postId) {
        revealedPosts.add(String(postId));
        applyHiddenTones();
      },
    });
  }

  function applyHiddenTones(options = {}) {
    const visibleOnly = options.visibleOnly !== false;
    for (const post of findPosts(doc.body || doc)) collapsePost(post, visibleOnly);
    reportHiddenCount();
  }

  function reportHiddenCount() {
    if (!pagePort?.postMessage) return;
    try {
      pagePort.postMessage(hiddenCountMessage(doc.querySelectorAll('.fcb-hidden-bar').length));
    } catch {
      pagePort = null;
    }
  }

  function refreshTone() {
    if (!state.toneEnabled) {
      stopToneWatches();
      return;
    }
    syncToneRegistration();
    rescanTone();
  }

  syncToneRegistration();

  const unsubscribe = storage.subscribe?.(() => {
    storage.get().then((next) => {
      const was = state.toneEnabled;
      const prevHidden = (state.hiddenTones || []).join(',');
      state = normalizeState(next);
      if (state.toneEnabled !== was) refreshTone();
      if ((state.hiddenTones || []).join(',') !== prevHidden) applyHiddenTones({ visibleOnly: false });
    }).catch(() => {});
  });

  let scoreChain = Promise.resolve();
  const enqueueScore = (post) => {
    const job = scoreChain.then(() => scoreAndBadge(post));
    scoreChain = job.catch(() => {});
    return job;
  };

  async function scoreAndBadge(post) {
    if (!post || post.isConnected === false) return;
    if ([...post.children].some((child) => child.classList?.contains('fcb-host'))) return;
    let snapshot;
    try {
      snapshot = extractPost(post);
    } catch {
      return;
    }
    const context = {
      now: nowFn(),
      trustedHandles: state.trustedHandles,
      noisyHandles: state.noisyHandles,
      authorFlagCounts: state.authorFlagCounts,
    };
    const result = scorePost(snapshot, context);
    if (result.hits.length > 0) {
      const next = recordFlag(state, snapshot.authorHandle, snapshot.id);
      if (next.changed) {
        state = next.state;
        try {
          await storage.set({
            authorFlagCounts: state.authorFlagCounts,
            countedPostIds: state.countedPostIds,
          });
        } catch {
          result.author.flagCount = null;
        }
      }
      result.author.flagCount = state.authorFlagCounts[authorKey(snapshot.authorHandle)] ?? result.author.flagCount;
    } else {
      result.author.flagCount = state.authorFlagCounts[authorKey(snapshot.authorHandle)] || 0;
    }
    if (result.badge) {
      try {
        mountBadge(post, result);
      } catch {
        /* one bad post should not stall the feed */
      }
    }
    if (post.dataset) {
      post.dataset.fcbPostId = String(snapshot.id);
      post.dataset.fcbScored = '1';
    }
    collapsePost(post, false);
    armTone(post);
  }

  const queue = [];
  let flushing = false;
  const seen = (post) => post.dataset?.fcbSeen === '1' || post.getAttribute?.('data-fcb-seen') === '1';
  const mark = (post) => {
    post.dataset.fcbSeen = '1';
  };

  function enqueue(root) {
    for (const post of findPosts(root)) {
      if (seen(post)) continue;
      mark(post);
      queue.push(post);
    }
  }

  const IO = globalThis.IntersectionObserver;
  const observers = new Set();
  const columnObservers = new Map();
  let viewportObserver = null;
  function makeObserver(root) {
    let observer;
    observer = new IO((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        enqueueScore(entry.target);
      }
    }, { root, rootMargin: '120px 0px', threshold: 0.01 });
    observers.add(observer);
    return observer;
  }
  function observerFor(post) {
    if (typeof IO !== 'function') return null;
    const scroller = columnScrollRoot(post);
    if (!scroller) {
      if (!viewportObserver) viewportObserver = makeObserver(null);
      return viewportObserver;
    }
    let columnObserver = columnObservers.get(scroller);
    if (!columnObserver) {
      columnObserver = makeObserver(scroller);
      columnObservers.set(scroller, columnObserver);
    }
    return columnObserver;
  }

  async function flush() {
    if (flushing) {
      await scoreChain;
      return;
    }
    flushing = true;
    try {
      let budget = options.immediate ? queue.length || 1 : BATCH;
      while (queue.length && budget > 0) {
        const post = queue.shift();
        budget -= 1;
        if (!post || post.isConnected === false) continue;
        const observer = observerFor(post);
        if (observer) observer.observe(post);
        else enqueueScore(post);
      }
      await scoreChain;
      applyHiddenTones();
    } finally {
      flushing = false;
      if (queue.length) schedule();
    }
  }

  const schedule = debounce(() => {
    flush().catch(() => {});
  }, debounceMs);
  const scheduleRepair = debounce(() => {
    applyHiddenTones();
  }, debounceMs);

  const MO = globalThis.MutationObserver;
  const mo = typeof MO === 'function'
    ? new MO((records) => {
      let repair = false;
      for (const record of records) {
        if (record.type === 'attributes') {
          repair = true;
          continue;
        }
        for (const node of record.addedNodes || []) {
          if (node.nodeType === 1) enqueue(node);
        }
        if (record.removedNodes?.length) repair = true;
      }
      if (queue.length) schedule();
      if (repair) scheduleRepair();
    })
    : null;
  mo?.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-fcb-collapsed'],
  });
  const rescanSoon = debounce(() => {
    rescanTone();
  }, debounceMs);
  doc.addEventListener('scroll', () => {
    hideOpenTips(doc);
    rescanSoon();
  }, true);
  enqueue(doc.body || doc);
  if (options.immediate) await flush();
  else schedule();

  return {
    disconnect() {
      mo?.disconnect();
      for (const observer of observers) observer.disconnect();
      stopToneWatches();
      unsubscribe?.();
    },
    async scanNow() {
      enqueue(doc.body || doc);
      await flush();
    },
  };
}

export function startFramingBadges(doc, options = {}) {
  if (!doc) throw new Error('startFramingBadges needs a document.');
  if (running.has(doc)) return running.get(doc);
  const job = start(doc, options);
  running.set(doc, job);
  return job;
}

const extensionApi = globalThis.chrome;
const isExtensionContentScript = !!extensionApi?.runtime?.id && typeof document !== 'undefined';
if (isExtensionContentScript) {
  document.documentElement.dataset.fcbLive = '1';
  if (document.documentElement.dataset.fcbFixture === '1' && extensionApi.runtime?.id) {
    document.documentElement.dataset.fcbExtensionId = extensionApi.runtime.id;
  }
  startFramingBadges(document).catch(() => {});
}
