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

export function getTicks(min, max, tickStep) {
  const ticks = []
  for (let v = min; v <= max; v += tickStep) {
    ticks.push({ value: v, isMajor: v % (tickStep * 5) === 0 })
  }
  return ticks
}
