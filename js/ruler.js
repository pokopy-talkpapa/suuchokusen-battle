// js/ruler.js

export function valueToX(value, min, max, rulerStartX, rulerEndX) {
  const ratio = (value - min) / (max - min)
  return rulerStartX + ratio * (rulerEndX - rulerStartX)
}

export function xToValue(x, min, max, rulerStartX, rulerEndX) {
  const ratio = (x - rulerStartX) / (rulerEndX - rulerStartX)
  return Math.round(min + ratio * (max - min))
}

// zoomLevel: 1 | 2 | 3
// centerValue: ズーム中心となる値（タップした位置の値）
// returns { min, max, tickStep }
export function getZoomRange(zoomLevel, centerValue, CONFIG) {
  const { ZOOM } = CONFIG
  if (zoomLevel === 1) {
    return { min: 0, max: ZOOM.LEVEL1.rangeWidth, tickStep: ZOOM.LEVEL1.tickStep }
  }
  const level = zoomLevel === 2 ? ZOOM.LEVEL2 : ZOOM.LEVEL3
  const half = level.rangeWidth / 2
  // centerValue を tickStep の倍数にスナップ
  const snapped = Math.round(centerValue / level.tickStep) * level.tickStep
  let min = snapped - half
  let max = snapped + half
  // 0〜1000 の範囲にクランプ
  const globalMax = ZOOM.LEVEL1.rangeWidth
  if (min < 0) { max = Math.min(globalMax, max - min); min = 0 }
  if (max > globalMax) { min = Math.max(0, min - (max - globalMax)); max = globalMax }
  return { min, max, tickStep: level.tickStep }
}

export function getTicks(min, max, tickStep) {
  const ticks = []
  for (let v = min; v <= max; v += tickStep) {
    ticks.push({ value: v, isMajor: v % (tickStep * 5) === 0 })
  }
  return ticks
}
