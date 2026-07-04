import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pointInRect, isTapOnRect } from '../js/tap.js'

const FIRE = { x: 694, y: 326, w: 130, h: 52 } // 844x390 での「うつ！」ボタン相当

test('pointInRect: 中と外', () => {
  assert.equal(pointInRect({ x: 759, y: 352 }, FIRE), true)
  assert.equal(pointInRect({ x: 400, y: 320 }, FIRE), false)
  assert.equal(pointInRect(null, FIRE), false)
})

test('isTapOnRect: 押す・離すが両方ボタン内 → タップ成立', () => {
  assert.equal(isTapOnRect({ x: 759, y: 352 }, { x: 755, y: 350 }, FIRE), true)
})

test('isTapOnRect: パネルからのドラッグをボタン上で離しても発射しない', () => {
  // 押した点はパネル帯（ボタン外）、離した点はボタン内 → タップではない
  assert.equal(isTapOnRect({ x: 400, y: 320 }, { x: 759, y: 352 }, FIRE), false)
})

test('isTapOnRect: ボタンで押して外で離す → 発射しない', () => {
  assert.equal(isTapOnRect({ x: 759, y: 352 }, { x: 400, y: 320 }, FIRE), false)
})
