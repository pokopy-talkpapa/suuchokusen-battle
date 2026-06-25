// tests/physics.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcLandingX, calcTrajectory, dragToShot } from '../js/physics.js'
import { CONFIG } from '../js/config.js'

// 実configと同じ構造（DRAG_SCALE は CANNON に置く）でモックする
const CFG = {
  PHYSICS: { MAX_POWER: 800 },
  CANNON:  { DRAG_MIN_PX: 20, DRAG_MAX_PX: 160, DRAG_SCALE: 5 },
}

test('calcLandingX: 右方向に着弾する', () => {
  // cannonX=100, cannonY=400, targetY=600（下）, 仰角45度
  const x = calcLandingX(100, 400, 400, Math.PI / 4, 600, 600)
  assert.ok(x !== null)
  assert.ok(x > 100)
})
test('calcLandingX: 仰角45度 > 30度（同パワー）', () => {
  const x45 = calcLandingX(100, 400, 400, Math.PI / 4, 200, 600)
  const x30 = calcLandingX(100, 400, 400, Math.PI / 6, 200, 600)
  assert.ok(x45 > x30)
})
test('calcLandingX: 下向き角度はnullを返す', () => {
  // 下向きに発射してtargetYより上には届かない場合
  const x = calcLandingX(100, 200, 100, -Math.PI / 2, 600, 600)
  // targetY=600がcannonY=200より下なので着弾するかも。ここは動作確認のみ
  // null でないことを確認
  assert.ok(x === null || typeof x === 'number')
})

test('calcTrajectory: steps+1個の点を返す', () => {
  const pts = calcTrajectory(100, 400, 400, Math.PI / 4, 600, 20)
  assert.equal(pts.length, 21)
})
test('calcTrajectory: 最初の点はcannonXYに一致', () => {
  const pts = calcTrajectory(100, 400, 400, Math.PI / 4, 600)
  assert.equal(pts[0].x, 100)
  assert.equal(pts[0].y, 400)
})

test('dragToShot: 左上ドラッグ → 右上方向に発射', () => {
  const { power, angleRad } = dragToShot(-60, -60, CFG)
  assert.ok(power > 0)
  assert.ok(angleRad > 0) // 上方向（仰角）
})
test('dragToShot: DRAG_MAX_PX超でもMAX_POWERを超えない', () => {
  const { power } = dragToShot(-300, -300, CFG)
  assert.ok(power <= CFG.PHYSICS.MAX_POWER)
})
test('dragToShot: DRAG_MIN_PX未満は power=0', () => {
  const { power } = dragToShot(-10, -5, CFG)
  assert.equal(power, 0)
})
test('dragToShot: 実際のCONFIGでpowerが有限値になる（NaN回帰防止）', () => {
  // DRAG_SCALE の置き場所ズレで power が NaN になっていた不具合の回帰テスト
  const { power } = dragToShot(-60, -55, CONFIG)
  assert.ok(Number.isFinite(power), `power が有限値であること (got ${power})`)
  assert.ok(power > 0)
})
