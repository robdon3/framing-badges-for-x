import { normalizeToneLabel } from './protocol.js';

/** In-page labels only. A refresh drops the map. Nothing here is written to disk. */
export const TONE_MEMORY_CAP = 300;

export function createToneMemory(cap = TONE_MEMORY_CAP) {
  const limit = Math.max(1, cap);
  const labels = new Map();

  function touch(id, label) {
    labels.delete(id);
    labels.set(id, label);
    while (labels.size > limit) {
      const oldest = labels.keys().next().value;
      labels.delete(oldest);
    }
  }

  return {
    get(id) {
      const key = String(id || '');
      if (!labels.has(key)) return null;
      const label = labels.get(key);
      touch(key, label);
      return label;
    },
    set(id, label) {
      const key = String(id || '');
      const normalized = normalizeToneLabel(label);
      if (!key || !normalized) return false;
      touch(key, normalized);
      return true;
    },
    get size() {
      return labels.size;
    },
  };
}
