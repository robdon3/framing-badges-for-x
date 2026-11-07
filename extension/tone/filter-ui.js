import { DEFAULT_STATE } from '../storage/state.js';
import { normalizeHiddenTones } from './filter.js';
import { TONE_LABELS } from './protocol.js';

export const TONE_POPUP_PORT = 'fcb-popup';
export const HIDDEN_COUNT_TYPE = 'fcb-hidden-count';

export function hiddenCountMessage(count) {
  const n = Number(count);
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return { type: HIDDEN_COUNT_TYPE, count: safe };
}

export function hiddenCountLabel(count) {
  const n = Number(count);
  const safe = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return `Hidden this page: ${safe}`;
}

/** Checkboxes for the hide list. Saves only tone ids. */
export function bindHiddenTones({ container, chromeApi = globalThis.chrome } = {}) {
  if (!container) return;
  const doc = container.ownerDocument;
  container.replaceChildren();
  const boxes = new Map();
  for (const [id, name] of TONE_LABELS) {
    const label = doc.createElement('label');
    label.className = 'hide-tone';
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    const text = doc.createElement('span');
    text.textContent = name;
    label.append(input, text);
    container.append(label);
    boxes.set(id, input);
    input.addEventListener('change', () => {
      const selected = [...boxes.values()].filter((box) => box.checked).map((box) => box.value);
      chromeApi.storage.local.set({ hiddenTones: normalizeHiddenTones(selected) }).catch(() => {});
    });
  }

  function render(data) {
    const selected = new Set(normalizeHiddenTones(data?.hiddenTones));
    for (const [id, input] of boxes) input.checked = selected.has(id);
  }

  chromeApi.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes.hiddenTones) return;
    chromeApi.storage.local.get(DEFAULT_STATE).then(render).catch(() => {});
  });
  chromeApi.storage.local.get(DEFAULT_STATE).then(render).catch(() => {});
}

export function bindHiddenCount({ output, chromeApi = globalThis.chrome } = {}) {
  if (!output || !chromeApi?.runtime?.connect) return;
  output.textContent = hiddenCountLabel(0);
  const port = chromeApi.runtime.connect({ name: TONE_POPUP_PORT });
  port.onMessage.addListener((message) => {
    if (message?.type !== HIDDEN_COUNT_TYPE) return;
    output.textContent = hiddenCountLabel(message.count);
  });
}
