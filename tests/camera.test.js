import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enemyCamScale, isZoomableScene } from '../js/camera.js'

// テスト用の最小 CONFIG（実値に依存しないよう自前で持つ＝config調整で壊れない）
const CFG = {
  RULER: { MIN: 0, MAX: 1000 },
  ZOOM_ENEMY: {
    BY_LEVEL: [0.45, 2.0, 3.4],
    ANCHOR_BY_LEVEL: [0.55, 0.62, 0.70],
    STATIC_SCALE: 1.0,
    STATIC_ANCHOR: 0.55,
    TOP_MARGIN: 16,
  },
  ZOOM_SEA: { SCALE_BY_LEVEL: [1.0, 1.15, 1.3], PAN_FACTOR: 0.15 },
}

test('倍率はレベル別テーブルどおり（全体/100窓/10窓）', () => {
  assert.equal(enemyCamScale(0, 1000, CFG), 0.45)   // 全体=level0
  assert.equal(enemyCamScale(400, 500, CFG), 2.0)   // 100窓=level1
  assert.equal(enemyCamScale(440, 450, CFG), 3.4)   // 10窓=level2
})

test('中間の窓では滑らかに補間される（単調増加）', () => {
  const full = enemyCamScale(0, 1000, CFG)
  const mid1 = enemyCamScale(300, 600, CFG)  // 300窓＝全体と100窓の間
  const win100 = enemyCamScale(400, 500, CFG)
  const mid2 = enemyCamScale(420, 450, CFG)  // 30窓＝100窓と10窓の間
  const win10 = enemyCamScale(440, 450, CFG)
  assert.ok(full < mid1 && mid1 < win100, '全体〜100窓が単調増加')
  assert.ok(win100 < mid2 && mid2 < win10, '100窓〜10窓が単調増加')
})

test('10窓より狭い窓ではテーブル末尾でクランプ（それ以上大きくならない）', () => {
  assert.equal(enemyCamScale(500, 500.5, CFG), 3.4)
})

test('全体ビューでの倍率は 1.0 未満（ちっぽけなシルエット）', () => {
  assert.ok(enemyCamScale(0, 1000, CFG) < 1.0)
})

test('ズームの無い場面では STATIC_SCALE を返す（答え合わせ・みならい）', () => {
  assert.equal(enemyCamScale(0, 1000, CFG, false), 1.0)
  assert.equal(enemyCamScale(440, 450, CFG, false), 1.0)
})

test('isZoomableScene: 測量＋ズームを持つランクは true', () => {
  assert.equal(isZoomableScene('MEASURE', { measureMode: 'hundred' }), true)
  assert.equal(isZoomableScene('MEASURE', { measureMode: 'ten' }), true)
})

test('isZoomableScene: みならい（measureMode:full）の測量は false', () => {
  assert.equal(isZoomableScene('MEASURE', { measureMode: 'full' }), false)
})

test('isZoomableScene: 答え合わせ（FIRE/RESULT）は false', () => {
  assert.equal(isZoomableScene('FIRE', { measureMode: 'ten' }), false)
  assert.equal(isZoomableScene('RESULT', { measureMode: 'ten' }), false)
})
