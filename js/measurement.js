// 端（min/max）は正解にしない：0や1000が答えなのは不自然で、
// 船が数直線の端＝島や双眼鏡の枠に重なってしまうため。
export function generateTarget(min, max, tickStep) {
  const steps = Math.floor((max - min) / tickStep)
  return min + (1 + Math.floor(Math.random() * (steps - 1))) * tickStep
}

// 答え合わせ（全体0〜1000スケール）で船が島に重ならない下限。
// 数直線は大砲先端(15.5%)起点なので、これ未満の値は船が島の崖に食い込む。
export const MIN_TARGET_CLEARANCE = 50

// 測量窓の端にも正解を乗せない：窓の左端＝島の上・右端＝枠ぎわに船が来るため。
// span=窓の幅（'hundred'=100 / 'ten'=10）。full表示は span=null で端除外のみ。
export function generateTargetInsideWindow(min, max, tickStep, span = null) {
  for (let i = 0; i < 100; i++) {
    const t = generateTarget(min, max, tickStep)
    if (t - min < MIN_TARGET_CLEARANCE) continue // 島ぎわの値は出さない
    if (!span || t % span !== 0) return t
  }
  // フォールバック：島ぎわを避けた最小の目盛り。窓端（span境界）に乗るなら1目盛りずらす
  let t = min + Math.ceil(MIN_TARGET_CLEARANCE / tickStep) * tickStep
  if (span && t % span === 0) t += tickStep
  return t
}

// 測量ミスの救済ヒント段階：2回外し=1（両端の数字を強調）／4回外し=2（端のひとつ前の目盛りに数字）。
// 正解の目盛りは最後まで光らせない＝つまずきの正体は「1目盛りはいくつか」の読み違いなので、
// 向ける先は答えでなく読み方の入り口（まず端を見る→端のひとつ前から1目盛り分を自力で逆算する）。
export function measureAidLevel(missCount) {
  if (missCount >= 4) return 2
  if (missCount >= 2) return 1
  return 0
}

export function calcMeasurementError(measured, actual) {
  return Math.abs(measured - actual)
}

// 着水点の値と正解値の差が許容幅以内なら命中
export function judgeHit(landingValue, targetValue, marginValue) {
  return Math.abs(landingValue - targetValue) <= marginValue
}
