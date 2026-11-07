/** Chrome native host id. The manifest allowed_origins must match the extension id. */
export const HOST_NAME = 'com.xframingbadges.tone';

export const TONE_TEXT_LIMIT = 1000;
export const TONE_MESSAGE_TYPE = 'fcb-tone';

export const TONE_LABELS = Object.freeze([
  ['whining', 'Whining'],
  ['fun', 'Fun'],
  ['sad', 'Sad'],
  ['angry', 'Angry'],
  ['hype', 'Hype'],
  ['sarcastic', 'Sarcastic'],
  ['informative', 'Informative'],
  ['neutral', 'Neutral'],
]);

const LABEL_SET = new Set(TONE_LABELS.map(([id]) => id));

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

export function normalizeToneLabel(label) {
  const value = String(label ?? '').trim().toLowerCase();
  return LABEL_SET.has(value) ? value : null;
}

export function toneDisplayName(label) {
  const normalized = normalizeToneLabel(label);
  if (!normalized) return null;
  return TONE_LABELS.find(([id]) => id === normalized)[1];
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
export function frameToneRequest(id, text) {
  return {
    id: id == null ? '' : String(id),
    text: truncateToneText(text),
  };
}

export function parseHostMessage(message) {
  if (!message || typeof message !== 'object') {
    return { id: '', error: 'Tone host disconnected.' };
  }
  const id = message.id == null ? '' : String(message.id);
  if (message.error) {
    return { id, error: normalizeToneError(message.error) };
  }
  const label = normalizeToneLabel(message.label) || 'neutral';
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
