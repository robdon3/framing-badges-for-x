import { authorKey, normalizeHandle } from '../rules/sources.js';
import { normalizeHiddenTones } from '../tone/filter.js';
import { TONE_OFF_STATUS, normalizeToneList, normalizeToneStatus } from '../tone/protocol.js';

export const MAX_HANDLES = 500;
export const COUNTED_ID_CAP = 2000;

export const STORAGE_KEYS = Object.freeze([
  'trustedHandles',
  'noisyHandles',
  'authorFlagCounts',
  'countedPostIds',
  'toneEnabled',
  'toneLabels',
  'hiddenTones',
  'toneStatus',
]);

export const DEFAULT_STATE = {
  trustedHandles: [],
  noisyHandles: [],
  authorFlagCounts: {},
  countedPostIds: [],
  toneEnabled: false,
  toneLabels: normalizeToneList(),
  hiddenTones: [],
  toneStatus: { code: TONE_OFF_STATUS.code, message: TONE_OFF_STATUS.message },
};

function uniqueHandles(values) {
  const seen = new Set();
  const out = [];
  for (const value of values || []) {
    const handle = normalizeHandle(value);
    if (!/^[a-z0-9_]{1,15}$/.test(handle) || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
    if (out.length >= MAX_HANDLES) break;
  }
  return out;
}

export function normalizeState(raw) {
  const authorFlagCounts = {};
  for (const [key, value] of Object.entries(raw?.authorFlagCounts || {})) {
    const handle = authorKey(key);
    const count = Number(value);
    if (!Number.isFinite(count) || count < 0) continue;
    authorFlagCounts[handle] = Math.floor(count);
  }
  const countedPostIds = Array.isArray(raw?.countedPostIds)
    ? raw.countedPostIds.map(String).filter(Boolean).slice(-COUNTED_ID_CAP)
    : [];
  return {
    trustedHandles: uniqueHandles(raw?.trustedHandles),
    noisyHandles: uniqueHandles(raw?.noisyHandles),
    authorFlagCounts,
    countedPostIds,
    toneEnabled: raw?.toneEnabled === true,
    toneLabels: normalizeToneList(raw?.toneLabels),
    hiddenTones: normalizeHiddenTones(raw?.hiddenTones, normalizeToneList(raw?.toneLabels)),
    toneStatus: normalizeToneStatus(raw?.toneStatus),
  };
}

/** Writes only settings. Post text and any other key are dropped. */
export function settingsPatch(patch) {
  const picked = {};
  if (!patch || typeof patch !== 'object') return picked;
  for (const key of STORAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) picked[key] = patch[key];
  }
  const normalized = normalizeState({ ...DEFAULT_STATE, ...picked });
  const out = {};
  for (const key of STORAGE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = normalized[key];
  }
  return out;
}

export function recordFlag(state, handle, postId) {
  const current = normalizeState(state);
  const id = String(postId || '');
  if (id && current.countedPostIds.includes(id)) {
    return { state: current, changed: false };
  }
  const key = authorKey(handle);
  const authorFlagCounts = {
    ...current.authorFlagCounts,
    [key]: (current.authorFlagCounts[key] || 0) + 1,
  };
  const countedPostIds = id
    ? [...current.countedPostIds, id].slice(-COUNTED_ID_CAP)
    : current.countedPostIds;
  return {
    state: { ...current, authorFlagCounts, countedPostIds },
    changed: true,
  };
}

export function createMemoryStorage(initial = {}) {
  let state = normalizeState({ ...DEFAULT_STATE, ...initial });
  const listeners = new Set();
  return {
    async get() {
      return structuredClone(state);
    },
    async set(patch) {
      const safe = settingsPatch(patch);
      state = normalizeState({ ...state, ...safe });
      for (const listener of listeners) listener(safe);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function hasChromeStorage() {
  return !!globalThis.chrome?.storage?.local;
}

export function createChromeStorage() {
  const chromeApi = globalThis.chrome;
  return {
    async get() {
      const data = await chromeApi.storage.local.get(DEFAULT_STATE);
      return normalizeState(data);
    },
    async set(patch) {
      await chromeApi.storage.local.set(settingsPatch(patch));
    },
    subscribe(fn) {
      if (!chromeApi.storage?.onChanged) return () => {};
      const listener = (changes, area) => {
        if (area === 'local') fn(changes);
      };
      chromeApi.storage.onChanged.addListener(listener);
      return () => chromeApi.storage.onChanged.removeListener(listener);
    },
  };
}
