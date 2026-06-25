// js/game.js
import { CONFIG } from './config.js'
import { valueToX, xToValue, getZoomRange } from './ruler.js'
import { calcLandingX, calcTrajectory } from './physics.js'
import { generateTarget, calcMeasurementError, judgeHit } from './measurement.js'
import { UnlockState } from './unlock.js'
import { Numpad } from './numpad.js'
import { CannonInput } from './cannon.js'
import { Renderer } from './renderer.js'

class Game {
  constructor() {
    this._canvas      = document.getElementById('game-canvas')
    this._renderer    = new Renderer()
    this._numpad      = new Numpad()
    this._cannonInput = new CannonInput()
    this._unlock      = UnlockState.load(CONFIG)

    // ゲームステート
    this._mode             = 'beginner'
    this._phase           = 'TITLE'
    this._zoomLevel       = 1
    this._zoomMin         = 0
    this._zoomMax         = 1000
    this._tickStep        = CONFIG.ZOOM.LEVEL1.tickStep
    this._targetValue     = 0
    this._measuredValue   = null
    this._measureError    = 0
    this._timerRemaining  = CONFIG.TIMER.MEASURE_SEC
    this._timerInterval   = null
    this._firedTrajectory = null
    this._landingX        = null
    this._hitResult       = null
  }

  async start() {
    await this._renderer.init(this._canvas, CONFIG)
    this._renderer.startLoop(() => this._buildState())
    this._canvas.addEventListener('click',    (e) => this._onTitleTap(e.offsetX), { once: true })
    this._canvas.addEventListener('touchend', (e) => { e.preventDefault()
      const r = this._canvas.getBoundingClientRect()
      this._onTitleTap((e.changedTouches[0].clientX - r.left) * (this._canvas.width / r.width))
    }, { once: true, passive: false })
  }

  _buildState() {
    const rulerY  = this._canvas.height - CONFIG.RULER.Y_FROM_BOTTOM
    const rsx     = CONFIG.RULER.MARGIN_X
    const rex     = this._canvas.width - CONFIG.RULER.MARGIN_X
    const enemyX  = valueToX(this._targetValue, this._zoomMin, this._zoomMax, rsx, rex)

    return {
      phase:           this._phase,
      zoomMin:         this._zoomMin,
      zoomMax:         this._zoomMax,
      tickStep:        this._tickStep,
      targetValue:     this._targetValue,
      enemyX,
      cannonPreview:   this._phase === 'AIM' ? this._cannonInput.getPreview() : null,
      firedTrajectory: this._firedTrajectory,
      landingX:        this._landingX,
      hitResult:       this._hitResult,
      timerRemaining:  this._timerRemaining,
      showShip:        this._phase === 'MEASURE' || this._phase === 'RESULT',
      fog:             (this._phase === 'AIM' || this._phase === 'FIRE') ? 1 : 0,
      mode:            this._mode,
      memo:            (CONFIG.MODES[this._mode].showMemo && this._measuredValue != null
                        && (this._phase === 'AIM' || this._phase === 'FIRE'))
                        ? String(this._measuredValue) : null,
    }
  }

  _onTitleTap(x) {
    if (this._phase !== 'TITLE') return
    this._mode = (x !== undefined && x > this._canvas.width / 2) ? 'expert' : 'beginner'
    this._startMeasure()
  }

  _startMeasure() {
    this._phase       = 'MEASURE'
    this._zoomLevel   = 1
    this._zoomMin     = 0
    this._zoomMax     = 1000
    this._tickStep    = CONFIG.ZOOM.LEVEL1.tickStep
    this._targetValue = generateTarget(
      CONFIG.RULER.MIN, CONFIG.RULER.MAX, CONFIG.ZOOM.LEVEL1.tickStep
    )
    this._measuredValue   = null
    this._measureError    = 0
    this._firedTrajectory = null
    this._landingX        = null
    this._hitResult       = null

    // ズームタップ登録（捕捉フェーズのみ有効）
    this._canvas.addEventListener('click',    this._handleZoomTap)
    this._canvas.addEventListener('touchend', this._handleZoomTap, { passive: false })

    // テンキー設定
    this._numpad.reset()
    this._numpad.show()
    this._numpad.onSubmit((val) => this._submitMeasure(val))

    // タイマー（上級者のみ）
    if (CONFIG.MODES[this._mode].measureTimer) {
      this._timerRemaining = CONFIG.TIMER.MEASURE_SEC
      this._timerInterval = setInterval(() => {
        this._timerRemaining = Math.max(0, this._timerRemaining - 1)
        if (this._timerRemaining === 0) this._submitMeasure(0)
      }, 1000)
    } else {
      this._timerRemaining = null
    }
  }

