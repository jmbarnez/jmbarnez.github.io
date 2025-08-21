import { makeDraggable } from '../utils/draggable.js';
import { setGlobalVolume, getGlobalVolume } from '../utils/constants.js';

export function initSettingsPanel() {
  const settingsPanel = document.getElementById('settings-panel');
  const settingsButton = document.getElementById('settings-button');
  const settingsCloseButton = document.getElementById('settings-close');
  const settingsHeader = document.getElementById('settings-header');
  const volumeSlider = document.getElementById('volume-slider');

  if (!settingsPanel || !settingsButton || !settingsCloseButton || !settingsHeader || !volumeSlider) {
    return;
  }

  makeDraggable(settingsPanel, settingsHeader);

  settingsButton.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
  });

  settingsCloseButton.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  volumeSlider.value = getGlobalVolume();
  volumeSlider.addEventListener('input', (e) => {
    setGlobalVolume(parseFloat(e.target.value));
  });
}