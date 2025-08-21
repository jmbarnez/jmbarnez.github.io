import { experienceManager } from '../game/experienceManager.js';
import { createPixelIconForItem } from '../data/pixelIcons.js';
import { getExpForLevel } from '../utils/math.js';

/**
 * AI: Experience Bar UI Component
 * Shows level, experience progress, and auto-hides like chat bubbles
 */
class ExperienceBar {
  constructor() {
    this.element = null;
    this.levelElement = null;
    this.progressBar = null;
    this.progressFill = null;
    this.expText = null;
    this.isVisible = false;
    this.fadeTimeout = null;
    
    // AI: Track the currently displayed skill instead of global experience
    this.currentSkill = null; // Current skill being displayed (mining, fishing, gathering, xenohunting)
    this.currentSkillData = { level: 1, experience: 0 }; // Current skill's level and experience data
    
    // AI: Skill-specific icon identifiers matching the skill panel
    this.skillIcons = {
      mining: 'mining',      // Pickaxe icon for mining
      fishing: 'fishing',    // Fishing rod icon for fishing
      gathering: 'gathering', // Plant/leaf icon for gathering
      xenohunting: 'alien'   // Alien icon for xenohunting (combat)
    };
  }

  /**
   * AI: Initialize experience bar UI
   */
  init() {
    this.createElement();
    this.subscribeToEvents();
  }

  /**
   * AI: Create experience bar DOM element
   */
  createElement() {
    // AI: Main container
    this.element = document.createElement('div');
    this.element.id = 'experience-bar';
    this.element.className = 'experience-bar hidden';
    
    // AI: Skill icon container (dynamic based on current skill)
    this.skillIcon = document.createElement('div');
    this.skillIcon.className = 'skill-icon';
    // AI: Initialize with mining icon using pixel icon system
    this.updateSkillIcon('mining');
    
    // AI: Progress bar container
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'exp-progress-bar';
    
    // AI: Progress fill
    this.progressFill = document.createElement('div');
    this.progressFill.className = 'exp-progress-fill';
    this.progressBar.appendChild(this.progressFill);
    
    // AI: Level number display
    this.levelNumber = document.createElement('div');
    this.levelNumber.className = 'level-number';
    this.levelNumber.textContent = '1';
    
    // AI: Assemble elements - icon, progress bar, level number
    this.element.appendChild(this.skillIcon);
    this.element.appendChild(this.progressBar);
    this.element.appendChild(this.levelNumber);
    
    // AI: Add hover tooltip for debugging with skill-specific data
    this.element.addEventListener('mouseenter', () => {
      if (!this.currentSkill) return;
      
      const currentLevelExp = getExpForLevel(this.currentSkillData.level);
      const nextLevelExp = getExpForLevel(this.currentSkillData.level + 1);
      const expInLevel = this.currentSkillData.experience - currentLevelExp;
      const expNeededForLevel = nextLevelExp - currentLevelExp;
      
      this.element.title = `${this.currentSkill.charAt(0).toUpperCase() + this.currentSkill.slice(1)} Level ${this.currentSkillData.level}\n${expInLevel}/${expNeededForLevel} XP (${this.currentSkillData.experience} total)`;
    });
    
    // AI: Add CSS styles
    this.addStyles();
    
    // AI: Add to document
    document.body.appendChild(this.element);
  }

  /**
   * AI: Add CSS styles for experience bar
   */
  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .experience-bar {
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(0, 0, 0, 0.85);
        padding: 6px 12px;
        border-radius: 20px;
        border: 1px solid rgba(96, 165, 250, 0.3);
        z-index: 50;
        font-family: 'Arial', sans-serif;
        font-size: 12px;
        color: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: opacity 0.3s ease, transform 0.3s ease;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      
      .experience-bar.hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(-10px);
        pointer-events: none;
      }
      
      .skill-icon {
        font-size: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
      }
      
      .level-number {
        font-size: 12px;
        font-weight: bold;
        color: #e5e7eb;
        min-width: 20px;
        text-align: center;
        margin-left: 4px;
        transition: transform 0.1s ease;
      }
      
      .level-number.level-up-wiggle {
        animation: levelNumberWiggle 0.6s ease;
      }
      
      .exp-progress-bar {
        width: 150px;
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }
      
