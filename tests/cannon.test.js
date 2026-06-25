// tests/cannon.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampDrag } from '../js/cannon.js'

const CFG = { CANNON: { DRAG_MIN_PX: 20, DRAG_MAX_PX: 160 } }

test('clampDrag: 最小未満は null', () => {
  assert.equal(clampDrag(10, 5, CFG), null)
})
test('clampDrag: 通常範囲はそのまま返す', () => {
  const r = clampDrag(60, 60, CFG)
  assert.ok(r !== null)
  assert.equal(r.dx, 60)
  assert.equal(r.dy, 60)
})
test('clampDrag: 最大超過はDRAG_MAX_PXにスケールダウン', () => {
  const r = clampDrag(200, 0, CFG)
  assert.ok(r !== null)
  const len = Math.sqrt(r.dx ** 2 + r.dy ** 2)
  assert.ok(Math.abs(len - 160) < 0.01)
})
test('clampDrag: 方向は保持される', () => {
  const r = clampDrag(200, 200, CFG)
  assert.ok(r !== null)
  // dx/dy の比が元と同じ
  assert.ok(Math.abs(r.dx / r.dy - 1) < 0.01)
})
