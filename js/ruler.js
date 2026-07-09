// js/ruler.js

export function valueToX(value, min, max, rulerStartX, rulerEndX) {
  const ratio = (value - min) / (max - min)
  return rulerStartX + ratio * (rulerEndX - rulerStartX)
}

export function xToValue(x, min, max, rulerStartX, rulerEndX) {
  const ratio = (x - rulerStartX) / (rulerEndX - rulerStartX)
  return Math.round(min + ratio * (max - min))
}

// 測量フェーズの双眼鏡が映す窓を target と段階から自動で決める。
// 子どもがタップでズーム場所を選ぶ旧方式は廃止（船の周りだけを自動枠取り）。
// measureMode: 'full'=0〜1000 / 'hundred'=targetを含む100窓 / 'ten'=targetを含む10窓
export function getMeasureWindow(targetValue, stage, CONFIG) {
  const GMIN = CONFIG.RULER.MIN
  const GMAX = CONFIG.RULER.MAX
  if (stage.measureMode === 'full') {
    return { min: GMIN, max: GMAX, tickStep: stage.measureTickStep }
  }
  const span = stage.measureMode === 'hundred' ? 100 : 10
  let min = Math.floor(targetValue / span) * span
  let max = min + span
  if (max > GMAX) { max = GMAX; min = max - span }
  if (min < GMIN) { min = GMIN; max = min + span }
  return { min, max, tickStep: stage.measureTickStep }
}

// ズーム補間の窓：タップした区間（to）が「その場で広がって画面いっぱいになる」ように見える窓を返す。
// 端点を素直に lerp すると窓全体が横滑りしながら縮み、「画面の横から数直線が拡大してくる」ように
// 見えてしまう（2026-07-08実機FB）。そこで to の両端が画面上で占める位置（窓の中の割合 g1/g2）を
// 線形に 0 と 1 へ動かし、その割合から窓の min/max を逆算する＝400〜500 なら 400 と 500 の目盛りが
// まっすぐ左右の端へ広がっていく。ズームアウトは同じ式が逆再生になる（g1/g2 が 0/1 から離れていく）。
// e は 0〜1 の進行度（イージング済みの値を渡す）。
export function zoomWindowAt(fromMin, fromMax, toMin, toMax, e) {
  const fromSpan = fromMax - fromMin
  const f1 = (toMin - fromMin) / fromSpan
  const f2 = (toMax - fromMin) / fromSpan
  const g1 = f1 * (1 - e)          // toMin の画面位置: f1 → 0（左端へ）
  const g2 = f2 + (1 - f2) * e     // toMax の画面位置: f2 → 1（右端へ）
  const span = (toMax - toMin) / (g2 - g1)
  const min = toMin - g1 * span
  return { min, max: min + span }
}

export function getTicks(min, max, tickStep) {
  const ticks = []
  for (let v = min; v <= max; v += tickStep) {
    ticks.push({ value: v, isMajor: v % (tickStep * 5) === 0 })
  }
  return ticks
}
