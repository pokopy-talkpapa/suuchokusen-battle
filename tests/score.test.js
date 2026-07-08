import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcShotScore, ScoreState } from '../js/score.js'
import { rankInfo, nextRankNeed } from '../js/stage.js'
import { CONFIG } from '../js/config.js'

const S = CONFIG.SCORE

test('calcShotScore: ど真ん中は満点', () => {
  assert.equal(calcShotScore(340, 340, 45, S), 100)
})

test('calcShotScore: 命中圏ぎりぎりは端の点数', () => {
  assert.equal(calcShotScore(385, 340, 45, S), 60)
})

test('calcShotScore: 中間は線形（半分ズレ→80点）', () => {
  assert.equal(calcShotScore(360, 340, 40, S), 80)
})

test('calcShotScore: 外れは0点', () => {
  assert.equal(calcShotScore(400, 340, 45, S), 0)
})

test('ScoreState: SET_SIZE発でセット満了・合計が自己ベストになる', () => {
  const st = new ScoreState(S)
  let last = null
  for (let i = 0; i < S.SET_SIZE; i++) last = st.addShot(80)
  assert.equal(last.finished, true)
  assert.equal(last.isNewBest, true)
  assert.equal(st.best, 80 * S.SET_SIZE)
})

test('ScoreState: 前のベストより低い合計はベスト更新しない', () => {
  const st = new ScoreState(S, { best: 900 })
  let last = null
  for (let i = 0; i < S.SET_SIZE; i++) last = st.addShot(50)
  assert.equal(last.finished, true)
  assert.equal(last.isNewBest, false)
  assert.equal(st.best, 900)
})

test('ScoreState: startNewSet でセットが空に戻る（ベストは維持）', () => {
  const st = new ScoreState(S)
  for (let i = 0; i < S.SET_SIZE; i++) st.addShot(70)
  st.startNewSet()
  assert.equal(st.shotCount(), 0)
  assert.equal(st.setTotal(), 0)
  assert.equal(st.best, 700)
})

test('nextRankNeed: みならい→3・いっちょまえ→6・でんせつ→null', () => {
  assert.equal(nextRankNeed(1, CONFIG), CONFIG.UNLOCK.BINOCULARS_STREAK)
  assert.equal(nextRankNeed(2, CONFIG), CONFIG.UNLOCK.TELESCOPE_STREAK)
  assert.equal(nextRankNeed(3, CONFIG), null)
})

test('rankInfo: ランク名と残り回数', () => {
  const r1 = rankInfo(1, 1, CONFIG)
  assert.equal(r1.name, 'みならい砲手')
  assert.equal(r1.nextName, 'いっちょまえ砲手')
  assert.equal(r1.remaining, CONFIG.UNLOCK.BINOCULARS_STREAK - 1)
  const r3 = rankInfo(3, 8, CONFIG)
  assert.equal(r3.name, 'でんせつの砲手')
  assert.equal(r3.needed, null)
  assert.equal(r3.nextName, null)
})

// ── 保存データが壊れていても安全な値に丸めて復元する ──
import { ScoreState as _SanState } from '../js/score.js'
test('壊れた保存値: best が数値でない/負なら 0 に戻す', () => {
  const SCORE = { SET_SIZE: 10, MAX: 100, MIN_AT_EDGE: 10 }
  assert.equal(new _SanState(SCORE, { best: 'xyz' }).best, 0)
  assert.equal(new _SanState(SCORE, { best: -50 }).best, 0)
  assert.equal(new _SanState(SCORE, { best: 123.9 }).best, 123)
})
