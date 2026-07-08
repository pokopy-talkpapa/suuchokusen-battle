// js/score.js
// スコア＝「当たったか」でなく「どれだけ真ん中か」。
// ど真ん中=MAX点、命中圏の端=MIN_AT_EDGE点（線形）、外れ=0点。
export function calcShotScore(landingValue, targetValue, hitMargin, SCORE) {
  const err = Math.abs(landingValue - targetValue)
  if (err > hitMargin) return 0
  return Math.round(SCORE.MAX - (SCORE.MAX - SCORE.MIN_AT_EDGE) * (err / hitMargin))
}

const STORAGE_KEY = 'suuchokusen_score_v1'

// SET_SIZE 発で1セット。セット合計点の自己ベストだけを永続化する。
export class ScoreState {
  constructor(SCORE, { best = 0 } = {}) {
    this.SCORE = SCORE
    // 保存データは壊れている前提で読む（数値以外・負の値は 0 に戻す）
    const n = Math.trunc(Number(best))
    this.best = (Number.isFinite(n) && n > 0) ? n : 0
    this._setScores = []
  }

  // 1発の点数を記録。セットが満了したら自己ベストを判定して返す。
  addShot(score) {
    this._setScores.push(score)
    const finished = this._setScores.length >= this.SCORE.SET_SIZE
    let isNewBest = false
    if (finished && this.setTotal() > this.best) {
      this.best = this.setTotal()
      isNewBest = true
    }
    return { finished, isNewBest }
  }

  shotCount() { return this._setScores.length }
  setTotal()  { return this._setScores.reduce((a, b) => a + b, 0) }
  isSetFinished() { return this._setScores.length >= this.SCORE.SET_SIZE }
  startNewSet() { this._setScores = [] }

  save() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best: this.best }))
  }

  static load(SCORE) {
    if (typeof localStorage === 'undefined') return new ScoreState(SCORE)
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      return new ScoreState(SCORE, data)
    } catch {
      return new ScoreState(SCORE)
    }
  }
}
