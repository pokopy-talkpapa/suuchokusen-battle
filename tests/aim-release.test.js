import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AimInput, settleValueOnRelease, RELEASE_SETTLE_MS } from '../js/aim.js'
import { CONFIG } from '../js/config.js'
import { valueToX } from '../js/ruler.js'

// ── settleValueOnRelease（離し際ブレの巻き戻し）の純粋ロジック ──

test('離す直前のブレは捨てて、その前の位置に戻す', () => {
  // 550に合わせてじっと待ち、離す瞬間の一瞬（<90ms）だけ558へ流れたケース
  const history = [
    { t: 0,    val: 300 },
    { t: 500,  val: 550 },
    { t: 1985, val: 552 },
    { t: 1995, val: 558 },
  ]
  assert.equal(settleValueOnRelease(history, 2000, 558), 550)
})

test('じっと合わせてから離せば値は変わらない', () => {
  const history = [
    { t: 0,   val: 300 },
    { t: 500, val: 550 }, // ここから離すまで動いていない
  ]
  assert.equal(settleValueOnRelease(history, 2000, 550), 550)
})

test('つかんで即離した（履歴が全部新しい）時は今の値のまま', () => {
  const history = [{ t: 1990, val: 420 }]
  assert.equal(settleValueOnRelease(history, 2000, 420), 420)
})

test('履歴が空なら今の値のまま', () => {
  assert.equal(settleValueOnRelease([], 2000, 500), 500)
})

// ── AimInput のマルチタッチ・離し際ブレの結合テスト ──
// aim-input.test.js の fakeCanvas を identifier 対応に拡張したもの

function fakeCanvas(w = 844, h = 390) {
  const listeners = {}
  return {
    width: w, height: h, offsetWidth: w, offsetHeight: h,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn) },
    removeEventListener(type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn)
    },
    getBoundingClientRect() { return { left: 0, top: 0, width: w, height: h } },
    // touches=残っている指 / changed=今回動き・離れた指（実ブラウザのTouchEventを模す）
    dispatchTouch(type, { touches = [], changed = [] }) {
      const ev = { type, touches, changedTouches: changed, preventDefault() {} }
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
const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y })

function setup() {
  const canvas = fakeCanvas(W, H)
  const aim = new AimInput()
  aim.setStage(CONFIG.STAGES[0])
  aim.attach(canvas, CONFIG, panelGeom(), () => [])
  let now = 0
  aim._now = () => now
  return { canvas, aim, g: panelGeom(), setNow: (t) => { now = t } }
}

test('離し際ブレ：合わせて待ってから離すと、離す瞬間の流れが巻き戻る', () => {
  const { canvas, aim, g, setNow } = setup()
  const x550 = Math.round(valueToX(550, 0, 1000, g.sx, g.ex))
  const A = (x) => touch(1, x, g.y)
  setNow(0);    canvas.dispatchTouch('touchstart', { touches: [A(400)], changed: [A(400)] })
  setNow(500);  canvas.dispatchTouch('touchmove',  { touches: [A(x550)], changed: [A(x550)] })
  // じっと待って、離す瞬間（<90ms）だけ指が転がって +30px 流れる
  setNow(1990); canvas.dispatchTouch('touchmove',  { touches: [A(x550 + 30)], changed: [A(x550 + 30)] })
  setNow(2000); canvas.dispatchTouch('touchend',   { touches: [], changed: [A(x550 + 30)] })
  const v = aim.getState().needleValue
  assert.ok(Math.abs(v - 550) <= 1, `needle=${v} は 550 に戻るはず`)
})

test('2本目の指が触れても・動いても針は動かない', () => {
  const { canvas, aim, g } = setup()
  const A = (x) => touch(1, x, g.y)
  const B = (x) => touch(2, x, g.y)
  canvas.dispatchTouch('touchstart', { touches: [A(400)], changed: [A(400)] })
  const before = aim.getState().needleValue
  // 2本目（手のひら等）がパネル帯に触れて動く
  canvas.dispatchTouch('touchstart', { touches: [A(400), B(700)], changed: [B(700)] })
  canvas.dispatchTouch('touchmove',  { touches: [A(400), B(600)], changed: [B(600)] })
  assert.equal(aim.getState().needleValue, before)
})

test('2本目の指が離れてもドラッグは続く（針をつかんだ指の終わりだけで終了）', () => {
  const { canvas, aim, g } = setup()
  const x300 = Math.round(valueToX(300, 0, 1000, g.sx, g.ex))
  const A = (x) => touch(1, x, g.y)
  const B = (x) => touch(2, x, g.y)
  canvas.dispatchTouch('touchstart', { touches: [A(400)], changed: [A(400)] })
  canvas.dispatchTouch('touchstart', { touches: [A(400), B(700)], changed: [B(700)] })
  canvas.dispatchTouch('touchend',   { touches: [A(400)], changed: [B(700)] }) // Bだけ離れた
  canvas.dispatchTouch('touchmove',  { touches: [A(x300)], changed: [A(x300)] })
  const v = aim.getState().needleValue
  assert.ok(Math.abs(v - 300) <= 1, `needle=${v} は 300 のはず（ドラッグ継続）`)
})

test('先に手のひらが触れていても、あとから触れた指で正しくつかめる', () => {
  const { canvas, aim, g } = setup()
  const x300 = Math.round(valueToX(300, 0, 1000, g.sx, g.ex))
  const palm = touch(1, 400, 100) // 画面上部＝つかみ判定の外
  const A    = (x) => touch(2, x, g.y)
  canvas.dispatchTouch('touchstart', { touches: [palm], changed: [palm] })
  // 旧実装は e.touches[0]（＝手のひら）を見ていたため、ここで針がつかめなかった
  canvas.dispatchTouch('touchstart', { touches: [palm, A(x300)], changed: [A(x300)] })
  const v = aim.getState().needleValue
  assert.ok(Math.abs(v - 300) <= 1, `needle=${v} は 300 のはず`)
})

test('touchcancel でもドラッグが終わる（次のタッチが誤作動しない）', () => {
  const { canvas, aim, g } = setup()
  const A = (x) => touch(1, x, g.y)
  canvas.dispatchTouch('touchstart',  { touches: [A(400)], changed: [A(400)] })
  canvas.dispatchTouch('touchcancel', { touches: [], changed: [A(400)] })
  // キャンセル後、指が触れていないのに move が来ても針は動かない
  const before = aim.getState().needleValue
  canvas.dispatchTouch('touchmove', { touches: [A(700)], changed: [A(700)] })
  assert.equal(aim.getState().needleValue, before)
})
