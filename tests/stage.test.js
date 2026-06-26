import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stageIndexFromMaxLevel, currentStage } from '../js/stage.js'

const CFG = { STAGES: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }

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
  assert.equal(stageIndexFromMaxLevel(9, CFG), 2)
})
test('currentStage は対応する STAGES 要素を返す', () => {
  assert.equal(currentStage(2, CFG).name, 'b')
})
