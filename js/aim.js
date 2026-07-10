// js/aim.js
// 照準パネル（手元の数直線）まわり。Task 3 では純粋ヘルパのみ。
// value を含む100窓（上級の射撃ズーム用）
export function hundredWindow(value) {
  const min = Math.floor(value / 100) * 100
  return { min, max: min + 100 }
}

import { valueToX, xToValue } from './ruler.js'

// ── 離し際ブレ（リフトオフジッター）対策 ──
// 指を持ち上げる瞬間は接地面が縮みながら転がるため、最後の一瞬だけ座標が横に流れた
// touchmove が届くことがある（毎回ではなく指の離し方次第＝「ときどき」起こる・2026-07-10実機FB）。
// 離した時刻から SETTLE_MS 以上前の最後のサンプルへ針を戻す＝離す直前の動きだけを捨てる。
// じっと合わせてから離す限り値は変わらない。つかんで即離した（履歴が全部新しい）時もそのまま。
export const RELEASE_SETTLE_MS = 90
export function settleValueOnRelease(history, tEnd, currentVal) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (tEnd - history[i].t >= RELEASE_SETTLE_MS) return history[i].val
  }
  return currentVal
}

export class AimInput {
  constructor() {
    this._canvas    = null
    this._CONFIG    = null
    this._getGeom   = null   // () => { sx, ex, y }（毎回呼ぶ＝リサイズ追従）
    this._stage     = null
    this._panelMin  = 0
    this._panelMax  = 1000
    this._tickStep  = 100
    this._zoomed    = false
    this._needleVal = 500
    this._dragging  = false
    this._touchId   = null   // 針をつかんでいる指のID（1本だけ追う。手のひら・2本目対策）
    this._history   = []     // ドラッグ中の {t, val} サンプル（離し際ブレの巻き戻し用）
    this._now       = () => performance.now() // テストから差し替えられる時計
    this._handlers  = {}
    this.onNeedleMove = null // 針が動いたとき呼ぶ（game が効果音を鳴らす。間引きは音側）
  }

  setStage(stage) {
    this._stage    = stage
    this._panelMin = 0
    this._panelMax = 1000
    this._tickStep = stage.aim.tickStep
    this._zoomed   = false
    this._needleVal = 500
  }

  // 上級のみ：針値を含む100窓へズーム／戻す
  toggleZoom() {
    if (!this._stage || !this._stage.aim.zoomable) return
    if (this._zoomed) {
      this._panelMin = 0; this._panelMax = 1000
      this._tickStep = this._stage.aim.tickStep
      this._zoomed = false
    } else {
      const w = hundredWindow(this._needleVal)
      this._panelMin = w.min; this._panelMax = w.max
      this._tickStep = this._stage.aim.zoomTickStep
      this._zoomed = true
    }
  }

  getState() {
    return {
      needleValue: this._needleVal,
      panelMin:    this._panelMin,
      panelMax:    this._panelMax,
      tickStep:    this._tickStep,
      zoomed:      this._zoomed,
    }
  }

  _needleX() {
    const g = this._getGeom()
    return valueToX(this._needleVal, this._panelMin, this._panelMax, g.sx, g.ex)
  }

