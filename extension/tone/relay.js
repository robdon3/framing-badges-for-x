import { frameToneRequest } from './protocol.js';

/**
 * The service worker does not keep a tone list. Each message supplies its own labels.
 * Post text is cleared on the incoming message after it is copied into the request.
 */
export function buildToneRelay(message) {
  const request = frameToneRequest(message?.id, message?.text, message?.labels);
  if (message && typeof message === 'object') message.text = '';
  return request;
}
