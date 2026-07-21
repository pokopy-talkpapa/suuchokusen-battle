// js/stage.js
// 段階（序盤/中盤/上級）は既存の連続命中アンロック maxLevel(1/2/3) にそのまま対応させる。
// 新しい永続化は持たない（spec §5 の「連続命中ベースの段階＝既存UNLOCK流用」）。
export function stageIndexFromMaxLevel(maxLevel, CONFIG) {
  const last = CONFIG.STAGES.length - 1
  return Math.max(0, Math.min(last, maxLevel - 1))
}

export function currentStage(maxLevel, CONFIG) {
  return CONFIG.STAGES[stageIndexFromMaxLevel(maxLevel, CONFIG)]
}

// 次のランクに上がるのに必要な連続命中数。最高ランクなら null。
export function nextRankNeed(maxLevel, CONFIG) {
  if (maxLevel <= 1) return CONFIG.UNLOCK.BINOCULARS_STREAK
  if (maxLevel === 2) return CONFIG.UNLOCK.TELESCOPE_STREAK
  if (maxLevel === 3) return CONFIG.UNLOCK.MABOROSHI_STREAK
  return null
}

// 画面表示用のランク情報（現ランク名・連続命中・次ランクまでの残り）。
export function rankInfo(maxLevel, streak, CONFIG) {
  const name   = currentStage(maxLevel, CONFIG).name
  const needed = nextRankNeed(maxLevel, CONFIG)
  const next   = needed != null ? CONFIG.STAGES[stageIndexFromMaxLevel(maxLevel + 1, CONFIG)].name : null
  return {
    name,
    streak,
    needed,                                            // null=最高ランク
    remaining: needed != null ? Math.max(0, needed - streak) : null,
    nextName: next,
  }
}
