// Module: skills UI synchronization
// Purpose: Keep the skills panel DOM in sync with the runtime per-skill data
// in `experienceManager` in a modular, testable way.
//
// Notes on changes and rationale:
// - Previous approach: skill values were updated ad-hoc from various code paths
//   (legacy `renderPlayerBars` style or scattered DOM writes). That was fragile
//   and made it hard to ensure UI always reflected authoritative state.
// - New approach: single source-of-truth is `experienceManager.skills`.
//   This module subscribes to the manager and updates the skills panel DOM
//   whenever skill data changes or when the manager finishes loading from
//   server. This keeps logic modular and avoids sprinkling DOM updates.
// - We avoid hardcoding skill names in multiple places: this module reads
//   keys from `experienceManager.skills` so adding/removing skills only needs
//   updates to the data layer (or server payload), not the UI syncing logic.
// - Comments below intentionally reference the old behaviour where useful
//   to help future reviewers who may remember prior code.

import { experienceManager } from '../game/experienceManager.js';
import { getExpForLevel } from '../utils/math.js';

// Helper: safe DOM query with a descriptive error when missing
function q(id) {
  const el = document.getElementById(id);
  if (!el) {
    // Not throwing here — calling code should tolerate missing elements in tests
    console.warn(`[skills] Missing DOM element: ${id}`);
  }
  return el;
}

// Build references mapping for a skill name -> DOM nodes
function buildSkillRefs(skillName) {
  return {
    levelEl: q(`skill-level-${skillName}`),
    xpEl: q(`skill-xp-${skillName}`),
    barEl: q(`skill-bar-${skillName}`)
  };
}

// Update a single skill UI given the authoritative skill data.
// skillData: { level: number, experience: number }
function updateSkillUI(skillName, skillData) {
  if (!skillData) return;
  const refs = buildSkillRefs(skillName);
  const level = Math.max(1, skillData.level || 1);
  const totalExp = Math.max(0, Number(skillData.experience) || 0);

  // Compute progress within the current level using shared math helper
  const expForCurrentLevel = getExpForLevel(level);
  const expForNextLevel = getExpForLevel(level + 1);
  const progressInLevel = Math.max(0, totalExp - expForCurrentLevel);
  const requiredForNext = Math.max(1, expForNextLevel - expForCurrentLevel);

  // Update level text
  if (refs.levelEl) refs.levelEl.textContent = String(level);

  // Update XP text to show progress within level like "12/100"
  if (refs.xpEl) refs.xpEl.textContent = `${progressInLevel}/${requiredForNext}`;

  // Update progress bar width (clamped 0-100)
  const pct = Math.max(0, Math.min(100, Math.round((progressInLevel / requiredForNext) * 100)));
  if (refs.barEl) {
    refs.barEl.style.width = pct + '%';
    // Ensure accessibility attributes (in case someone uses assistive tech)
    refs.barEl.setAttribute('aria-valuenow', String(pct));
    refs.barEl.setAttribute('aria-valuemin', '0');
    refs.barEl.setAttribute('aria-valuemax', '100');
    refs.barEl.title = `${pct}%`;
  }
}

// Initialize skills panel syncing
export function initSkillsPanel() {
  // If experienceManager is not present, nothing to do.
  if (!experienceManager) return;

  // 1) Immediately populate UI from current manager state (useful for hot-reload)
  try {
    const skills = experienceManager.skills || {};
    Object.keys(skills).forEach(skillName => {
      updateSkillUI(skillName, skills[skillName]);
    });
  } catch (e) {
    console.warn('[skills] Failed initial populate', e);
  }

  // 2) Subscribe to manager events to react to updates
  // Events of interest produced by experienceManager:
  // - { type: 'skillUpdate', skill, level, experience }
  // - { type: 'loaded' } (initial load from server)
  // - { type: 'levelUp' / 'expGain' } (global exp changes)
  experienceManager.subscribe((evt) => {
    try {
      if (!evt || !evt.type) return;

      if (evt.type === 'skillUpdate' && evt.skill) {
        // evt.skill is the skill name; prefer authoritative value from manager
        const s = experienceManager.skills && experienceManager.skills[evt.skill];
        if (s) updateSkillUI(evt.skill, s);
      } else if (evt.type === 'loaded') {
        // bulk refresh after server load
        const skills = experienceManager.skills || {};
        Object.keys(skills).forEach(skillName => updateSkillUI(skillName, skills[skillName]));
      } else if (evt.type === 'levelUp' || evt.type === 'expGain' || evt.type === 'globalExp') {
        // global changes may still affect per-skill UI if code updates both;
        // refresh all known skills to be safe and consistent.
        const skills = experienceManager.skills || {};
        Object.keys(skills).forEach(skillName => updateSkillUI(skillName, skills[skillName]));
      }
    } catch (e) {
      console.error('[skills] Error handling experience event', e);
    }
  });
}

// Export helper for tests or future modules
export function updateAllSkillsFromManager() {
  const skills = experienceManager.skills || {};
  Object.keys(skills).forEach(skillName => updateSkillUI(skillName, skills[skillName]));
}

// End of module


