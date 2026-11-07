export const TONE_IDLE_MS = 60000;

/**
 * The native host stays closed until the first request.
 * It closes again after idleMs with no requests, when tone is turned off,
 * or when the last x.com tab disconnects.
 */
export function createToneLifetime({
  session,
  idleMs = TONE_IDLE_MS,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (timer) => clearTimeout(timer),
  onIdle,
} = {}) {
  if (!session) throw new TypeError('createToneLifetime needs a session.');
  let enabled = false;
  let tabs = 0;
  let idleTimer = null;

  function clearIdle() {
    if (idleTimer == null) return;
    cancel(idleTimer);
    idleTimer = null;
  }

  function disconnect(reason) {
    clearIdle();
    session.close(reason);
  }

  function armIdle() {
    clearIdle();
    if (!enabled || !session.isOpen()) return;
    idleTimer = schedule(() => {
      idleTimer = null;
      if (!enabled) return;
      session.close('Tone host disconnected.');
      onIdle?.();
    }, idleMs);
  }

  return {
    setEnabled(on) {
      enabled = on === true;
      if (!enabled) disconnect('Tone check is off.');
    },
    tabOpened() {
      tabs += 1;
    },
    tabClosed() {
      tabs = Math.max(0, tabs - 1);
      if (tabs === 0) disconnect('Tone host disconnected.');
    },
    get tabs() {
      return tabs;
    },
    request(payload) {
      if (!enabled) {
        return Promise.resolve({
          id: payload?.id == null ? '' : String(payload.id),
          error: 'Tone check is off.',
        });
      }
      clearIdle();
      return session.classify(payload).finally(() => {
        if (!enabled) disconnect('Tone check is off.');
        else armIdle();
      });
    },
  };
}
