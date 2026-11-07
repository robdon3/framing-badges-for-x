import { createJobQueue } from './queue.js';
import { classifyDisconnect, frameToneRequest, parseHostMessage } from './protocol.js';

/**
 * One Chrome native-messaging port. The extension uses concurrency 1.
 * classify() opens the port on the first request. close() drops it.
 */
export function createToneSession({
  connect,
  concurrency = 1,
  timeoutMs = 30000,
  readDisconnectError = () => '',
  onDisconnect,
} = {}) {
  if (typeof connect !== 'function') throw new TypeError('createToneSession needs connect().');
  const queue = createJobQueue({ concurrency });
  let port = null;
  let generation = 0;
  const pending = new Map();

  function failPending(error) {
    for (const [id, waiter] of pending) {
      clearTimeout(waiter.timer);
      waiter.resolve({ id, error });
    }
    pending.clear();
  }

  function handleMessage(message) {
    const parsed = parseHostMessage(message);
    const waiter = pending.get(parsed.id);
    if (!waiter) return;
    pending.delete(parsed.id);
    clearTimeout(waiter.timer);
    waiter.resolve(parsed);
  }

  function dropPort(raw) {
    const error = classifyDisconnect(raw);
    port = null;
    failPending(error);
    onDisconnect?.(error);
  }

  function open() {
    if (port) return { ok: true };
    let created;
    try {
      created = connect();
    } catch {
      return { ok: false, message: 'Tone host not installed' };
    }
    if (!created?.onMessage?.addListener || !created?.onDisconnect?.addListener || !created.postMessage) {
      return { ok: false, message: 'Tone host not installed' };
    }
    const openedGeneration = generation;
    port = created;
    created.onMessage.addListener(handleMessage);
    created.onDisconnect.addListener(() => {
      if (openedGeneration !== generation || port !== created) return;
      dropPort(readDisconnectError() || created.lastErrorMessage || '');
    });
    return { ok: true };
  }

  function close(reason = 'Tone check is off.') {
    const current = port;
    generation += 1;
    port = null;
    failPending(reason);
    try {
      current?.disconnect?.();
    } catch {
      /* the port is already gone */
    }
  }

  function classify(incoming) {
    const request = frameToneRequest(incoming?.id, incoming?.text);
    return queue.enqueue(() => new Promise((resolve) => {
      const opened = open();
      if (!opened.ok || !port) {
        resolve({ id: request.id, error: opened.message || 'Tone host not installed' });
        return;
      }
      const timer = setTimeout(() => {
        if (!pending.has(request.id)) return;
        pending.delete(request.id);
        resolve({ id: request.id, error: 'Tone host timed out.' });
      }, timeoutMs);
      pending.set(request.id, { resolve, timer });
      try {
        port.postMessage(request);
      } catch {
        clearTimeout(timer);
        pending.delete(request.id);
        resolve({ id: request.id, error: 'Tone host not installed' });
      }
    }));
  }

  return {
    open,
    close,
    classify,
    isOpen() {
      return !!port;
    },
  };
}
