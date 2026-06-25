// tests/ruler.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valueToX, xToValue, getZoomRange, getTicks } from '../js/ruler.js'

const RSX = 80   // rulerStartX（仮）
const REX = 1220 // rulerEndX（Canvas幅1300・MARGIN=80）

test('valueToX: 0 → rulerStartX', () => {
  assert.equal(valueToX(0, 0, 1000, RSX, REX), RSX)
})
test('valueToX: 1000 → rulerEndX', () => {
  assert.equal(valueToX(1000, 0, 1000, RSX, REX), REX)
})
test('valueToX: 500 → 中央', () => {
  assert.equal(valueToX(500, 0, 1000, RSX, REX), (RSX + REX) / 2)
})
test('xToValue: 中央 → 500', () => {
  const mid = (RSX + REX) / 2
  assert.equal(xToValue(mid, 0, 1000, RSX, REX), 500)
})
test('xToValue: valueToX の逆変換', () => {
  const x = valueToX(340, 0, 1000, RSX, REX)
  assert.equal(xToValue(x, 0, 1000, RSX, REX), 340)
})

const CFG = {
  ZOOM: {
    LEVEL1: { tickStep: 100, rangeWidth: 1000 },
    LEVEL2: { tickStep: 10,  rangeWidth: 100  },
    LEVEL3: { tickStep: 5,   rangeWidth: 20   },
  },
}

test('getZoomRange: レベル1 は 0〜1000', () => {
  const r = getZoomRange(1, 300, CFG)
  assert.deepEqual(r, { min: 0, max: 1000, tickStep: 100 })
})
test('getZoomRange: レベル2・center=350 → 300〜400', () => {
  const r = getZoomRange(2, 350, CFG)
  assert.equal(r.min, 300)
  assert.equal(r.max, 400)
  assert.equal(r.tickStep, 10)
})
test('getZoomRange: レベル2・center=50 → min>=0', () => {
  const r = getZoomRange(2, 50, CFG)
  assert.ok(r.min >= 0)
  assert.ok(r.max <= 1000)
})
test('getZoomRange: レベル3・center=345 → 20幅', () => {
  const r = getZoomRange(3, 345, CFG)
  assert.equal(r.max - r.min, 20)
  assert.equal(r.tickStep, 5)
})

test('getTicks: 0〜1000・step100 → 11本', () => {
  const ticks = getTicks(0, 1000, 100)
  assert.equal(ticks.length, 11) // 0,100,...,1000
})
test('getTicks: 300〜400・step10 → 11本', () => {
  const ticks = getTicks(300, 400, 10)
  assert.equal(ticks.length, 11)
})
test('getTicks: isMajor は tickStep*5 の倍数', () => {
  const ticks = getTicks(0, 1000, 100)
  const majors = ticks.filter(t => t.isMajor)
  assert.ok(majors.every(t => t.value % 500 === 0))
})
