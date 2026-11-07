import { bindHiddenCount, bindHiddenTones } from '../tone/filter-ui.js';
import { bindToneToggle } from '../tone/toggle.js';

bindToneToggle({
  checkbox: document.querySelector('#tone'),
  status: document.querySelector('#tone-status'),
});
bindHiddenTones({ container: document.querySelector('#hidden-tones') });
bindHiddenCount({ output: document.querySelector('#hidden-count') });

document.querySelector('#options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
