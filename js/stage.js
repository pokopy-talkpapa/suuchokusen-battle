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
