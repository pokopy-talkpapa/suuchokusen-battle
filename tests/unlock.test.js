import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UnlockState } from '../js/unlock.js'

const CFG = { UNLOCK: { BINOCULARS_STREAK: 3, TELESCOPE_STREAK: 6, HIT_MARGIN_VALUE: 30 } }

test('初期状態: level=1, streak=0, maxLevel=1', () => {
  const s = new UnlockState(CFG)
  assert.equal(s.level, 1)
  assert.equal(s.streak, 0)
  assert.equal(s.maxLevel, 1)
})
test('isUnlocked(1) は常に true', () => {
  assert.ok(new UnlockState(CFG).isUnlocked(1))
})
test('isUnlocked(2) は最初 false', () => {
  assert.ok(!new UnlockState(CFG).isUnlocked(2))
})
test('3連続命中でレベル2解放', () => {
  const s = new UnlockState(CFG)
  s.recordHit(true); s.recordHit(true); s.recordHit(true)
  assert.ok(s.isUnlocked(2))
  assert.equal(s.maxLevel, 2)
})
test('miss 後は streak リセット', () => {
  const s = new UnlockState(CFG)
  s.recordHit(true); s.recordHit(true)
  s.recordHit(false)
  assert.equal(s.streak, 0)
})
test('6連続命中でレベル3解放', () => {
  const s = new UnlockState(CFG)
  for (let i = 0; i < 6; i++) s.recordHit(true)
  assert.ok(s.isUnlocked(3))
  assert.equal(s.maxLevel, 3)
})
test('一度解放されたレベルは miss 後も維持される', () => {
  const s = new UnlockState(CFG)
  for (let i = 0; i < 3; i++) s.recordHit(true)
  s.recordHit(false) // streak リセット
  assert.ok(s.isUnlocked(2)) // 解放は維持
})
