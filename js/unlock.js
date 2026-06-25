const STORAGE_KEY = 'suuchokusen_unlock_v1'

export class UnlockState {
  constructor(CONFIG, { level = 1, streak = 0, maxLevel = 1 } = {}) {
    this.CONFIG   = CONFIG
    this.level    = level
    this.streak   = streak
    this.maxLevel = maxLevel
  }

  isUnlocked(n) {
    return this.maxLevel >= n
  }

  recordHit(isHit) {
    if (isHit) {
      this.streak++
      const { BINOCULARS_STREAK, TELESCOPE_STREAK } = this.CONFIG.UNLOCK
      if (this.streak >= TELESCOPE_STREAK && this.maxLevel < 3) {
        this.maxLevel = 3
      } else if (this.streak >= BINOCULARS_STREAK && this.maxLevel < 2) {
        this.maxLevel = 2
      }
    } else {
      this.streak = 0
    }
  }

  save() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      level:    this.level,
      streak:   this.streak,
      maxLevel: this.maxLevel,
    }))
  }

  static load(CONFIG) {
    if (typeof localStorage === 'undefined') return new UnlockState(CONFIG)
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      return new UnlockState(CONFIG, data)
    } catch {
      return new UnlockState(CONFIG)
    }
  }
}
