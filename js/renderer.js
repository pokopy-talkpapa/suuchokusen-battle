// js/renderer.js
import { valueToX, getTicks } from './ruler.js'
import { calcTrajectory } from './physics.js'

const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg']

export class Renderer {
  constructor() {
    this._canvas = null
    this._ctx    = null
    this._CONFIG = null
    this._imgs   = {}
    this._rafId  = null
  }

  async init(canvas, CONFIG) {
    this._canvas = canvas
    this._ctx    = canvas.getContext('2d')
    this._CONFIG = CONFIG
    this._resize()
    window.addEventListener('resize', () => this._resize())

    // PNG が未用意でもゲームは動く（Canvas 図形でフォールバック）
    await Promise.allSettled(
      ASSET_NAMES.map(name => new Promise((resolve) => {
        const img = new Image()
        img.onload  = () => { this._imgs[name] = img; resolve() }
        img.onerror = resolve
        img.src = `assets/${name}.png`
      }))
    )
  }

  _resize() {
    this._canvas.width  = this._canvas.offsetWidth
    this._canvas.height = this._canvas.offsetHeight
  }

  _rulerY()  { return this._canvas.height - this._CONFIG.RULER.Y_FROM_BOTTOM }
  _rulerSX() { return this._CONFIG.RULER.MARGIN_X }
  _rulerEX() { return this._canvas.width - this._CONFIG.RULER.MARGIN_X }

  drawFrame(state) {
    const { _ctx: ctx, _canvas: cv, _CONFIG: CFG } = this
    const rulerY = this._rulerY()
    const rsx    = this._rulerSX()
    const rex    = this._rulerEX()
    const rulerH = CFG.RULER.HEIGHT
    const cannonX = CFG.CANNON.X_FROM_LEFT
    const cannonY = rulerY + CFG.CANNON.Y_FROM_RULER

    ctx.clearRect(0, 0, cv.width, cv.height)

    // 背景
    if (this._imgs['sea-bg']) {
      ctx.drawImage(this._imgs['sea-bg'], 0, 0, cv.width, cv.height)
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, cv.height)
      grad.addColorStop(0, '#87ceeb')
      grad.addColorStop(0.55, '#1a6fa8')
      grad.addColorStop(1, '#0d4f7a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, cv.width, cv.height)
    }

    // タイトル画面
    if (state.phase === 'TITLE') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.font = 'bold 48px sans-serif'
      ctx.fillStyle = '#ffdd00'
      ctx.textAlign = 'center'
      ctx.fillText('めざせ！すうちょくせんマスター', cv.width / 2, cv.height / 2 - 20)
      ctx.font = '28px sans-serif'
      ctx.fillStyle = '#fff'
      ctx.fillText('タップしてスタート', cv.width / 2, cv.height / 2 + 40)
      return
    }

    // 数直線帯
    if (this._imgs['ruler-bg']) {
      ctx.drawImage(this._imgs['ruler-bg'], rsx - 10, rulerY - rulerH / 2, rex - rsx + 20, rulerH)
    } else {
      ctx.fillStyle = '#d4a96a'
      ctx.fillRect(rsx - 10, rulerY - rulerH / 2, rex - rsx + 20, rulerH)
      ctx.strokeStyle = '#8b5e2a'
      ctx.lineWidth = 2
      ctx.strokeRect(rsx - 10, rulerY - rulerH / 2, rex - rsx + 20, rulerH)
    }

    // 目盛り
    const ticks = getTicks(state.zoomMin, state.zoomMax, state.tickStep)
    ctx.strokeStyle = '#5a3a10'
    ctx.fillStyle   = '#2a1a00'
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'center'
    ticks.forEach(({ value, isMajor }) => {
      const x   = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
      const tH  = isMajor ? 20 : 10
      ctx.lineWidth = isMajor ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(x, rulerY - tH / 2)
      ctx.lineTo(x, rulerY + tH / 2)
      ctx.stroke()
      if (isMajor) ctx.fillText(String(value), x, rulerY - tH / 2 - 4)
    })

    // 敵船
    const shipW = CFG.ENEMY.SHIP_WIDTH
    const shipH = CFG.ENEMY.SHIP_HEIGHT
    if (this._imgs['ship-enemy']) {
      ctx.drawImage(this._imgs['ship-enemy'],
        state.enemyX - shipW / 2, rulerY - rulerH / 2 - shipH, shipW, shipH)
    } else {
      ctx.fillStyle = '#8b0000'
      ctx.fillRect(state.enemyX - shipW / 2, rulerY - rulerH / 2 - shipH, shipW, shipH)
      ctx.fillStyle = '#ff4444'
      ctx.fillText('🚢', state.enemyX, rulerY - rulerH / 2 - 20)
    }

    // 大砲
    if (this._imgs['cannon']) {
      ctx.drawImage(this._imgs['cannon'], cannonX - 40, cannonY - 30, 80, 60)
    } else {
      ctx.fillStyle = '#4a3000'
      ctx.beginPath()
      ctx.arc(cannonX, cannonY, 24, 0, Math.PI * 2)
      ctx.fill()
    }
    // ドラッグ中：砲身の向きを線で表示
    if (state.cannonPreview) {
      const ang = state.cannonPreview.angleRad
      ctx.strokeStyle = '#ffaa00'
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.moveTo(cannonX, cannonY)
      ctx.lineTo(cannonX + Math.cos(ang) * 60, cannonY - Math.sin(ang) * 60)
      ctx.stroke()
    }

    // 着弾予測点（AIM フェーズ）
    if (state.phase === 'AIM' && state.cannonPreview) {
      const { power, angleRad } = state.cannonPreview
      const traj = calcTrajectory(cannonX, cannonY, power, angleRad, CFG.PHYSICS.GRAVITY)
      const last = traj[traj.length - 1]
      ctx.globalAlpha = CFG.PHYSICS.PREVIEW_ALPHA
      ctx.fillStyle = '#ff6600'
      ctx.beginPath()
      ctx.arc(last.x, rulerY, CFG.PHYSICS.PREVIEW_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // 砲弾軌跡（FIRE フェーズ）
    if (state.firedTrajectory) {
      ctx.strokeStyle = '#ffaa00'
      ctx.lineWidth = 3
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      state.firedTrajectory.forEach((pt, i) => {
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)
      })
      ctx.stroke()
      ctx.setLineDash([])
    }

    // 着弾エフェクト（RESULT）
    if (state.phase === 'RESULT' && state.landingX !== null) {
      if (this._imgs['splash']) {
        ctx.drawImage(this._imgs['splash'], state.landingX - 30, rulerY - 60, 60, 60)
      } else {
        ctx.fillStyle = state.hitResult === 'HIT' ? '#ffdd00' : '#4488ff'
        ctx.beginPath()
        ctx.arc(state.landingX, rulerY, 22, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.font = 'bold 52px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = state.hitResult === 'HIT' ? '#ffdd00' : '#ffffff'
      ctx.fillText(
        state.hitResult === 'HIT' ? '命中！🎯' : 'はずれ💦',
        cv.width / 2, cv.height / 2 - 20
      )
    }

    // タイマー（MEASURE フェーズ）
    if (state.phase === 'MEASURE') {
      ctx.font = 'bold 28px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = state.timerRemaining <= 5 ? '#ff4444' : '#ffffff'
      ctx.fillText(`⏱ ${state.timerRemaining}`, cv.width - 20, 44)
    }
  }

  startLoop(getState) {
    const loop = () => {
      this.drawFrame(getState())
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  stopLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
  }
}
