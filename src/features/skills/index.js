import { gameState } from '../../state/gameState.js';
import { Tooltip } from '../../ui/Tooltip.js';
import { SKILL_META } from '../../data/skills.js';

export const Skills = {
  init() {
    document.querySelectorAll('.skill-card').forEach((card) => {
      const key = card.getAttribute('data-skill');
      card.addEventListener('mouseenter', (e) => {
        const meta = SKILL_META[key];
        if (!meta) return;
        const skill = gameState.combat?.[key] || gameState[key];
        if (!skill) return;
        const text = `${meta.name}\nLevel ${skill.level}\n${skill.xp} / ${skill.xpToNext} XP\n\n${meta.description}`;
        Tooltip.show(e, text);
      });
      card.addEventListener('mouseleave', () => Tooltip.hide());
      card.addEventListener('mousemove', (e) => Tooltip.move(e));
      card.addEventListener('mousedown', () => Tooltip.hide());
      // Initialize fill and level on first load
      const pct = (() => {
        if (gameState.combat?.[key]) return Math.min(100, (gameState.combat[key].xp / gameState.combat[key].xpToNext) * 100);
        if (gameState[key]) return Math.min(100, (gameState[key].xp / gameState[key].xpToNext) * 100);
        return 0;
      })();
      card.style.setProperty('--progress-pct', `${pct}%`);
      const badge = document.querySelector(`[data-skill-level="${key}"]`);
      if (badge) {
        const level = gameState.combat?.[key]?.level ?? gameState[key]?.level ?? 1;
        badge.textContent = level;
      }
    });
  }
};


