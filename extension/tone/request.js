import { frameToneRequest, parseHostMessage } from './protocol.js';

/** Sends one post. Does not store the text or the label. */
export async function requestToneLabel({ id, text, send }) {
  const request = frameToneRequest(id, text);
  if (!request.id || !request.text) return { label: null };
  let response;
  try {
    response = await send(request);
  } catch (error) {
    return { label: null, error: error?.message || 'Tone host disconnected.' };
  }
  const parsed = parseHostMessage(response);
  if (!parsed.label) return { label: null, error: parsed.error };
  return { label: parsed.label, ms: parsed.ms };
}
