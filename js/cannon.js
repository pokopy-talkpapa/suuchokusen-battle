// js/cannon.js
import { dragToShot } from './physics.js'

export function clampDrag(dx, dy, CONFIG) {
  const { DRAG_MIN_PX, DRAG_MAX_PX } = CONFIG.CANNON
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < DRAG_MIN_PX) return null
  if (len > DRAG_MAX_PX) {
    const scale = DRAG_MAX_PX / len
    return { dx: dx * scale, dy: dy * scale }
  }
  return { dx, dy }
}

export class CannonInput {
  constructor() {
    this._startX = null
    this._startY = null
    this._curX   = null
    this._curY   = null
    this._canvas = null
    this._CONFIG = null
    this._handlers = {}
  }

  attach(canvas, CONFIG, onFire) {
    this._canvas = canvas
    this._CONFIG = CONFIG
    const cannonX = CONFIG.CANNON.X_FROM_LEFT

    const toCanvasCoord = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: (clientX - rect.left) * (canvas.width  / rect.width),
        y: (clientY - rect.top)  * (canvas.height / rect.height),
      }
    }

    const onStart = (e) => {
      const pt = e.touches ? e.touches[0] : e
      const { x, y } = toCanvasCoord(pt.clientX, pt.clientY)
      if (Math.abs(x - cannonX) < 100) {
        this._startX = x; this._startY = y
        this._curX   = x; this._curY   = y
      }
    }
    const onMove = (e) => {
      if (this._startX === null) return
      e.preventDefault()
      const pt = e.touches ? e.touches[0] : e
      const { x, y } = toCanvasCoord(pt.clientX, pt.clientY)
      this._curX = x; this._curY = y
    }
    const onEnd = () => {
      if (this._startX === null) return
      const dx = this._curX - this._startX
      const dy = this._curY - this._startY
      const clamped = clampDrag(dx, dy, CONFIG)
      if (clamped && onFire) {
        onFire(dragToShot(clamped.dx, clamped.dy, CONFIG))
      }
      this._startX = null; this._startY = null
      this._curX   = null; this._curY   = null
    }

    canvas.addEventListener('touchstart', onStart, { passive: true })
    canvas.addEventListener('touchmove',  onMove,  { passive: false })
    canvas.addEventListener('touchend',   onEnd)
    canvas.addEventListener('mousedown',  onStart)
    canvas.addEventListener('mousemove',  onMove)
    canvas.addEventListener('mouseup',    onEnd)

    this._handlers = { onStart, onMove, onEnd }
  }

  getPreview() {
    if (this._startX === null) return null
    const dx = this._curX - this._startX
    const dy = this._curY - this._startY
    const clamped = clampDrag(dx, dy, this._CONFIG)
    if (!clamped) return null
    const shot = dragToShot(clamped.dx, clamped.dy, this._CONFIG)
    return { dragDx: clamped.dx, dragDy: clamped.dy, ...shot }
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
  }
}
