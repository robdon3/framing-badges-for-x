const HANDLE = /^[a-z0-9_]{1,15}$/;

export function normalizeHandle(value) {
  let text = String(value || '').trim().replace(/^@+/, '');
  const url = text.match(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})\/?$/i);
  if (url) text = url[1];
  return text.toLowerCase();
}

export function authorKey(handle) {
  return normalizeHandle(handle) || 'unknown';
}

export function parseHandleList(input) {
  const lines = Array.isArray(input) ? input : String(input || '').split(/\n+/);
  const handles = [];
  const skipped = [];
  const seen = new Set();
  for (const line of lines) {
    const trimmed = String(line).trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const handle = normalizeHandle(trimmed);
    if (!HANDLE.test(handle)) {
      skipped.push(trimmed);
      continue;
    }
    if (seen.has(handle)) continue;
    seen.add(handle);
    handles.push(handle);
  }
  return { handles, skipped };
}

export function classifyAuthor(handle, context = {}) {
  const key = authorKey(handle);
  const trustedList = context.trustedHandles || [];
  const noisyList = context.noisyHandles || [];
  const trusted = key !== 'unknown' && trustedList.includes(key);
  const noisy = key !== 'unknown' && noisyList.includes(key);
  let list = 'unlisted';
  if (trusted && noisy) list = 'both';
  else if (trusted) list = 'trusted';
  else if (noisy) list = 'noisy';
  return { handle: key, list, trusted, noisy };
}
