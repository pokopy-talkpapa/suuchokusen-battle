import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enemyCamScale } from '../js/camera.js'

// テスト用の最小 CONFIG（実値に依存しないよう自前で持つ＝config調整で壊れない）
const CFG = {
  RULER: { MIN: 0, MAX: 1000 },
  ZOOM_ENEMY: { FULL_SCALE: 0.45, MAX_SCALE: 2.6, CURVE: 0.6 },
}

test('全体ビュー（0〜1000）では FULL_SCALE を返す', () => {
  assert.equal(enemyCamScale(0, 1000, CFG), 0.45)
})

test('ズームするほど大きくなる（単調増加）', () => {
  const full = enemyCamScale(0, 1000, CFG)   // 全体
  const win100 = enemyCamScale(400, 500, CFG) // 100窓
  const win10 = enemyCamScale(440, 450, CFG)  // 10窓
  assert.ok(win100 > full, '100窓は全体より大きい')
  assert.ok(win10 > win100, '10窓は100窓より大きい')
})

test('全体ビューは MAX_SCALE より小さい（伸びしろが残る）', () => {
  assert.ok(enemyCamScale(0, 1000, CFG) < CFG.ZOOM_ENEMY.MAX_SCALE)
})

test('最大ズームでも MAX_SCALE を超えない（上限で頭打ち）', () => {
  // 極端に狭い窓（1未満）でも上限を破らない
  assert.ok(enemyCamScale(500, 500.5, CFG) <= CFG.ZOOM_ENEMY.MAX_SCALE + 1e-9)
})

test('全体ビューでの倍率は 1.0 未満（ちっぽけなシルエット）', () => {
  assert.ok(enemyCamScale(0, 1000, CFG) < 1.0)
})
