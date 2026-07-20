import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stageIndexFromMaxLevel, currentStage, nextRankNeed, rankInfo } from '../js/stage.js'

const CFG = {
  STAGES: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'まぼろしの砲手' }],
  UNLOCK: { BINOCULARS_STREAK: 3, TELESCOPE_STREAK: 6, MABOROSHI_STREAK: 9 },
}

test('maxLevel 1 → 段階0（序盤）', () => {
  assert.equal(stageIndexFromMaxLevel(1, CFG), 0)
})
test('maxLevel 2 → 段階1（中盤）', () => {
  assert.equal(stageIndexFromMaxLevel(2, CFG), 1)
})
test('maxLevel 3 → 段階2（上級）', () => {
  assert.equal(stageIndexFromMaxLevel(3, CFG), 2)
})
test('範囲外の maxLevel はクランプされる', () => {
  assert.equal(stageIndexFromMaxLevel(0, CFG), 0)
  assert.equal(stageIndexFromMaxLevel(9, CFG), 3)
})
test('currentStage は対応する STAGES 要素を返す', () => {
  assert.equal(currentStage(2, CFG).name, 'b')
})

test('nextRankNeed: でんせつ(3)の次は9連続・まぼろし(4)は最高ランク', () => {
  assert.equal(nextRankNeed(3, CFG), 9)
  assert.equal(nextRankNeed(4, CFG), null)
})

test('rankInfo: でんせつ時の次ランク名はまぼろしの砲手', () => {
  const info = rankInfo(3, 7, CFG)
  assert.equal(info.needed, 9)
  assert.equal(info.remaining, 2)
  assert.equal(info.nextName, 'まぼろしの砲手')
})

test('rankInfo: まぼろし到達後は残り表示なし', () => {
  const info = rankInfo(4, 3, CFG)
  assert.equal(info.name, 'まぼろしの砲手')
  assert.equal(info.needed, null)
  assert.equal(info.remaining, null)
  assert.equal(info.nextName, null)
})
