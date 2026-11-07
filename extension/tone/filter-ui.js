import { DEFAULT_STATE } from '../storage/state.js';
import { normalizeHiddenTones } from './filter.js';
import {
  DEFAULT_TONE_LABELS,
  FALLBACK_TONE,
  explainToneRejection,
  normalizeToneList,
  normalizeToneName,
  toneDisplayName,
} from './protocol.js';

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

/** Editable tone list. Names are textContent only. Neutral cannot be removed or hidden. */
export function bindHiddenTones({ container, chromeApi = globalThis.chrome } = {}) {
  if (!container) return;
  const doc = container.ownerDocument;
  container.replaceChildren();
  const rows = doc.createElement('div');
  rows.className = 'tone-rows';
  const form = doc.createElement('form');
  form.className = 'add-tone';
  const field = doc.createElement('input');
  field.type = 'text';
  field.maxLength = 24;
  field.autocomplete = 'off';
  field.placeholder = 'Add a tone';
  field.setAttribute('aria-label', 'New tone');
  const add = doc.createElement('button');
  add.type = 'submit';
  add.textContent = 'Add';
  form.append(field, add);
  const error = doc.createElement('p');
  error.className = 'tone-error';
  error.setAttribute('role', 'status');
  const reset = doc.createElement('button');
  reset.type = 'button';
  reset.className = 'tone-reset';
  reset.textContent = 'Reset to defaults';
  container.append(rows, form, error, reset);

  let labels = normalizeToneList();
  let hidden = [];

  function save(nextLabels, nextHidden) {
    return chromeApi.storage.local.set({
      toneLabels: nextLabels,
      hiddenTones: normalizeHiddenTones(nextHidden, nextLabels),
    }).catch(() => {
      error.textContent = 'Could not save tones.';
    });
  }

  function render() {
    rows.replaceChildren();
    const hiddenSet = new Set(hidden);
    for (const name of labels) {
      const row = doc.createElement('div');
      row.className = 'tone-row';
      const label = doc.createElement('label');
      label.className = 'hide-tone';
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.value = name;
      const text = doc.createElement('span');
      text.textContent = toneDisplayName(name) || name;
      label.append(input, text);
      row.append(label);
      if (name === FALLBACK_TONE) {
        input.disabled = true;
        input.checked = false;
        input.title = 'Neutral is the fallback and stays visible.';
      } else {
        input.checked = hiddenSet.has(name);
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'tone-remove';
        remove.textContent = 'x';
        remove.setAttribute('aria-label', `Remove ${name}`);
        remove.addEventListener('click', () => {
          labels = labels.filter((item) => item !== name);
          hidden = hidden.filter((item) => item !== name);
          error.textContent = '';
          save(labels, hidden);
          render();
        });
        row.append(remove);
      }
      input.addEventListener('change', () => {
        if (input.disabled) return;
        hidden = [...rows.querySelectorAll('input')]
          .filter((box) => box.checked && !box.disabled)
          .map((box) => box.value);
        save(labels, hidden);
      });
      rows.append(row);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const reason = explainToneRejection(field.value, labels);
    if (reason) {
      error.textContent = reason;
      return;
    }
    const name = normalizeToneName(field.value);
    labels = normalizeToneList([...labels, name]);
    error.textContent = '';
    field.value = '';
    save(labels, hidden);
    render();
  });

  reset.addEventListener('click', () => {
    labels = normalizeToneList(DEFAULT_TONE_LABELS);
    hidden = normalizeHiddenTones(hidden, labels);
    error.textContent = '';
    field.value = '';
    save(labels, hidden);
    render();
  });

  function apply(data) {
    labels = normalizeToneList(data?.toneLabels);
    hidden = normalizeHiddenTones(data?.hiddenTones, labels);
    render();
  }

  chromeApi.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || (!changes.toneLabels && !changes.hiddenTones)) return;
    chromeApi.storage.local.get(DEFAULT_STATE).then(apply).catch(() => {});
  });
  chromeApi.storage.local.get(DEFAULT_STATE).then(apply).catch(() => {
    error.textContent = 'Could not read tones.';
  });
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
