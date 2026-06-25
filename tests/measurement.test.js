import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateTarget, calcMeasurementError, applyBlur } from '../js/measurement.js'

test('generateTarget: tickStep=100 で100の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(0, 1000, 100)
    assert.ok(v >= 0 && v <= 1000)
    assert.equal(v % 100, 0)
  }
})
test('generateTarget: tickStep=10 で10の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(300, 400, 10)
    assert.ok(v >= 300 && v <= 400)
    assert.equal(v % 10, 0)
  }
})
test('generateTarget: tickStep=5 で5の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(340, 360, 5)
    assert.ok(v >= 340 && v <= 360)
    assert.equal(v % 5, 0)
  }
})

test('calcMeasurementError: 正確なら0', () => {
  assert.equal(calcMeasurementError(300, 300), 0)
})
test('calcMeasurementError: 誤差は絶対値', () => {
  assert.equal(calcMeasurementError(285, 300), 15)
  assert.equal(calcMeasurementError(320, 300), 20)
})

const CFG = { CANNON: { BLUR_FACTOR: 0.25 }, RULER: { MIN: 0, MAX: 1000 } }

test('applyBlur: 誤差0ならブレなし', () => {
  const x = applyBlur(500, 0, 1300, CFG)
  assert.equal(x, 500)
})
test('applyBlur: 誤差あり → ブレが±maxBlur 以内', () => {
  // 誤差100 / 1000 * 0.25 * 1300 = 32.5px が最大ブレ
  const maxBlur = (100 / 1000) * 0.25 * 1300
  const results = Array.from({ length: 200 }, () => applyBlur(500, 100, 1300, CFG))
  assert.ok(results.every(x => Math.abs(x - 500) <= maxBlur + 0.01))
})
test('applyBlur: ランダムなので全部同じにはならない', () => {
  const results = Array.from({ length: 50 }, () => applyBlur(500, 100, 1300, CFG))
  const unique = new Set(results.map(x => Math.round(x)))
  assert.ok(unique.size > 1)
})
