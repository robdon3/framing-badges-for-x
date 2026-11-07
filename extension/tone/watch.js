/**
 * Call `onReady` only if the post stays visible for `delayMs`.
 * `hide()` before the timer fires cancels the send.
 */
export function watchVisiblePost({
  post,
  connected,
  delayMs = 500,
  onReady,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (timer) => clearTimeout(timer),
} = {}) {
  let timer = null;
  let stopped = false;

  function clear() {
    if (timer == null) return;
    cancel(timer);
    timer = null;
  }

  return {
    show() {
      if (stopped || timer != null) return;
      const scheduled = schedule(() => {
        if (timer !== scheduled) return;
        timer = null;
        if (stopped) return;
        if (typeof connected === 'function') {
          if (!connected()) return;
        } else if (post && post.isConnected === false) return;
        onReady?.();
      }, delayMs);
      timer = scheduled;
    },
    hide() {
      clear();
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