  // getPanelGeom / getBlockedRects は毎回呼ぶ関数で渡す。
  // スナップショットで持つと、AIM中のリサイズ（iOSツールバー収納・回転）で
  // 描画と入力の座標がズレて「見た目どおりに置いたのに違う値」になる。
  attach(canvas, CONFIG, getPanelGeom, getBlockedRects = null) {
    this._canvas  = canvas
    this._CONFIG  = CONFIG
    this._getGeom = (typeof getPanelGeom === 'function') ? getPanelGeom : () => getPanelGeom
    this._getBlockedRects = getBlockedRects

    const toXY = (pt) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: (pt.clientX - rect.left) * (canvas.offsetWidth  / rect.width),
        y: (pt.clientY - rect.top)  * (canvas.offsetHeight / rect.height),
      }
    }
    const setFromX = (x) => {
      const { sx, ex } = this._getGeom()
      const cx = Math.max(sx, Math.min(ex, x))
      const prev = this._needleVal
      this._needleVal = xToValue(cx, this._panelMin, this._panelMax, sx, ex)
      this._history.push({ t: this._now(), val: this._needleVal })
      if (this._history.length > 64) this._history.shift()
      if (this._needleVal !== prev && this.onNeedleMove) this.onNeedleMove()
    }
    const inBlockedRect = (x, y) => {
      const rects = this._getBlockedRects ? this._getBlockedRects() : []
      return rects.some(r => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
    }

    const onStart = (e) => {
      // 針をつかめる指は同時に1本だけ。2本目の指や画面に触れた手のひらでは針を動かさない。
      if (this._dragging) return
      // 「新しく触れた指」で判定する（e.touches[0]だと、先に手のひらが触れていた時にそちらを見てしまう）
      const pt = e.changedTouches ? e.changedTouches[0] : e
      const { x, y } = toXY(pt)
      const g = this._getGeom()
      // ボタンの上は針をつかまない（「うつ！」に触れた瞬間に針が飛ぶ誤射バグの根本対策）
      if (inBlockedRect(x, y)) return
      // パネル帯の近く（縦方向）だけつかめる。空や敵船へのタッチで針を動かさない。
      if (Math.abs(y - g.y) > CONFIG.AIM_PANEL.HEIGHT) return
      // 針付近をつかんだ時だけドラッグ開始（つまみやすさ）。
      // それ以外でも、パネル帯の範囲内なら即その位置へ針を移動して掴む。
      if (Math.abs(x - this._needleX()) <= CONFIG.NEEDLE.GRAB_PAD ||
          (x >= g.sx && x <= g.ex)) {
        this._dragging = true
        this._touchId  = e.changedTouches ? pt.identifier : 'mouse'
        this._history  = []
        setFromX(x)
      }
    }
    const onMove = (e) => {
      if (!this._dragging) return
      e.preventDefault()
      let pt = e
      if (e.touches) {
        pt = Array.from(e.touches).find(t => t.identifier === this._touchId)
        if (!pt) return // 針をつかんでいる指以外（2本目・手のひら）の動きは追わない
      } else if (this._touchId !== 'mouse') {
        return
      }
      setFromX(toXY(pt).x)
    }
    const onEnd = (e) => {
      if (!this._dragging) return
      if (e && e.changedTouches) {
        // 離れたのが「針をつかんでいる指」の時だけ終了（他の指が離れてもドラッグ継続）
        if (!Array.from(e.changedTouches).some(t => t.identifier === this._touchId)) return
      } else if (this._touchId !== 'mouse') {
        return
      }
      this._dragging = false
      this._touchId  = null
      // 離し際ブレの巻き戻し（詳細は settleValueOnRelease のコメント）
      const settled = settleValueOnRelease(this._history, this._now(), this._needleVal)
      if (settled !== this._needleVal) {
        this._needleVal = settled
        if (this.onNeedleMove) this.onNeedleMove()
      }
      this._history = []
    }

    canvas.addEventListener('touchstart',  onStart, { passive: true })
    canvas.addEventListener('touchmove',   onMove,  { passive: false })
    canvas.addEventListener('touchend',    onEnd)
    canvas.addEventListener('touchcancel', onEnd) // OSにタッチを横取りされた時も必ずドラッグ終了
    canvas.addEventListener('mousedown',   onStart)
    canvas.addEventListener('mousemove',   onMove)
    canvas.addEventListener('mouseup',     onEnd)
    this._handlers = { onStart, onMove, onEnd }
  }

  detach() {
    if (!this._canvas) return
    const { onStart, onMove, onEnd } = this._handlers
    this._canvas.removeEventListener('touchstart',  onStart)
    this._canvas.removeEventListener('touchmove',   onMove)
    this._canvas.removeEventListener('touchend',    onEnd)
    this._canvas.removeEventListener('touchcancel', onEnd)
    this._canvas.removeEventListener('mousedown',   onStart)
    this._canvas.removeEventListener('mousemove',   onMove)
    this._canvas.removeEventListener('mouseup',     onEnd)
    this._canvas = null
    this._dragging = false
    this._touchId  = null
    this._history  = []
  }
}
