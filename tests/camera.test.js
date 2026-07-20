import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enemyCamScale, enemyAnchorFrac, isZoomableScene, seaCamera, seaSourceRect } from '../js/camera.js'

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

test('足元の高さはレベル別テーブルどおり＋中間は補間', () => {
  assert.equal(enemyAnchorFrac(0, 1000, CFG), 0.55)   // 全体=水平線
  assert.equal(enemyAnchorFrac(400, 500, CFG), 0.62)  // 100窓
  assert.equal(enemyAnchorFrac(440, 450, CFG), 0.70)  // 10窓=手前(下)に構える
  const mid = enemyAnchorFrac(420, 450, CFG)          // 30窓
  assert.ok(mid > 0.62 && mid < 0.70, '中間は補間される')
})

test('足元: ズームの無い場面では STATIC_ANCHOR（水平線）固定', () => {
  assert.equal(enemyAnchorFrac(440, 450, CFG, false), 0.55)
})

test('海の拡大率はレベル別テーブルどおり', () => {
  assert.equal(seaCamera(0, 1000, 0.5, CFG).scale, 1.0)
  assert.equal(seaCamera(400, 500, 0.5, CFG).scale, 1.15)
  assert.equal(seaCamera(440, 450, 0.5, CFG).scale, 1.3)
})

test('海のパン: 敵が中央なら0・右寄りなら正・左寄りなら負', () => {
  assert.equal(seaCamera(440, 450, 0.5, CFG).panFrac, 0)
  assert.ok(seaCamera(440, 450, 0.8, CFG).panFrac > 0)
  assert.ok(seaCamera(440, 450, 0.2, CFG).panFrac < 0)
})

test('海: ズームの無い場面では等倍・パンなし', () => {
  assert.deepEqual(seaCamera(440, 450, 0.8, CFG, false), { scale: 1, panFrac: 0 })
})

test('seaSourceRect: 等倍・パンなしは現行描画と同一（全幅・上端0・crop 0.96）', () => {
  const r = seaSourceRect(2000, 1000, 1.0, 0)
  assert.equal(r.sx, 0)
  assert.equal(Math.round(r.sy), 0)
  assert.equal(r.sw, 2000)
  assert.equal(r.sh, 960)
})

test('seaSourceRect: 拡大しても水平線(画像53%)がソース矩形内の同じ割合(53/96)に居続ける', () => {
  const r = seaSourceRect(2000, 1000, 1.3, 0)
  const horizonFracInRect = (1000 * 0.53 - r.sy) / r.sh
  assert.ok(Math.abs(horizonFracInRect - 0.53 / 0.96) < 1e-9)
})

test('seaSourceRect: 大きくパンしても画像の端を超えない', () => {
  const r1 = seaSourceRect(2000, 1000, 1.3, 5)   // 極端な右パン
  assert.ok(r1.sx >= 0 && r1.sx + r1.sw <= 2000)
  const r2 = seaSourceRect(2000, 1000, 1.3, -5)  // 極端な左パン
  assert.ok(r2.sx >= 0 && r2.sx + r2.sw <= 2000)
})

// 月まん丸の保証：ソース矩形の縦横比が画面の縦横比と一致していれば、
// drawImage で全面に貼っても絵は歪まない（画像内の円は円のまま）
test('seaSourceRect: viewAspect指定時はソース矩形が画面と同じ縦横比（歪みゼロ）', () => {
  for (const aspect of [2.16, 1.75, 0.5]) {
    for (const scale of [1.0, 1.15, 1.3]) {
      const r = seaSourceRect(2000, 1000, scale, 0, aspect)
      assert.ok(Math.abs(r.sw / r.sh - aspect) < 1e-9, `aspect=${aspect} scale=${scale}`)
    }
  }
})

test('seaSourceRect: viewAspect指定時も水平線は画面の同じ高さ(53/96)に居続ける', () => {
  for (const aspect of [2.16, 0.5]) {
    const r = seaSourceRect(2000, 1000, 1.3, 0, aspect)
    const horizonFracInRect = (1000 * 0.53 - r.sy) / r.sh
    assert.ok(Math.abs(horizonFracInRect - 0.53 / 0.96) < 1e-9, `aspect=${aspect}`)
  }
})

test('seaSourceRect: viewAspect指定時も矩形は画像内に収まる（極端なパン込み）', () => {
  for (const aspect of [2.16, 0.5]) {
    for (const pan of [0, 5, -5]) {
      const r = seaSourceRect(2000, 1000, 1.3, pan, aspect)
      assert.ok(r.sx >= -1e-9 && r.sx + r.sw <= 2000 + 1e-9, `sx aspect=${aspect} pan=${pan}`)
      assert.ok(r.sy >= -1e-9 && r.sy + r.sh <= 1000 + 1e-9, `sy aspect=${aspect} pan=${pan}`)
    }
  }
})

test('seaSourceRect: viewAspect省略時は従来の全面描画と完全一致（後方互換）', () => {
  const r = seaSourceRect(2000, 1000, 1.0, 0)
  assert.equal(r.sx, 0)
  assert.equal(Math.round(r.sy), 0)
  assert.equal(r.sw, 2000)
  assert.equal(r.sh, 960)
})
