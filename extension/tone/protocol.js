/** Chrome native host id. The manifest allowed_origins must match the extension id. */
export const HOST_NAME = 'com.xframingbadges.tone';

export const TONE_TEXT_LIMIT = 1000;
export const TONE_MESSAGE_TYPE = 'fcb-tone';

export const TONE_NAME_MAX = 24;
export const TONE_LIST_MAX = 12;

/** First-run list. Neutral is an ordinary tone and can be removed. */
export const DEFAULT_TONE_LABELS = Object.freeze([
  'whining',
  'fun',
  'sad',
  'angry',
  'hype',
  'sarcastic',
  'informative',
  'neutral',
]);

const TONE_NAME_CHARS = /[\u0000-\u001F\u007F\u00AD\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;

export const TONE_OFF_STATUS = Object.freeze({ code: 'off', message: 'Tone check is off.' });
export const TONE_PAGE_PORT = 'fcb-tone-page';

export const TONE_ARMED_STATUS = Object.freeze({
  code: 'armed',
  message: 'Tone check is on. It runs on this Mac when a post stays on screen.',
});
export const TONE_IDLE_STATUS = Object.freeze({
  code: 'idle',
  message: 'Tone check is on. The on-device model is idle.',
});
export const TONE_CONNECTING_STATUS = Object.freeze({
  code: 'connecting',
  message: 'Tone check is on. It runs on this Mac when a post stays on screen.',
});
export const TONE_CONNECTED_STATUS = Object.freeze({
  code: 'connected',
  message: 'Tone check is on. The Apple model runs on this Mac. Nothing is sent over the network.',
});
export const TONE_MISSING_STATUS = Object.freeze({
  code: 'missing',
  message: 'Tone host not installed',
});

const STATUS_CODES = new Set(['off', 'armed', 'idle', 'connecting', 'connected', 'missing', 'unavailable', 'error']);

/** Fixed strings only. A reply that is not in this set is not forwarded. */
export const GENERIC_TONE_ERROR = 'The on-device model could not classify this post.';

export const FIXED_TONE_MESSAGES = Object.freeze(new Set([
  TONE_OFF_STATUS.message,
  TONE_ARMED_STATUS.message,
  TONE_IDLE_STATUS.message,
  TONE_CONNECTING_STATUS.message,
  TONE_CONNECTED_STATUS.message,
  TONE_MISSING_STATUS.message,
  GENERIC_TONE_ERROR,
  'Post text is empty.',
  'Apple on-device model is unavailable: this Mac is not eligible.',
  'Apple on-device model is unavailable: Apple Intelligence is turned off.',
  'Apple on-device model is unavailable: the model is not ready yet.',
  'Apple on-device model is unavailable.',
  'Tone host disconnected.',
  'Tone host timed out.',
]));

const STRIPPED_CHARS = /[\u0000-\u001F\u007F\u00AD\u061C\u180E\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/** One tone name, or null when it breaks the rules. Control characters are rejected, not stripped. */
export function normalizeToneName(raw) {
  const text = String(raw ?? '').replace(/’/g, "'");
  if (TONE_NAME_CHARS.test(text)) return null;
  const value = text.trim().toLowerCase().replace(/[ \t]+/g, ' ');
  if (!value || [...value].length > TONE_NAME_MAX) return null;
  if (!/^[a-z0-9]+(?:[ '\-][a-z0-9]+)*$/.test(value)) return null;
  return value;
}

/** At most 12 tones. Missing input is the default list. Invalid names are dropped. Neutral is not added. */
export function normalizeToneList(raw) {
  if (!Array.isArray(raw)) return [...DEFAULT_TONE_LABELS];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const name = normalizeToneName(item);
    if (!name || seen.has(name)) continue;
    if (out.length >= TONE_LIST_MAX) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function hashToneList(raw) {
  const joined = normalizeToneList(raw).join('\n');
  let hash = 2166136261;
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

/** Plain reason for the popup, or '' when the name can be added. */
export function explainToneRejection(raw, list) {
  const text = String(raw ?? '');
  if (TONE_NAME_CHARS.test(text)) return 'Use letters, digits, spaces, hyphens, and apostrophes.';
  const value = text.trim().toLowerCase().replace(/[ \t]+/g, ' ').replace(/’/g, "'");
  if (!value) return 'Enter a tone.';
  if ([...value].length > TONE_NAME_MAX) return 'Use 24 characters or fewer.';
  const name = normalizeToneName(text);
  if (!name) return 'Use letters, digits, spaces, hyphens, and apostrophes.';
  const current = normalizeToneList(list);
  if (current.includes(name)) return 'That tone is already on the list.';
  if (current.length >= TONE_LIST_MAX) return 'You can add 12 tones.';
  return '';
}

export function explainToneRemoval(list) {
  if (normalizeToneList(list).length <= 1) return 'Keep at least one tone.';
  return '';
}

export function normalizeToneLabel(label, list) {
  const name = normalizeToneName(label);
  if (!name) return null;
  return normalizeToneList(list).includes(name) ? name : null;
}

export function toneDisplayName(label, list) {
  const name = normalizeToneName(label);
  if (!name) return null;
  if (list !== undefined && !normalizeToneList(list).includes(name)) return null;
  return name.replace(/(^|[\s-])([a-z0-9])/g, (_, sep, ch) => `${sep}${ch.toUpperCase()}`);
}

export function normalizeToneError(error) {
  const text = String(error ?? '').replace(/\s+/g, ' ').trim();
  if (FIXED_TONE_MESSAGES.has(text)) return text;
  if (/not found|forbidden|specified native messaging host/i.test(text)) return TONE_MISSING_STATUS.message;
  return GENERIC_TONE_ERROR;
}

/** Drop control, zero-width, and bidi marks, then the prompt delimiters, then cap the length. */
export function sanitizeToneText(text) {
  let value = String(text ?? '').replace(STRIPPED_CHARS, '');
  const delimiters = /\[\[\/?\s*POST\s*\]\]|<<<\/?\s*POST\s*>>>|<\/?\s*post\s*>/gi;
  for (let pass = 0; pass < 4; pass += 1) {
    delimiters.lastIndex = 0;
    const next = value.replace(delimiters, ' ');
    if (next === value) break;
    value = next;
  }
  value = value.replace(/[ \t]{2,}/g, ' ').trim();
  return [...value].slice(0, TONE_TEXT_LIMIT).join('');
}

export function truncateToneText(text) {
  return sanitizeToneText(text);
}

/** JSON body the host expects. Chrome adds the 4-byte length frame. */
export function frameToneRequest(id, text, labels) {
  return {
    id: id == null ? '' : String(id),
    text: truncateToneText(text),
    labels: normalizeToneList(labels),
  };
}

export function parseHostMessage(message, labels) {
  if (!message || typeof message !== 'object') {
    return { id: '', error: 'Tone host disconnected.' };
  }
  const id = message.id == null ? '' : String(message.id);
  if (message.error) {
    return { id, error: normalizeToneError(message.error) };
  }
  const allowed = normalizeToneList(labels === undefined ? undefined : labels);
  const name = message.label == null ? null : normalizeToneName(message.label);
  const label = name && allowed.includes(name) ? name : null;
  const ms = Number(message.ms);
  return {
    id,
    label,
    ms: Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : null,
  };
}

export function classifyDisconnect(raw) {
  const text = String(raw || '');
  if (/not found|forbidden|specified native messaging host/i.test(text)) {
    return 'Tone host not installed';
  }
  return 'Tone host disconnected.';
}

export function normalizeToneStatus(raw) {
  const code = STATUS_CODES.has(raw?.code) ? raw.code : 'off';
  const message = String(raw?.message || '').replace(/\s+/g, ' ').trim();
  if (FIXED_TONE_MESSAGES.has(message)) return { code, message };
  if (code === 'connected') return { code, message: TONE_CONNECTED_STATUS.message };
  if (code === 'armed' || code === 'connecting') return { code, message: TONE_ARMED_STATUS.message };
  if (code === 'idle') return { code, message: TONE_IDLE_STATUS.message };
  if (code === 'missing') return { code, message: TONE_MISSING_STATUS.message };
  if (code === 'unavailable') return { code, message: 'Apple on-device model is unavailable.' };
  if (code === 'off') return { code, message: TONE_OFF_STATUS.message };
  return { code, message: 'Tone host disconnected.' };
}

export function statusForHostError(error) {
  const message = normalizeToneError(error);
  if (message === TONE_MISSING_STATUS.message) return { ...TONE_MISSING_STATUS };
  const code = /unavailable/i.test(message) ? 'unavailable' : 'error';
  return { code, message };
}
