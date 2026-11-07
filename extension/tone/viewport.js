import { watchVisiblePost } from './watch.js';

/** Latest visible post is last. Oldest waiting post is first. */
export const TONE_QUEUE_CAP = 10;

export function createVisibleQueue(cap = TONE_QUEUE_CAP) {
  const limit = Math.max(1, cap);
  const items = [];

  return {
    add(entry) {
      const id = String(entry?.id || '');
      const text = String(entry?.text || '');
      if (!id || !text) return [];
      const index = items.findIndex((item) => item.id === id);
      if (index >= 0) items.splice(index, 1);
      items.push({ id, text });
      const dropped = [];
      while (items.length > limit) {
        const oldest = items.shift();
        if (oldest) {
          oldest.text = '';
          dropped.push(oldest.id);
        }
      }
      return dropped;
    },
    drop(id) {
      const key = String(id || '');
      const index = items.findIndex((item) => item.id === key);
      if (index < 0) return false;
      const [removed] = items.splice(index, 1);
      if (removed) removed.text = '';
      return true;
    },
    takeLatest() {
      return items.pop() || null;
    },
    get size() {
      return items.length;
    },
    ids() {
      return items.map((item) => item.id);
    },
  };
}

/**
 * Watch posts with the caller's IntersectionObserver.
 * Text is copied into the queue only after the dwell, and only while the post
 * stays visible. Leaving the viewport before the send drops that copy.
 * The queue keeps no element references.
 */
export function createToneController({
  memory,
  send,
  delayMs = 500,
  queueCap = TONE_QUEUE_CAP,
  observe,
  readPost,
  paint,
  schedule,
  cancel,
} = {}) {
  if (!memory || typeof send !== 'function' || typeof observe !== 'function' || typeof readPost !== 'function') {
    throw new TypeError('createToneController needs memory, send, observe, and readPost.');
  }
  const queue = createVisibleQueue(queueCap);
  const stops = new Set();
  let sending = false;
  let paused = false;

  async function pump() {
    if (sending || paused) return;
    sending = true;
    try {
      while (!paused) {
        const next = queue.takeLatest();
        if (!next) break;
        const payload = { id: next.id, text: next.text };
        next.text = '';
        let result = null;
        try {
          result = await send(payload);
        } catch {
          result = { id: payload.id, error: 'Tone host disconnected.' };
        } finally {
          payload.text = '';
        }
        if (result?.label) memory.set(payload.id, result.label);
        if (paused) break;
        if (result?.label) paint?.(payload.id, result.label);
      }
    } finally {
      sending = false;
      if (!paused && queue.size) pump();
    }
  }

  function watch(post, onLeave) {
    if (paused || !post) return () => {};
    let element = post;
    let queuedId = '';
    let stopObserve = () => {};
    const dwell = watchVisiblePost({
      delayMs,
      schedule,
      cancel,
      connected: () => element != null && element.isConnected !== false,
      onReady: () => {
        const el = element;
        if (!el) return;
        const snap = readPost(el);
        if (!snap?.id || !snap.text) return;
        const known = memory.get(snap.id);
        if (known) {
          paint?.(snap.id, known);
          return;
        }
        queue.add({ id: String(snap.id), text: snap.text });
        queuedId = String(snap.id);
        pump();
      },
    });

    function leave() {
      dwell.hide();
      if (queuedId) queue.drop(queuedId);
      queuedId = '';
      element = null;
      const detach = stopObserve;
      stopObserve = () => {};
      detach();
      stops.delete(stop);
      onLeave?.();
    }

    stopObserve = observe(post, (visible) => {
      if (!element) return;
      if (!visible) {
        leave();
        return;
      }
      const snap = readPost(element);
      if (snap?.id) {
        const known = memory.get(snap.id);
        if (known) {
          paint?.(snap.id, known);
          return;
        }
      }
      dwell.show();
    }) || (() => {});

    const stop = () => {
      dwell.stop();
      if (queuedId) queue.drop(queuedId);
      queuedId = '';
      element = null;
      stopObserve();
      stops.delete(stop);
    };
    stops.add(stop);
    return stop;
  }

  return {
    watch,
    queue,
    pause() {
      paused = true;
      for (const stop of [...stops]) stop();
      while (queue.size) {
        const item = queue.takeLatest();
        if (item) item.text = '';
      }
    },
    resume() {
      paused = false;
    },
  };
}