      .exp-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #10b981, #34d399);
        border-radius: 4px;
        width: 0%;
        transition: width 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
        position: relative;
        overflow: hidden;
      }
      
      .exp-progress-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
        animation: shimmer 1.5s ease-in-out infinite;
      }
      
      @keyframes shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      
      
      /* Level up animation */
      .experience-bar.level-up .skill-icon {
        animation: levelUpPulse 0.6s ease;
      }
      
      @keyframes levelUpPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.3); filter: brightness(1.5); }
      }
      
      /* Experience gain animation */
      .experience-bar.exp-gain .exp-progress-fill {
        animation: expGainGlow 0.4s ease;
      }
      
      @keyframes expGainGlow {
        0%, 100% { box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); }
        50% { box-shadow: 0 0 16px rgba(16, 185, 129, 0.8); }
      }
      
      @keyframes levelNumberWiggle {
        0% { transform: rotate(0deg) scale(1); }
        15% { transform: rotate(-5deg) scale(1.1); }
        30% { transform: rotate(5deg) scale(1.1); }
        45% { transform: rotate(-3deg) scale(1.05); }
        60% { transform: rotate(3deg) scale(1.05); }
        75% { transform: rotate(-1deg) scale(1.02); }
        100% { transform: rotate(0deg) scale(1); }
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * AI: Subscribe to experience manager events
   */
  /**
   * AI: Subscribe to experience manager events with skill-specific handling
   */
  subscribeToEvents() {
    experienceManager.subscribe((event) => {
      switch (event.type) {
        case 'skillUpdate': // AI: Handle skill-specific updates
          if (event.skill) {
            this.setCurrentSkill(event.skill, event.level, event.experience);
            this.show();
            this.updateDisplay();
            this.playExpGainAnimation();
          }
          break;
        case 'levelUp':
          // AI: For global level ups, only show if it matches current skill context
          if (event.resourceType && this.shouldShowForResource(event.resourceType)) {
            const skill = experienceManager.resourceToSkill[event.resourceType] || 'gathering';
            const skillData = experienceManager.skills[skill];
            if (skillData) {
              this.setCurrentSkill(skill, skillData.level, skillData.experience);
              this.show();
              this.updateDisplay();
              this.playLevelUpAnimation();
            }
          }
          break;
        case 'expGain':
          // AI: For experience gains, show relevant skill if resource type is available
          if (event.resourceType && this.shouldShowForResource(event.resourceType)) {
            const skill = experienceManager.resourceToSkill[event.resourceType] || 'gathering';
            const skillData = experienceManager.skills[skill];
            if (skillData) {
              this.setCurrentSkill(skill, skillData.level, skillData.experience);
              this.show();
              this.updateDisplay();
              this.playExpGainAnimation();
            }
          }
          break;
        case 'show':
          this.show();
          this.updateDisplay();
          break;
        case 'hide':
          this.hide();
          break;
        case 'loaded':
        case 'dataLoaded': // AI: Update when data loads from server
          this.updateDisplay();
          break;
      }
    });
  }

  /**
   * AI: Update display with skill-specific experience data instead of global data
   */
  updateDisplay() {
    // AI: Only update if we have current skill data to display
    if (!this.currentSkill || !this.currentSkillData) {
      return;
    }
    
    // AI: Calculate progress within current skill level using skill-specific data
    const currentLevelExp = getExpForLevel(this.currentSkillData.level);
    const nextLevelExp = getExpForLevel(this.currentSkillData.level + 1);
    const expInLevel = this.currentSkillData.experience - currentLevelExp;
    const expNeededForLevel = nextLevelExp - currentLevelExp;
    const progressPercent = Math.max(0, Math.min(100, (expInLevel / expNeededForLevel) * 100));
    
    // AI: Update progress bar with smooth animation
    this.progressFill.style.width = `${progressPercent}%`;
    
    // AI: Update level number display with skill level
    if (this.levelNumber) {
      this.levelNumber.textContent = this.currentSkillData.level.toString();
    }
    
    // AI: Update skill icon based on current skill using pixel icon system
    if (this.currentSkill) {
      this.updateSkillIcon(this.currentSkill);
    }
  }

  /**
   * AI: Show experience bar
   */
  show() {
    if (!this.element) return;
    
    this.isVisible = true;
    this.element.classList.remove('hidden');
    
    // AI: Always update display when showing to ensure sync
    this.updateDisplay();
    
    // AI: Clear any pending hide timeout
    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = null;
    }
  }

  /**
   * AI: Hide experience bar
   */
  hide() {
    if (!this.element) return;
    
    this.isVisible = false;
    this.element.classList.add('hidden');
  }

  /**
   * AI: Play experience gain animation
   */
  playExpGainAnimation() {
    if (!this.element) return;
    
    this.element.classList.remove('exp-gain');
    // AI: Force reflow to restart animation
    this.element.offsetHeight;
    this.element.classList.add('exp-gain');
    
    setTimeout(() => {
      this.element.classList.remove('exp-gain');
    }, 400);
  }

  /**
   * AI: Play level up animation - just wiggle the level number
   */
  playLevelUpAnimation() {
    if (!this.element || !this.levelNumber) return;
    
    // AI: Make the level number wiggle
    this.levelNumber.classList.remove('level-up-wiggle');
    // AI: Force reflow to restart animation
    this.levelNumber.offsetHeight;
    this.levelNumber.classList.add('level-up-wiggle');
    
    setTimeout(() => {
      this.levelNumber.classList.remove('level-up-wiggle');
    }, 600);
    
    // AI: Keep the skill icon pulse animation
    this.element.classList.remove('level-up');
    this.element.offsetHeight;
    this.element.classList.add('level-up');
    
    setTimeout(() => {
      this.element.classList.remove('level-up');
    }, 600);
  }

  /**
   * AI: Check if experience bar is currently visible
   */
  isShowing() {
    return this.isVisible;
  }

  /**
   * AI: Destroy experience bar
   */
  destroy() {
    if (this.fadeTimeout) {
      clearTimeout(this.fadeTimeout);
      this.fadeTimeout = null;
    }
    
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
/**
   * AI: Set the current skill being displayed and update the experience bar data
   * @param {string} skillName - Name of the skill (mining, fishing, gathering, xenohunting)
   * @param {number} level - Current level of the skill
   * @param {number} experience - Total experience in the skill
   */
  setCurrentSkill(skillName, level, experience) {
    this.currentSkill = skillName;
    this.currentSkillData = {
      level: level || 1,
      experience: experience || 0
    };
  }

  /**
   * AI: Determine if the experience bar should show for a given resource type
   * Only show for skills that actually gain experience (not fishing/gathering which are disabled)
   * @param {string} resourceType - Type of resource that was collected
   * @returns {boolean} - Whether to show the experience bar for this resource
   */
  shouldShowForResource(resourceType) {
    if (!resourceType) return false;
    
    const skill = experienceManager.resourceToSkill[resourceType] || 'gathering';
    
    // AI: Only show for skills that actually give experience
    // Based on experienceManager.addResourceExp(), fishing and gathering are disabled
    if (skill === 'fishing' || skill === 'gathering') {
      return false;
    }
    
    return true; // Show for mining, xenohunting, and other active skills
  }

  /**
   * AI: Get the currently displayed skill name
   * @returns {string|null} - Current skill name or null if none set
   */
  getCurrentSkill() {
    return this.currentSkill;
  }

  /**
   * AI: Get the currently displayed skill data
   * @returns {object} - Current skill data with level and experience
   */
  getCurrentSkillData() {
    return this.currentSkillData;
  }

  /**
   * AI: Update the skill icon using the pixel icon system to match skill panel
   * @param {string} skillName - Name of the skill to display icon for
   */
  updateSkillIcon(skillName) {
    if (!this.skillIcon || !this.skillIcons[skillName]) return;
    
    // AI: Clear existing icon
    this.skillIcon.innerHTML = '';
    
    // AI: Create pixel icon using the same system as the skill panel
    const iconId = this.skillIcons[skillName];
    try {
      const canvas = createPixelIconForItem({ id: iconId }, { cssSize: 16, scale: 1 });
      this.skillIcon.appendChild(canvas);
    } catch (error) {
      console.warn('Failed to create pixel icon for skill:', skillName, error);
      // AI: Fallback to text icon if pixel icon fails
      const fallbackIcons = {
        mining: '⛏️',
        fishing: '🎣',
        gathering: '🌿',
        xenohunting: '🔫'
      };
      this.skillIcon.innerHTML = fallbackIcons[skillName] || '?';
    }
  }

  /**
   * AI: Force show for testing
   */
  forceShow() {
    this.show();
    this.updateDisplay();
  }
}

// AI: Export singleton instance
export const experienceBar = new ExperienceBar();