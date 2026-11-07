import { createToneLifetime } from '../tone/lifetime.js';
import { createToneSession } from '../tone/session.js';
import { HIDDEN_COUNT_TYPE, TONE_POPUP_PORT, hiddenCountMessage } from '../tone/filter-ui.js';
import {
  HOST_NAME,
  TONE_ARMED_STATUS,
  TONE_CONNECTED_STATUS,
  TONE_IDLE_STATUS,
  TONE_MESSAGE_TYPE,
  TONE_MISSING_STATUS,
  TONE_OFF_STATUS,
  TONE_PAGE_PORT,
  frameToneRequest,
  statusForHostError,
} from '../tone/protocol.js';
import { DEFAULT_STATE, normalizeState } from '../storage/state.js';

// One native port (com.xframingbadges.tone), opened on the first request and closed when idle.
const TONE_CONCURRENCY = 1;

const session = createToneSession({
  concurrency: TONE_CONCURRENCY,
  connect: () => chrome.runtime.connectNative(HOST_NAME),
  readDisconnectError: () => chrome.runtime.lastError?.message || '',
  onDisconnect(message) {
    chrome.storage.local.set({
      toneStatus: message === TONE_MISSING_STATUS.message
        ? { ...TONE_MISSING_STATUS }
        : statusForHostError(message),
    }).catch(() => {});
  },
});

const lifetime = createToneLifetime({
  session,
  onIdle() {
    publish({ ...TONE_IDLE_STATUS }).catch(() => {});
  },
});

async function publish(status) {
  await chrome.storage.local.set({ toneStatus: status });
}

async function boot() {
  await chrome.storage.local.remove('toneCache').catch(() => {});
  const data = normalizeState(await chrome.storage.local.get(DEFAULT_STATE));
  lifetime.setEnabled(data.toneEnabled === true);
  if (!data.toneEnabled) {
    if (data.toneStatus.code !== 'off') await publish({ ...TONE_OFF_STATUS });
    return;
  }
  if (data.toneStatus.code !== 'armed') await publish({ ...TONE_ARMED_STATUS });
}

chrome.runtime.onInstalled.addListener(() => {
  boot().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  boot().catch(() => {});
});

const hiddenCounts = new Map();
const popupPorts = new Set();

function hiddenTotal() {
  let total = 0;
  for (const count of hiddenCounts.values()) total += count;
  return total;
}

function pushHiddenCount() {
  const message = hiddenCountMessage(hiddenTotal());
  for (const port of popupPorts) {
    try {
      port.postMessage(message);
    } catch {
      popupPorts.delete(port);
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === TONE_PAGE_PORT) {
    lifetime.tabOpened();
    hiddenCounts.set(port, 0);
    port.onMessage.addListener((message) => {
      if (message?.type !== HIDDEN_COUNT_TYPE) return;
      hiddenCounts.set(port, hiddenCountMessage(message.count).count);
      pushHiddenCount();
    });
    port.onDisconnect.addListener(() => {
      lifetime.tabClosed();
      hiddenCounts.delete(port);
      pushHiddenCount();
    });
    return;
  }
  if (port.name !== TONE_POPUP_PORT) return;
  popupPorts.add(port);
  try {
    port.postMessage(hiddenCountMessage(hiddenTotal()));
  } catch {
    popupPorts.delete(port);
  }
  port.onDisconnect.addListener(() => popupPorts.delete(port));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.toneEnabled) return;
  const enabled = changes.toneEnabled.newValue === true;
  lifetime.setEnabled(enabled);
  publish(enabled ? { ...TONE_ARMED_STATUS } : { ...TONE_OFF_STATUS }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== TONE_MESSAGE_TYPE) return false;
  if (sender?.id !== chrome.runtime.id) return false;
  const request = frameToneRequest(message.id, message.text);
  lifetime.request(request).then(async (result) => {
    if (result.error && result.error !== TONE_OFF_STATUS.message) {
      await publish(statusForHostError(result.error)).catch(() => {});
    } else if (result.label) {
      const current = normalizeState(await chrome.storage.local.get(DEFAULT_STATE));
      if (current.toneEnabled && current.toneStatus.code !== 'connected') {
        await publish({ ...TONE_CONNECTED_STATUS }).catch(() => {});
      }
    }
    try {
      sendResponse(result);
    } catch {
      /* the tab closed before the label came back */
    }
  }).catch(() => {
    try {
      sendResponse({ id: request.id, error: 'Tone host disconnected.' });
    } catch {
      /* the tab closed */
    }
  });
  return true;
});

boot().catch(() => {});
