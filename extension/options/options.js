import { parseHandleList } from '../rules/sources.js';
import { DEFAULT_STATE } from '../storage/state.js';
import { bindHiddenTones } from '../tone/filter-ui.js';
import { bindToneToggle } from '../tone/toggle.js';

bindToneToggle({
  checkbox: document.querySelector('#tone'),
  status: document.querySelector('#tone-status'),
});
bindHiddenTones({ container: document.querySelector('#hidden-tones') });

const trusted = document.querySelector('#trusted');
const noisy = document.querySelector('#noisy');
const errors = document.querySelector('#list-errors');
const status = document.querySelector('#status');
const counts = document.querySelector('#counts');

function lines(handles) {
  return (handles || []).join('\n');
}

function renderCounts(map) {
  const rows = Object.entries(map || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  counts.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No flags recorded yet.';
    counts.append(empty);
    return;
  }
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const label of ['Handle', 'Flags']) {
    const cell = document.createElement('th');
    cell.textContent = label;
    head.append(cell);
  }
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  for (const [handle, count] of rows) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = `@${handle}`;
    const value = document.createElement('td');
    value.textContent = String(count);
    row.append(name, value);
    tbody.append(row);
  }
  table.append(thead, tbody);
  counts.append(table);
}

async function load() {
  const data = await chrome.storage.local.get(DEFAULT_STATE);
  trusted.value = lines(data.trustedHandles);
  noisy.value = lines(data.noisyHandles);
  renderCounts(data.authorFlagCounts);
}

function reportSkipped(skipped) {
  errors.textContent = skipped.length
    ? `Skipped ${skipped.length} line${skipped.length === 1 ? '' : 's'} that are not handles: ${skipped.slice(0, 4).join(', ')}.`
    : '';
}

document.querySelector('#lists').addEventListener('submit', async (event) => {
  event.preventDefault();
  const trustedList = parseHandleList(trusted.value);
  const noisyList = parseHandleList(noisy.value);
  reportSkipped([...trustedList.skipped, ...noisyList.skipped]);
  await chrome.storage.local.set({
    trustedHandles: trustedList.handles,
    noisyHandles: noisyList.handles,
  });
  trusted.value = lines(trustedList.handles);
  noisy.value = lines(noisyList.handles);
  status.textContent = 'Saved in this browser.';
});

document.querySelector('#reset').addEventListener('click', async () => {
  await chrome.storage.local.set({ authorFlagCounts: {}, countedPostIds: [] });
  renderCounts({});
  status.textContent = 'Flag counts cleared on this browser.';
});

load().catch(() => {
  status.textContent = 'Could not read chrome.storage.local.';
});
