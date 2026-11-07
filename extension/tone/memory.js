import { FALLBACK_TONE, hashToneList, normalizeToneList, normalizeToneName } from './protocol.js';

/** In-page labels only. A refresh drops the map. Nothing here is written to disk. */
export const TONE_MEMORY_CAP = 300;

/**
 * Labels for one tone list. The key is the post id plus the list hash.
 * A different list clears the previous labels.
 */
export function createToneMemory(cap = TONE_MEMORY_CAP) {
  const limit = Math.max(1, cap);
  const labels = new Map();
  let listHash = hashToneList();
  let allowed = new Set(normalizeToneList());

  function storageKey(id) {
    return `${listHash}:${id}`;
  }

  function touch(id, label) {
    const key = storageKey(id);
    labels.delete(key);
    labels.set(key, label);
    while (labels.size > limit) {
      const oldest = labels.keys().next().value;
      labels.delete(oldest);
    }
  }

  return {
    useList(list) {
      const normalized = normalizeToneList(list);
      const next = hashToneList(normalized);
      if (next !== listHash) {
        labels.clear();
        listHash = next;
        allowed = new Set(normalized);
      }
      return listHash;
    },
    get hash() {
      return listHash;
    },
    get(id) {
      const key = storageKey(String(id || ''));
      if (!labels.has(key)) return null;
      const label = labels.get(key);
      touch(String(id || ''), label);
      return label;
    },
    set(id, label) {
      const key = String(id || '');
      const name = normalizeToneName(label);
      if (!key || !name || name === '' || !allowed.has(name)) return false;
      if (name !== FALLBACK_TONE && !allowed.has(name)) return false;
      touch(key, name);
      return true;
    },
    clear() {
      labels.clear();
    },
    get size() {
      return labels.size;
    },
  };
}
