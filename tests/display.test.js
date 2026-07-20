import { test } from 'node:test'
import assert from 'node:assert'
import { formatRulerValue, parseDisplayInput } from '../js/display.js'

const MABOROSHI = { display: { divisor: 100, decimals: 1 } }
const NORMAL = {} // 既存ランク＝display なし

test('formatRulerValue: displayなしランクは内部値そのまま', () => {
  assert.equal(formatRulerValue(340, NORMAL), '340')
  assert.equal(formatRulerValue(0, NORMAL), '0')
  assert.equal(formatRulerValue(1000, undefined), '1000') // stage未定義でも落ちない
})

test('formatRulerValue: まぼろしは÷100で小数表示', () => {
  assert.equal(formatRulerValue(340, MABOROSHI), '3.4')
  assert.equal(formatRulerValue(1000, MABOROSHI), '10')
  assert.equal(formatRulerValue(0, MABOROSHI), '0')
})

test('formatRulerValue: 整数に割り切れる値は小数点を出さない（300→3）', () => {
  assert.equal(formatRulerValue(300, MABOROSHI), '3')
  assert.equal(formatRulerValue(100, MABOROSHI), '1')
})

test('parseDisplayInput: displayなしランクは整数として読む', () => {
  assert.equal(parseDisplayInput('340', NORMAL), 340)
  assert.equal(parseDisplayInput('007', NORMAL), 7)
})

test('parseDisplayInput: まぼろしは×100で内部値に戻す', () => {
  assert.equal(parseDisplayInput('3.4', MABOROSHI), 340)
  assert.equal(parseDisplayInput('3', MABOROSHI), 300)
  assert.equal(parseDisplayInput('10', MABOROSHI), 1000)
  assert.equal(parseDisplayInput('3.', MABOROSHI), 300) // 打ちかけでも落ちない
})

test('parseDisplayInput: 数値でなければ null', () => {
  assert.equal(parseDisplayInput('', MABOROSHI), null)
  assert.equal(parseDisplayInput('abc', NORMAL), null)
  assert.equal(parseDisplayInput('3.4.5', MABOROSHI), null)
})

test('往復で値が壊れない（format→parse＝恒等）', () => {
  for (const v of [0, 10, 340, 550, 990, 1000]) {
    assert.equal(parseDisplayInput(formatRulerValue(v, MABOROSHI), MABOROSHI), v)
    assert.equal(parseDisplayInput(formatRulerValue(v, NORMAL), NORMAL), v)
  }
})
