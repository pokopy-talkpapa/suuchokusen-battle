const STORAGE_KEY = 'suuchokusen_unlock_v1'

// 保存データは壊れている前提で読む：数値でなければ既定値、範囲外は 1〜3 / 0以上 に丸める。
// （壊れた値をそのまま使うと「ランクチップが全部🔒」のような復元困難な見た目バグになる）
function clampInt(v, min, max, fallback) {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

export class UnlockState {
  constructor(CONFIG, { level = 1, streak = 0, maxLevel = 1 } = {}) {
    this.CONFIG   = CONFIG
    this.level    = clampInt(level, 1, 3, 1)
    this.streak   = clampInt(streak, 0, Number.MAX_SAFE_INTEGER, 0)
    this.maxLevel = clampInt(maxLevel, 1, 3, 1)
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
