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

// ── 保存データが壊れていても安全な値に丸めて復元する ──
test('壊れた保存値: maxLevel=0 は 1 に丸める（チップ全🔒バグの防止）', () => {
  const s = new UnlockState(CFG, { maxLevel: 0 })
  assert.equal(s.maxLevel, 1)
  assert.ok(s.isUnlocked(1))
})
test('壊れた保存値: 文字列・NaN・範囲外は既定値/丸めで復元', () => {
  assert.equal(new UnlockState(CFG, { maxLevel: 'abc' }).maxLevel, 1)
  assert.equal(new UnlockState(CFG, { maxLevel: 99 }).maxLevel, 3)
  assert.equal(new UnlockState(CFG, { level: -5 }).level, 1)
  assert.equal(new UnlockState(CFG, { streak: -3 }).streak, 0)
  assert.equal(new UnlockState(CFG, { streak: '2' }).streak, 2)
})
