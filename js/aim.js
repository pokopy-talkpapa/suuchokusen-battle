// js/aim.js
// 照準パネル（手元の数直線）まわり。Task 3 では純粋ヘルパのみ。
// value を含む100窓（上級の射撃ズーム用）
export function hundredWindow(value) {
  const min = Math.floor(value / 100) * 100
  return { min, max: min + 100 }
}

import { valueToX, xToValue } from './ruler.js'

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
        x: (pt.clientX - rect.left) * (canvas.width  / rect.width),
        y: (pt.clientY - rect.top)  * (canvas.height / rect.height),
      }
    }
    const setFromX = (x) => {
      const { sx, ex } = this._getGeom()
      const cx = Math.max(sx, Math.min(ex, x))
      const prev = this._needleVal
      this._needleVal = xToValue(cx, this._panelMin, this._panelMax, sx, ex)
      if (this._needleVal !== prev && this.onNeedleMove) this.onNeedleMove()
    }
    const inBlockedRect = (x, y) => {
      const rects = this._getBlockedRects ? this._getBlockedRects() : []
      return rects.some(r => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
    }

    const onStart = (e) => {
      const pt = e.touches ? e.touches[0] : e
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
        setFromX(x)
      }
    }
    const onMove = (e) => {
      if (!this._dragging) return
      e.preventDefault()
      const pt = e.touches ? e.touches[0] : e
      setFromX(toXY(pt).x)
    }
    const onEnd = () => { this._dragging = false }

    canvas.addEventListener('touchstart', onStart, { passive: true })
    canvas.addEventListener('touchmove',  onMove,  { passive: false })
    canvas.addEventListener('touchend',   onEnd)
    canvas.addEventListener('mousedown',  onStart)
    canvas.addEventListener('mousemove',  onMove)
    canvas.addEventListener('mouseup',    onEnd)
    this._handlers = { onStart, onMove, onEnd }
  }

  detach() {
    if (!this._canvas) return
    const { onStart, onMove, onEnd } = this._handlers
    this._canvas.removeEventListener('touchstart', onStart)
    this._canvas.removeEventListener('touchmove',  onMove)
    this._canvas.removeEventListener('touchend',   onEnd)
    this._canvas.removeEventListener('mousedown',  onStart)
    this._canvas.removeEventListener('mousemove',  onMove)
    this._canvas.removeEventListener('mouseup',    onEnd)
    this._canvas = null
    this._dragging = false
  }
}
