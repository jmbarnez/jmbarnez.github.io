import { setPlayerSkills, getPlayerSkills } from '../services/firestoreService.js';
import { getExpForLevel, getLevelFromExperience, getExpRequiredForLevel } from '../utils/math.js';

/**
 * AI: Experience Management System
 * Handles player experience, levels, and progression
 * Simple leveling system with visual feedback
 */
class ExperienceManager {
  constructor() {
    this.uid = null; // AI: UID will be set on initialization.
    // AI: Experience state
    this.level = 1;
    this.experience = 0;
    this.experienceToNextLevel = getExpForLevel(2);
    
    // AI: Visual feedback
    this.lastActionTime = 0;
    this.hideTimeout = null;
    
    // AI: Event listeners
    this._listeners = new Set();
    
    // AI: Server save timeout for debouncing
    this._saveTimeout = null;
    
    // AI: Experience gains by resource type (increased for RuneScape-style system)
    this.expGains = {
      // AI: Set stone and sandstone to 1 XP as requested (stone deposits and sandstone)
      stone: 1,
      sandstone: 1,
      seashell: 25,
      driftwood: 35,
      seaweed: 15,
      default: 25,
      bugKill: 50
    };

    // AI: Skills state - per-skill experience & level tracking
    // This supports Mining, Fishing and Gathering panels in the UI.
    this.skills = {
      mining: { level: 1, experience: 0 },
      fishing: { level: 1, experience: 0 },
      gathering: { level: 1, experience: 0 },
      xenohunting: { level: 1, experience: 0 }
    };

    // AI: Map resource types to skills (adjustable). Unknown types default to 'gathering'.
    this.resourceToSkill = {
      stone: 'mining',
      sandstone: 'mining',
      pickaxe: 'mining',
      fishing_pole: 'fishing',
      seashell: 'gathering',
      driftwood: 'gathering',
      seaweed: 'fishing'
    };
  }

  /**
   * AI: Initializes the experience manager with the player's UID.
   * @param {string} uid - The player's user ID.
   */
  initialize(uid) {
    this.uid = uid;
  }

 /**
   * AI: Calculate experience needed for next level from current exp
   */
  getExpToNextLevel() {
    const nextLevelExp = getExpForLevel(this.level + 1);
    return nextLevelExp - this.experience;
  }

  /**
   * AI: Get progress percentage to next level (0-1)
   */
  getProgressToNextLevel() {
   const currentLevelExp = getExpForLevel(this.level);
   const nextLevelExp = getExpForLevel(this.level + 1);
   if (nextLevelExp === currentLevelExp) return 0; // Avoid division by zero
   const progress = (this.experience - currentLevelExp) / (nextLevelExp - currentLevelExp);
   return Math.max(0, Math.min(1, progress));
  }

  /**
   * AI: Add experience and handle level ups
   */
  addExperience(amount, resourceType = null) {
    if (amount <= 0) return false;

    // AI: Calculate bonus exp for specific resource types
    let expGain = amount;
    if (resourceType && this.expGains[resourceType]) {
      expGain = this.expGains[resourceType];
    }

    const oldLevel = this.level;
    this.experience += expGain;

    // AI: Check for level ups using reverse lookup for consistency
    const newLevel = getLevelFromExperience(this.experience);
    let leveledUp = false;
    
    if (newLevel > this.level) {
      this.level = newLevel;
      leveledUp = true;
    }

    // AI: Update visual display timing
    this.lastActionTime = Date.now();
    this.resetHideTimeout();

    // AI: Notify listeners of changes
    this.notifyListeners({
      type: leveledUp ? 'levelUp' : 'expGain',
      oldLevel,
      newLevel: this.level,
      expGained: expGain,
      totalExp: this.experience,
      resourceType
    });

    // AI: Also emit a global aggregated skill event for UI compatibility
    this.notifyListeners({ type: 'globalExp', totalExp: this.experience });

    // AI: Debug logging for level ups
    if (leveledUp) {
      const expToNext = this.getExpToNextLevel();
      console.log(`🎉 Level up! ${oldLevel} → ${this.level} (${this.experience} total exp, ${expToNext} to next level)`);
    }

    return true;
  }

