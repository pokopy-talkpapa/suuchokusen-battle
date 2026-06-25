export function generateTarget(min, max, tickStep) {
  const steps = Math.floor((max - min) / tickStep)
  return min + Math.floor(Math.random() * (steps + 1)) * tickStep
}

export function calcMeasurementError(measured, actual) {
  return Math.abs(measured - actual)
}

// landingX: 理想の着弾 Canvas X座標
// measuredError: 測量誤差（value単位、0〜1000スケール）
// canvasWidth: Canvas 幅 px
// returns: ブレを加えた着弾 X座標
export function applyBlur(landingX, measuredError, canvasWidth, CONFIG) {
  if (measuredError === 0) return landingX
  const totalRange = CONFIG.RULER.MAX - CONFIG.RULER.MIN
  const errorRatio = measuredError / totalRange
  const maxBlurPx = errorRatio * CONFIG.CANNON.BLUR_FACTOR * canvasWidth
  const blur = (Math.random() * 2 - 1) * maxBlurPx
  return landingX + blur
}
