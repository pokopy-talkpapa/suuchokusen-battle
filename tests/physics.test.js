// tests/physics.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcPoints } from '../js/physics.js'

test('arcPoints: steps+1 個の点を返す', () => {
  assert.equal(arcPoints(0, 0, 100, 0, 20).length, 21)
})
test('arcPoints: 始点と終点は引数に一致', () => {
  const pts = arcPoints(10, 400, 800, 500, 36, 160)
  assert.equal(pts[0].x, 10)
  assert.equal(pts[0].y, 400)
  assert.equal(pts[pts.length - 1].x, 800)
  assert.equal(pts[pts.length - 1].y, 500)
})
test('arcPoints: 中央は直線より lift だけ上（Yが小さい）', () => {
  const pts = arcPoints(0, 100, 200, 100, 2, 160) // steps=2 → 中点が index1
  const straightMidY = 100
  assert.ok(pts[1].y < straightMidY, `中点Yは持ち上がる (got ${pts[1].y})`)
  assert.ok(Math.abs(pts[1].y - (straightMidY - 160)) < 0.001)
})
