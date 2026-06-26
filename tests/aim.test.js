import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hundredWindow } from '../js/aim.js'

test('hundredWindow: 342 → 300〜400', () => {
  assert.deepEqual(hundredWindow(342), { min: 300, max: 400 })
})
test('hundredWindow: 700 → 700〜800', () => {
  assert.deepEqual(hundredWindow(700), { min: 700, max: 800 })
})
test('hundredWindow: 995 → 900〜1000', () => {
  assert.deepEqual(hundredWindow(995), { min: 900, max: 1000 })
})
test('hundredWindow: 0 → 0〜100', () => {
  assert.deepEqual(hundredWindow(0), { min: 0, max: 100 })
})
