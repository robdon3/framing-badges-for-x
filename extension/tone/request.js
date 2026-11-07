import { frameToneRequest, parseHostMessage } from './protocol.js';

/** Sends one post. The text is cleared as soon as the send returns. The label is not stored here. */
export async function requestToneLabel({ id, text, labels, currentLabels, send }) {
  const request = frameToneRequest(id, text, labels);
  try {
    if (!request.id || !request.text) return { label: null };
    let response;
    try {
      response = await send(request);
    } catch {
      return { label: null, error: 'Tone host disconnected.' };
    }
    const allow = typeof currentLabels === 'function' ? currentLabels() : currentLabels;
    const parsed = parseHostMessage(response, allow === undefined ? request.labels : allow);
    if (parsed.id !== request.id) return { label: null };
    if (!parsed.label) return { label: null, error: parsed.error };
    return { label: parsed.label, ms: parsed.ms };
  } finally {
    request.text = '';
  }
}