  /**
   * AI: Add experience from resource collection
   */
  addResourceExp(resourceType) {
    const expGain = this.expGains[resourceType] || this.expGains.default;
    // AI: Update both total exp and per-skill exp if mapping exists
    const skill = this.resourceToSkill[resourceType] || 'gathering';
    // AI: Prevent fishing and gathering experience
    if (skill === 'fishing' || skill === 'gathering') {
      return false;
    }
    // Add to global experience
    const ok = this.addExperience(expGain, resourceType);
    if (ok) {
      try {
        const s = this.skills[skill] || { level: 1, experience: 0 };
        s.experience = (s.experience || 0) + expGain;
        s.level = getLevelFromExperience(s.experience);
        this.skills[skill] = s;
        // Notify listeners of skill update
        this.notifyListeners({ type: 'skillUpdate', skill, level: s.level, experience: s.experience });
        
        // AI: Trigger save to server after experience gain
        this._scheduleSave();
      } catch (e) { console.warn('Failed to update skill:', e); }
    }
    return ok;
  }

 addXenohuntingExp(amount) {
   const expGain = amount || this.expGains.bugKill || 50;
   const skill = 'xenohunting';
   
   // Add to global experience
   const ok = this.addExperience(expGain, 'bugKill');
   if (ok) {
     try {
       const s = this.skills[skill] || { level: 1, experience: 0 };
       s.experience = (s.experience || 0) + expGain;
       s.level = getLevelFromExperience(s.experience);
       this.skills[skill] = s;
       // Notify listeners of skill update
       this.notifyListeners({ type: 'skillUpdate', skill, level: s.level, experience: s.experience });
       
       // AI: Trigger save to server after experience gain
       this._scheduleSave();
     } catch (e) { console.warn('Failed to update skill:', e); }
   }
   return ok;
 }

