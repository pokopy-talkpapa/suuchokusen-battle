import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AimInput } from '../js/aim.js'
import { CONFIG } from '../js/config.js'
import { judgeHit } from '../js/measurement.js'
import { valueToX, xToValue } from '../js/ruler.js'

// 844x390（横向きスマホ）想定の疑似キャンバス。
// AimInput が addEventListener したハンドラを直接叩いてタッチを再現する。
function fakeCanvas(w = 844, h = 390) {
  const listeners = {}
  return {
    width: w,
    height: h,
    offsetWidth: w,
    offsetHeight: h,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn) },
    removeEventListener(type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn)
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h } },
    dispatch(type, x, y) {
      const t = { clientX: x, clientY: y }
      const ev = {
        type,
        touches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
        preventDefault() {},
      }
      ;(listeners[type] || []).forEach(fn => fn(ev))
    },
  }
}

const W = 844, H = 390
const panelGeom = () => ({
  sx: CONFIG.AIM_PANEL.MARGIN_X,
  ex: W - CONFIG.AIM_PANEL.MARGIN_X,
  y: H - CONFIG.AIM_PANEL.Y_FROM_BOTTOM,
})
// game.js の _buttonRects / _backButtonRect と同じ矩形
const fireRect = { x: W - 150, y: H - 64, w: 130, h: 52 }
const backRect = { x: 14, y: 14, w: 88, h: 44 }

function setup({ blocked = [fireRect, backRect] } = {}) {
  const canvas = fakeCanvas(W, H)
  const aim = new AimInput()
  aim.setStage(CONFIG.STAGES[0])
  aim.attach(canvas, CONFIG, panelGeom(), () => blocked)
  return { canvas, aim }
}

test('パネル帯の中をタッチすると針がそこへ動く', () => {
  const { canvas, aim } = setup()
  const g = panelGeom()
  canvas.dispatch('touchstart', 400, g.y)
  canvas.dispatch('touchend', 400, g.y)
  const v = aim.getState().needleValue
  const expected = xToValue(400, 0, 1000, g.sx, g.ex)
  assert.ok(Math.abs(v - expected) <= 1, `needle=${v} は ${expected} のはず`)
})

test('「うつ！」ボタン内のタッチでは針が動かない（誤射の根本原因）', () => {
  const { canvas, aim } = setup()
  const before = aim.getState().needleValue
  canvas.dispatch('touchstart', fireRect.x + fireRect.w / 2, fireRect.y + fireRect.h / 2)
  canvas.dispatch('touchend', fireRect.x + fireRect.w / 2, fireRect.y + fireRect.h / 2)
  assert.equal(aim.getState().needleValue, before)
})

test('パネル帯から離れた場所（空など）のタッチでは針が動かない', () => {
  const { canvas, aim } = setup()
  const before = aim.getState().needleValue
  canvas.dispatch('touchstart', 400, 100) // 画面上部＝空
  canvas.dispatch('touchend', 400, 100)
  assert.equal(aim.getState().needleValue, before)
})

test('もどるボタン内のタッチでは針が動かない', () => {
  const { canvas, aim } = setup()
  const before = aim.getState().needleValue
  canvas.dispatch('touchstart', backRect.x + 20, backRect.y + 20)
  canvas.dispatch('touchend', backRect.x + 20, backRect.y + 20)
  assert.equal(aim.getState().needleValue, before)
})

test('AIM中に画面リサイズしても、置いた位置の値が新しいジオメトリで解釈される', () => {
  // 実機で起きる「iOSツールバー収納・回転」相当：attach後にキャンバス幅が変わる
  const canvas = fakeCanvas(W, H)
  const aim = new AimInput()
  aim.setStage(CONFIG.STAGES[0])
  const geomOf = () => ({
    sx: CONFIG.AIM_PANEL.MARGIN_X,
    ex: canvas.width - CONFIG.AIM_PANEL.MARGIN_X,
    y: canvas.height - CONFIG.AIM_PANEL.Y_FROM_BOTTOM,
  })
  aim.attach(canvas, CONFIG, geomOf, () => [])
  // リサイズ（横667に縮む）
  canvas.width = 667
  canvas.height = 375
  canvas.offsetWidth = 667
  canvas.offsetHeight = 375
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 667, height: 375 })
  const g = geomOf()
  // 新しい画面で値300の位置をタッチ → 300 と読めること（旧バグ：古い幅で換算されズレる）
  const tx = Math.round(valueToX(300, 0, 1000, g.sx, g.ex))
  canvas.dispatch('touchstart', tx, g.y)
  canvas.dispatch('touchend', tx, g.y)
  const v = aim.getState().needleValue
  assert.ok(Math.abs(v - 300) <= 1, `needle=${v} は 300 のはず`)
})

test('保証：正しい値に針を置いて「うつ！」を押しても針が動かず、必ず命中する', () => {
  for (const stage of CONFIG.STAGES) {
    // 各ステージで代表的な正解値を試す（端・中央を含む）
    for (const target of [0, 100, 300, 500, 700, 1000]) {
      const { canvas, aim } = setup()
      aim.setStage(stage)
      const g = panelGeom()
      // 針を正解位置の画素へドラッグ（子どもの操作を再現）
      const tx = Math.round(valueToX(target, 0, 1000, g.sx, g.ex))
      canvas.dispatch('touchstart', tx, g.y)
      canvas.dispatch('touchend', tx, g.y)
      // 「うつ！」ボタンに触れる（touchstart→touchend）
      canvas.dispatch('touchstart', fireRect.x + fireRect.w / 2, fireRect.y + fireRect.h / 2)
      canvas.dispatch('touchend', fireRect.x + fireRect.w / 2, fireRect.y + fireRect.h / 2)
      const landed = aim.getState().needleValue
      assert.ok(
        judgeHit(landed, target, stage.hitMargin),
        `${stage.name}: target=${target} needle=${landed} margin=${stage.hitMargin} で外れた`
      )
    }
  }
})
