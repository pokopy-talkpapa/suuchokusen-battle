// js/physics.js

// Canvas 座標系：下方向が正Y
// cannonY: 大砲の Canvas Y座標
// targetY: 着弾させたいCanvas Y座標（数直線のY）
// power: px/s  angleRad: 仰角（上方向が正）  gravity: px/s^2（正値）
// returns: 着弾Canvas X座標（数値が存在しない場合はnull）
export function calcLandingX(cannonX, cannonY, power, angleRad, gravity, targetY) {
  const vx =  power * Math.cos(angleRad)
  const vy = -power * Math.sin(angleRad) // Canvas上方向が負
  // targetY = cannonY + vy*t + 0.5*gravity*t^2
  // → 0.5*g*t^2 + vy*t + (cannonY - targetY) = 0
  const a = 0.5 * gravity
  const b = vy
  const c = cannonY - targetY
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const t1 = (-b + Math.sqrt(disc)) / (2 * a)
  const t2 = (-b - Math.sqrt(disc)) / (2 * a)
  const t = Math.max(t1, t2)
  if (t <= 0) return null
  return cannonX + vx * t
}

export function calcTrajectory(cannonX, cannonY, power, angleRad, gravity, steps = 20) {
  const vx =  power * Math.cos(angleRad)
  const vy = -power * Math.sin(angleRad)
  const dt = 1.2 / steps
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i * dt
    points.push({
      x: cannonX + vx * t,
      y: cannonY + vy * t + 0.5 * gravity * t * t,
    })
  }
  return points
}

// dragDx, dragDy: 大砲中心からドラッグ終点へのCanvas座標差分
// 発射方向はドラッグの逆方向
export function dragToShot(dragDx, dragDy, CONFIG) {
  const { MAX_POWER, DRAG_SCALE } = CONFIG.PHYSICS
  const { DRAG_MIN_PX, DRAG_MAX_PX } = CONFIG.CANNON
  const dragLen = Math.sqrt(dragDx * dragDx + dragDy * dragDy)
  if (dragLen < DRAG_MIN_PX) return { power: 0, angleRad: 0 }
  const clampedLen = Math.min(dragLen, DRAG_MAX_PX)
  const power = Math.min(clampedLen * DRAG_SCALE, MAX_POWER)
  // ドラッグの逆方向が発射方向
  const angleRad = Math.atan2(-dragDy, -dragDx)
  return { power, angleRad }
}
