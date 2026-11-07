import { frameToneRequest, hashToneList, parseHostMessage } from './protocol.js';

/** Sends one post. The text is cleared as soon as the send returns. The label is not stored here. */
export async function requestToneLabel({ id, text, labels, currentLabels, listHash, currentHash, send }) {
  const request = frameToneRequest(id, text, labels);
  const sentHash = listHash || hashToneList(request.labels);
  try {
    if (!request.id || !request.text) return { label: null };
    let response;
    try {
      response = await send(request);
    } catch {
      return { label: null, error: 'Tone host disconnected.' };
    }
    const hashNow = typeof currentHash === 'function' ? currentHash() : currentHash;
    if (hashNow && hashNow !== sentHash) return { id: request.id, label: null, stale: true };
    const allow = typeof currentLabels === 'function' ? currentLabels() : currentLabels;
    const parsed = parseHostMessage(response, allow === undefined ? request.labels : allow);
    if (parsed.id !== request.id) return { id: request.id, label: null, ignored: true };
    if (parsed.error) return { id: request.id, label: null, error: parsed.error };
    if (!parsed.label) return { id: request.id, label: null, ms: parsed.ms };
    return { id: request.id, label: parsed.label, ms: parsed.ms };
  } finally {
    request.text = '';
  }
}
