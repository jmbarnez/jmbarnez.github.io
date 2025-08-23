import { makeDraggable } from '../utils/draggable.js';
import { setGlobalVolume, getGlobalVolume } from '../utils/constants.js';
import { setTerrainSeed } from '../game/world.js';
import { loadTerrainSeed, generateRandomSeed } from '../utils/noise.js';
import { PERMANENT_TERRAIN_SEED } from '../utils/worldConstants.js';
import { auth } from '../utils/firebaseClient.js';
import { signOut } from "firebase/auth";
import { updatePlayerOnlineStatus } from '../services/firestoreService.js';
import { playerService } from '../services/playerService.js';

export function initSettingsPanel() {
  const settingsPanel = document.getElementById('settings-panel');
  const settingsButton = document.getElementById('settings-button');
  const settingsCloseButton = document.getElementById('settings-close');
  const settingsHeader = document.getElementById('settings-header');
  const volumeSlider = document.getElementById('volume-slider');
  const logoutButton = document.getElementById('btn-logout');

  if (!settingsPanel || !settingsButton || !settingsCloseButton || !settingsHeader || !volumeSlider || !logoutButton) {
    return;
  }

  makeDraggable(settingsPanel, settingsHeader);

  settingsButton.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    updateTerrainSeedDisplay();
    window.updateUIOpenState(); // Update global UI state
  });

  settingsCloseButton.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
    window.updateUIOpenState(); // Update global UI state
  });

  volumeSlider.value = getGlobalVolume();
  volumeSlider.addEventListener('input', (e) => {
    setGlobalVolume(parseFloat(e.target.value));
  });

  logoutButton.onclick = async () => {
    const u = auth.currentUser;
    if (u) {
      // Save current position before logout if game is loaded
      if (window.gameInstance && window.gameInstance.player) {
        playerService.stop(); // Stop saving on logout
        await playerService.saveState(); // Force a final save
      }
      // Mark player as offline
      updatePlayerOnlineStatus(u.uid, false);
    }
    signOut(auth).finally(() => {
      window.location.href = '/login.html';
    });
  };

  // Initialize terrain seed controls
  initTerrainSeedControls();

  // Add canvas scaling toggle control
  initCanvasScalingControl(settingsPanel);
}

function initTerrainSeedControls() {
  const settingsPanel = document.getElementById('settings-panel');
  if (!settingsPanel) return;

  // Create terrain seed section
  const seedSection = document.createElement('div');
  seedSection.className = 'p-4 border-t border-sky-400/20';
  seedSection.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <label class="text-sm font-semibold">Terrain Seed</label>
      <button id="terrain-seed-random" type="button" class="px-2 py-1 rounded bg-slate-800/50 hover:bg-slate-700 transition text-xs text-slate-300">Random</button>
    </div>
    <div class="flex gap-2 items-stretch">
      <input id="terrain-seed-input" type="number" placeholder="Enter seed" class="flex-1 px-3 py-2 rounded border border-slate-600 bg-slate-800/50 text-slate-200 text-sm focus:outline-none focus:border-sky-400 transition-colors" />
      <button id="terrain-seed-apply" type="button" class="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors">Apply</button>
    </div>
    <p id="terrain-seed-status" class="text-xs text-slate-400 mt-1"></p>
  `;

  settingsPanel.appendChild(seedSection);

  // Add event listeners
  const seedInput = document.getElementById('terrain-seed-input');
  const seedApplyButton = document.getElementById('terrain-seed-apply');
  const seedRandomButton = document.getElementById('terrain-seed-random');

  if (seedInput && seedApplyButton && seedRandomButton) {
    // Disable random button functionality for permanent seed
    seedRandomButton.addEventListener('click', () => {
      alert('Using permanent static seed - cannot generate random seed');
    });

    // Disable apply button functionality for permanent seed
    seedApplyButton.addEventListener('click', () => {
      alert('Using permanent static seed - cannot change seed');
    });

    // Disable keypress functionality for permanent seed
    seedInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        alert('Using permanent static seed - cannot change seed');
      }
    });
  }
}

function initCanvasScalingControl(settingsPanel) {
  const section = document.createElement('div');
  section.className = 'p-4 border-t border-sky-400/20';
  section.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <label class="text-sm font-semibold">Rendering Scale</label>
      <div class="flex items-center gap-2">
        <label class="text-xs">Integer DPR</label>
        <input id="toggle-integer-dpr" type="checkbox" />
      </div>
    </div>
    <p class="text-xs text-slate-400">When enabled, the canvas will use an integer devicePixelRatio (best for pixel-perfect scaling on Retina).</p>
  `;

  settingsPanel.appendChild(section);

  const checkbox = document.getElementById('toggle-integer-dpr');
  if (!checkbox) return;

  // Initialize from localStorage
  checkbox.checked = localStorage.getItem('useIntegerDPR') === 'true';

  checkbox.addEventListener('change', () => {
    localStorage.setItem('useIntegerDPR', checkbox.checked ? 'true' : 'false');
    // Apply immediately
    if (window.applyDPRSetting) window.applyDPRSetting();
    alert('Rendering scale updated. If you notice visual glitches, resize the window or refresh.');
  });
}

function updateTerrainSeedDisplay() {
  const seedStatus = document.getElementById('terrain-seed-status');
  const seedInput = document.getElementById('terrain-seed-input');

  if (!seedStatus || !seedInput) return;

  // Always use the permanent static seed
  seedStatus.textContent = `Static Seed: ${PERMANENT_TERRAIN_SEED} (0x${PERMANENT_TERRAIN_SEED.toString(16).toUpperCase()})`;
  seedInput.value = PERMANENT_TERRAIN_SEED;

  // Disable the input and buttons since we're using a permanent seed
  seedInput.disabled = true;
  const randomButton = document.getElementById('terrain-seed-random');
  const applyButton = document.getElementById('terrain-seed-apply');
  if (randomButton) randomButton.disabled = true;
  if (applyButton) applyButton.disabled = true;
}