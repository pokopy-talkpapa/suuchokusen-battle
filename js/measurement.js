export function generateTarget(min, max, tickStep) {
  const steps = Math.floor((max - min) / tickStep)
  return min + Math.floor(Math.random() * (steps + 1)) * tickStep
}

export function calcMeasurementError(measured, actual) {
  return Math.abs(measured - actual)
}

// 着水点の値と正解値の差が許容幅以内なら命中
export function judgeHit(landingValue, targetValue, marginValue) {
  return Math.abs(landingValue - targetValue) <= marginValue
}