  /**
   * AI: Reset auto-hide timeout for experience bar
   */
  resetHideTimeout() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    // AI: Hide experience bar 3 seconds after last action
    this.hideTimeout = setTimeout(() => {
      this.notifyListeners({ type: 'hide' });
    }, 3000);
  }

  /**
   * AI: Force show experience bar
   */
  showExperienceBar() {
    this.lastActionTime = Date.now();
    this.resetHideTimeout();
    this.notifyListeners({ type: 'show' });
  }

  /**
   * AI: Get current experience stats
   */
  getStats() {
    return {
      level: this.level,
      experience: this.experience,
      expToNext: this.getExpToNextLevel(),
      progress: this.getProgressToNextLevel(),
      totalExpForNext: getExpForLevel(this.level + 1),
      lastAction: this.lastActionTime
    };
  }

  /**
   * AI: Load experience and skill data from server
   */
  async loadProgress(data) {
    if (!data || typeof data !== 'object') return;
    
    // AI: Load main experience and level
    this.experience = Math.max(0, parseInt(data.experience) || 0);
    this.level = getLevelFromExperience(this.experience);
    
    // AI: Ensure minimum level 1
    if (this.level < 1) {
      this.level = 1;
    }
    
    // AI: Load per-skill experience data if available
    if (data.skills && typeof data.skills === 'object') {
      for (const [skillName, skillData] of Object.entries(data.skills)) {
        if (this.skills[skillName] && skillData && typeof skillData.experience === 'number') {
          this.skills[skillName].experience = Math.max(0, skillData.experience);
          this.skills[skillName].level = getLevelFromExperience(skillData.experience);
        }
      }
    }
    
    this.notifyListeners({ type: 'loaded' });
  }

  /**
   * AI: Save current progress including per-skill experience
   */
  saveProgress() {
    // AI: Only return experience data. Levels are calculated on the client.
    return {
      experience: this.experience,
      skills: { ...this.skills },
      timestamp: Date.now(),
    };
  }


  /**
   * AI: Subscribe to experience events
   */
  subscribe(callback) {
    if (typeof callback === 'function') {
      this._listeners.add(callback);
    }
    return () => this._listeners.delete(callback);
  }

  /**
   * AI: Notify all listeners of experience events
   */
  notifyListeners(event) {
    this._listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in experience listener:', error);
      }
    });
  }

  /**
   * AI: Reset experience (for testing)
   */
  reset() {
    this.level = 1;
    this.experience = 0;
    this.lastActionTime = 0;
    
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    
    this.notifyListeners({ type: 'reset' });
  }

 /**
  * AI: Calculates the level based on the total experience points.
  * This is the inverse of the getExpForLevel function.
  * The formula is: Level = floor((Experience / base) ^ (1 / exponent)) + 1
  * @param {number} experience - The total experience points.
  * @returns {number} The calculated level.
  */
 getLevelFromExperience(experience) {
   const baseExperience = 100;
   const exponent = 1.5;
   if (experience <= 0) return 1;
   const level = Math.floor(Math.pow(experience / baseExperience, 1 / exponent)) + 1;
   return level;
 }

  /**
   * AI: Get experience required for specific level
   */
  getExpRequiredForLevel(level) {
    return getExpRequiredForLevel(level);
  }

  /**
   * AI: Check if experience bar should be visible
   */
  shouldShowBar() {
    const timeSinceAction = Date.now() - this.lastActionTime;
    return timeSinceAction < 3000; // Show for 3 seconds after action
  }

  /**
   * AI: Debug method to show experience table (first 20 levels)
   */
  debugExpTable() {
    console.log('Experience Table (2x Faster RuneScape):');
    for (let level = 1; level <= 20; level++) {
      const expForLevel = getExpForLevel(level);
      const expForNext = getExpForLevel(level + 1);
      const expNeeded = expForNext - expForLevel;
      console.log(`Level ${level}: ${expForLevel} total exp, ${expNeeded} needed for next level`);
    }
  }

  /**
   * AI: Schedule a save operation with debouncing to avoid excessive server calls
   */
  _scheduleSave() {
    // AI: Clear existing timeout to debounce rapid experience gains
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }
    
    // AI: Save experience data to server after 3 seconds of inactivity
    this._saveTimeout = setTimeout(async () => {
      try {
        if (this.uid) {
          const progressData = this.saveProgress();
          // AI: Pass the experience data directly to the service.
          await setPlayerSkills(this.uid, progressData);

        }
      } catch (error) {
        console.error('Failed to save experience to server:', error);
      }
    }, 3000);
  }
  
  /**
   * AI: Load experience data from server during initialization
   */
  async loadFromServer(uid) {
    try {
      const serverData = await getPlayerSkills(uid);
      if (serverData) {
        // AI: Load total experience if available
        if (typeof serverData.totalExperience === 'number') {
          this.experience = Math.max(0, serverData.totalExperience);
          this.level = getLevelFromExperience(this.experience);
        }
        
        // AI: Load per-skill data
        if (serverData.skills && typeof serverData.skills === 'object') {
          await this.loadProgress({ skills: serverData.skills, experience: this.experience });
        }
        
        console.log('Experience data loaded from server:', {
          totalExp: this.experience,
          totalLevel: this.level,
          skills: Object.keys(this.skills).reduce((acc, key) => {
            acc[key] = { level: this.skills[key].level, exp: this.skills[key].experience };
            return acc;
          }, {})
        });
      }
    } catch (error) {
      console.error('Failed to load experience from server:', error);
    }
  }
  
  /**
   * AI: Force immediate save to server (used on page unload)
   */
  async saveNow(uid) {
    try {
      // AI: Clear any pending save timeout
      if (this._saveTimeout) {
        clearTimeout(this._saveTimeout);
        this._saveTimeout = null;
      }
      
      if (uid) {
        const progressData = this.saveProgress();
        // AI: Pass the experience data directly to the service.
        await setPlayerSkills(uid, progressData);
        console.log('Experience data force-saved to server');
      }
    } catch (error) {
      console.error('Failed to force-save experience to server:', error);
    }
  }
}

// AI: Export singleton instance
export const experienceManager = new ExperienceManager();