  _handleZoomTap = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'MEASURE') return
    if (this._zoomLevel >= this._unlock.maxLevel) return // 解放済み最大に達している

    const rect    = this._canvas.getBoundingClientRect()
    const clientX = e.touches ? e.changedTouches[0].clientX : e.clientX
    const x       = (clientX - rect.left) * (this._canvas.width / rect.width)
    const rsx     = CONFIG.RULER.MARGIN_X
    const rex     = this._canvas.width - CONFIG.RULER.MARGIN_X

    // 数直線帯の外タップは無視
    if (x < rsx || x > rex) return

    const ratio      = (x - rsx) / (rex - rsx)
    const tappedVal  = CONFIG.RULER.MIN + ratio * (CONFIG.RULER.MAX - CONFIG.RULER.MIN)

    this._zoomLevel++
    const zRange       = getZoomRange(this._zoomLevel, tappedVal, CONFIG)
    this._zoomMin      = zRange.min
    this._zoomMax      = zRange.max
    this._tickStep     = zRange.tickStep
  }

  _submitMeasure(val) {
    if (this._phase !== 'MEASURE') return
    clearInterval(this._timerInterval)
    this._canvas.removeEventListener('click',    this._handleZoomTap)
    this._canvas.removeEventListener('touchend', this._handleZoomTap)
    this._numpad.hide()
    this._measuredValue = val
    this._measureError  = calcMeasurementError(val, this._targetValue)
    this._startAim()
  }

  _startAim() {
    this._phase    = 'AIM'
    // 砲撃フェーズは全体表示に戻す
    this._zoomMin  = CONFIG.RULER.MIN
    this._zoomMax  = CONFIG.RULER.MAX
    this._tickStep = CONFIG.ZOOM.LEVEL1.tickStep

    this._cannonInput.attach(this._canvas, CONFIG, (shot) => this._fire(shot))
  }

  _fire(shot) {
    this._cannonInput.detach()
    this._phase = 'FIRE'

    const rulerY  = this._canvas.height - CONFIG.RULER.Y_FROM_BOTTOM
    const cannonY = rulerY + CONFIG.CANNON.Y_FROM_RULER
    const cannonX = CONFIG.CANNON.X_FROM_LEFT

    const idealX  = calcLandingX(cannonX, cannonY, shot.power, shot.angleRad,
                                  CONFIG.PHYSICS.GRAVITY, rulerY)
    this._firedTrajectory = calcTrajectory(
      cannonX, cannonY, shot.power, shot.angleRad, CONFIG.PHYSICS.GRAVITY
    )
    this._landingX = idealX !== null ? idealX : (cannonX + 200)

    setTimeout(() => this._showResult(), 600)
  }

  _showResult() {
    this._phase = 'RESULT'
    const rsx = CONFIG.RULER.MARGIN_X
    const rex = this._canvas.width - CONFIG.RULER.MARGIN_X
    const landingValue = xToValue(this._landingX, CONFIG.RULER.MIN, CONFIG.RULER.MAX, rsx, rex)
    const isHit = judgeHit(landingValue, this._targetValue, CONFIG.UNLOCK.HIT_MARGIN_VALUE)

    this._hitResult = isHit ? 'HIT' : 'MISS'
    this._unlock.recordHit(isHit)
    this._unlock.save()

    setTimeout(() => this._startMeasure(), 1800)
  }
}

const game = new Game()
game.start()
