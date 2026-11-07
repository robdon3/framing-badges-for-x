import { DEFAULT_STATE } from '../storage/state.js';
import { TONE_ARMED_STATUS, TONE_OFF_STATUS } from './protocol.js';

export function bindToneToggle({ checkbox, status, chromeApi = globalThis.chrome } = {}) {
  if (!checkbox || !status) return;

  function render(data) {
    checkbox.checked = data?.toneEnabled === true;
    status.textContent = data?.toneStatus?.message
      || (checkbox.checked ? 'Tone check is on.' : TONE_OFF_STATUS.message);
  }

  checkbox.addEventListener('change', () => {
    const toneEnabled = checkbox.checked === true;
    chromeApi.storage.local.set({
      toneEnabled,
      toneStatus: toneEnabled ? { ...TONE_ARMED_STATUS } : { ...TONE_OFF_STATUS },
    }).catch(() => {
      status.textContent = 'Could not save the tone setting.';
    });
  });

  chromeApi.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || (!changes.toneEnabled && !changes.toneStatus)) return;
    chromeApi.storage.local.get(DEFAULT_STATE).then(render).catch(() => {});
  });

  chromeApi.storage.local.get(DEFAULT_STATE).then(render).catch(() => {
    status.textContent = 'Could not read the tone setting.';
  });
}
