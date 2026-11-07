import { startFramingBadges } from '../extension/content/content.js';
import { createMemoryStorage } from '../extension/storage/state.js';

async function boot() {
  await new Promise((resolve) => setTimeout(resolve, 150));
  const root = document.documentElement;
  if (root.dataset.fcbLive === '1' || document.querySelector('.fcb-host')) return;
  const storage = createMemoryStorage({
    trustedHandles: ['trusted_desk'],
    noisyHandles: ['noisy_desk'],
  });
  await startFramingBadges(document, {
    storage,
    debounceMs: 0,
    immediate: true,
  });
}

boot();
