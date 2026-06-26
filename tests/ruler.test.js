// tests/ruler.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { valueToX, xToValue, getMeasureWindow, getTicks } from '../js/ruler.js'

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

const SCFG = { RULER: { MIN: 0, MAX: 1000 } }
const full    = { measureMode: 'full',    measureTickStep: 100 }
const hundred = { measureMode: 'hundred', measureTickStep: 10 }
const ten     = { measureMode: 'ten',     measureTickStep: 1 }

test('getMeasureWindow: full は常に 0〜1000', () => {
  assert.deepEqual(getMeasureWindow(340, full, SCFG), { min: 0, max: 1000, tickStep: 100 })
})
test('getMeasureWindow: hundred・target=340 → 300〜400', () => {
  assert.deepEqual(getMeasureWindow(340, hundred, SCFG), { min: 300, max: 400, tickStep: 10 })
})
test('getMeasureWindow: ten・target=342 → 340〜350', () => {
  assert.deepEqual(getMeasureWindow(342, ten, SCFG), { min: 340, max: 350, tickStep: 1 })
})
test('getMeasureWindow: hundred・target=1000 は上端にクランプ', () => {
  assert.deepEqual(getMeasureWindow(1000, hundred, SCFG), { min: 900, max: 1000, tickStep: 10 })
})
test('getMeasureWindow: ten・target=0 は下端にクランプ', () => {
  assert.deepEqual(getMeasureWindow(0, ten, SCFG), { min: 0, max: 10, tickStep: 1 })
})
