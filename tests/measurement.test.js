import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateTarget, generateTargetInsideWindow, calcMeasurementError, judgeHit, measureAidLevel } from '../js/measurement.js'
import { getMeasureWindow } from '../js/ruler.js'
import { currentStage } from '../js/stage.js'
import { CONFIG } from '../js/config.js'

test('judgeHit: 差が許容幅以内なら命中', () => {
  assert.equal(judgeHit(360, 350, 30), true)   // 差10 <= 30
})
test('judgeHit: 差が許容幅ちょうどは命中', () => {
  assert.equal(judgeHit(380, 350, 30), true)   // 差30 <= 30
})
test('judgeHit: 差が許容幅超なら外れ', () => {
  assert.equal(judgeHit(400, 350, 30), false)  // 差50 > 30
})

test('generateTarget: tickStep=100 で100の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(0, 1000, 100)
    assert.ok(v >= 0 && v <= 1000)
    assert.equal(v % 100, 0)
  }
})
test('generateTarget: tickStep=10 で10の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(300, 400, 10)
    assert.ok(v >= 300 && v <= 400)
    assert.equal(v % 10, 0)
  }
})
test('generateTarget: tickStep=5 で5の倍数を返す', () => {
  for (let i = 0; i < 30; i++) {
    const v = generateTarget(340, 360, 5)
    assert.ok(v >= 340 && v <= 360)
    assert.equal(v % 5, 0)
  }
})

test('generateTarget: 端(0/1000)は正解にならない', () => {
  for (let i = 0; i < 200; i++) {
    const v = generateTarget(0, 1000, 100)
    assert.ok(v >= 100 && v <= 900, `端の値が出た: ${v}`)
  }
})

test('generateTargetInsideWindow: 中盤(span100)で正解が窓の端に乗らない', () => {
  const stage = CONFIG.STAGES[1] // 中盤: targetStep=10, measureMode='hundred'
  for (let i = 0; i < 200; i++) {
    const t = generateTargetInsideWindow(0, 1000, stage.targetStep, 100)
    const win = getMeasureWindow(t, stage, CONFIG)
    assert.ok(t > win.min && t < win.max, `窓の端: target=${t} win=${win.min}〜${win.max}`)
  }
})

test('generateTargetInsideWindow: 上級(span10)で正解が窓の端に乗らない', () => {
  const stage = CONFIG.STAGES[2] // 上級: targetStep=1, measureMode='ten'
  for (let i = 0; i < 200; i++) {
    const t = generateTargetInsideWindow(0, 1000, stage.targetStep, 10)
    const win = getMeasureWindow(t, stage, CONFIG)
    assert.ok(t > win.min && t < win.max, `窓の端: target=${t} win=${win.min}〜${win.max}`)
  }
})

test('calcMeasurementError: 正確なら0', () => {
  assert.equal(calcMeasurementError(300, 300), 0)
})
test('calcMeasurementError: 誤差は絶対値', () => {
  assert.equal(calcMeasurementError(285, 300), 15)
  assert.equal(calcMeasurementError(320, 300), 20)
})

test('段階別 hitMargin: 序盤(maxLevel1) は中盤(maxLevel2)より甘い', () => {
  const easy = currentStage(1, CONFIG).hitMargin
  const mid  = currentStage(2, CONFIG).hitMargin
  const hard = currentStage(3, CONFIG).hitMargin
  assert.ok(easy > mid && mid > hard, `序盤>中盤>上級 (${easy},${mid},${hard})`)
})

test('judgeHit: 上級 margin では序盤で当たる差が外れになりうる', () => {
  const target = 340
  const placed = 340 + 20 // 20ズレ
  const easy = currentStage(1, CONFIG).hitMargin // 45
  const hard = currentStage(3, CONFIG).hitMargin // 14
  assert.equal(judgeHit(placed, target, easy), true)
  assert.equal(judgeHit(placed, target, hard), false)
})

// ── 測量ミスの段階ヒント（v1.42）：2回外し=両端強調／4回外し=端のひとつ前に数字 ──
test('measureAidLevel: 0〜1回はヒントなし', () => {
  assert.equal(measureAidLevel(0), 0)
  assert.equal(measureAidLevel(1), 0)
})
test('measureAidLevel: 2〜3回で1段目（両端の強調）', () => {
  assert.equal(measureAidLevel(2), 1)
  assert.equal(measureAidLevel(3), 1)
})
test('measureAidLevel: 4回以上で2段目（端のひとつ前に数字）', () => {
  assert.equal(measureAidLevel(4), 2)
  assert.equal(measureAidLevel(7), 2)
})

test('正解は島ぎわ（min+50未満）に出ない', () => {
  for (let i = 0; i < 200; i++) {
    const t = generateTargetInsideWindow(0, 1000, 1, 10)
    assert.ok(t >= 50, `${t} は島ぎわ`)
    assert.ok(t % 10 !== 0, `${t} は窓端`)
  }
  for (let i = 0; i < 200; i++) {
    const t = generateTargetInsideWindow(0, 1000, 10, 100)
    assert.ok(t >= 50, `${t} は島ぎわ`)
  }
})
