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

export function normalizeToneLabel(label) {
  const value = String(label ?? '').trim().toLowerCase();
  return LABEL_SET.has(value) ? value : null;
}

export function toneDisplayName(label) {
  const normalized = normalizeToneLabel(label);
  if (!normalized) return null;
  return TONE_LABELS.find(([id]) => id === normalized)[1];
}

export function truncateToneText(text) {
  const value = String(text ?? '').trim();
  return [...value].slice(0, TONE_TEXT_LIMIT).join('');
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
    const error = String(message.error).replace(/\s+/g, ' ').trim().slice(0, 300);
    return { id, error: error || 'The on-device model could not classify this post.' };
  }
  const label = normalizeToneLabel(message.label);
  if (!label) return { id, error: 'Tone host returned an unknown label.' };
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
  const message = String(raw?.message || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (message) return { code, message };
  if (code === 'connected') return { code, message: TONE_CONNECTED_STATUS.message };
  if (code === 'armed' || code === 'connecting') return { code, message: TONE_ARMED_STATUS.message };
  if (code === 'idle') return { code, message: TONE_IDLE_STATUS.message };
  if (code === 'missing') return { code, message: TONE_MISSING_STATUS.message };
  if (code === 'off') return { code, message: TONE_OFF_STATUS.message };
  return { code, message: 'Tone host disconnected.' };
}

export function statusForHostError(error) {
  if (error === TONE_MISSING_STATUS.message) return { ...TONE_MISSING_STATUS };
  const text = String(error || 'Tone host disconnected.').slice(0, 300);
  const code = /unavailable/i.test(text) ? 'unavailable' : 'error';
  return { code, message: text };
}
