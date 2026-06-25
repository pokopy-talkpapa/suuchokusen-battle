import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateTarget, calcMeasurementError, judgeHit } from '../js/measurement.js'

test('judgeHit: 差が許容幅以内なら命中', () => {
  assert.equal(judgeHit(360, 350, 30), true)   // 差10 <= 30
})
test('judgeHit: 差が許容幅ちょうどは命中', () => {
  assert.equal(judgeHit(380, 350, 30), true)   // 差30 <= 30
})
test('judgeHit: 差が許容幅超なら外れ', () => {
  assert.equal(judgeHit(400, 350, 30), false)  // 差50 > 30
})

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

