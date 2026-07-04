// js/game.js
import { CONFIG } from './config.js'
import { valueToX, getMeasureWindow } from './ruler.js'
import { arcPoints } from './physics.js'
import { generateTarget, judgeHit } from './measurement.js'
import { UnlockState } from './unlock.js'
import { Numpad } from './numpad.js'
import { AimInput } from './aim.js'
import { isTapOnRect } from './tap.js'
import { Renderer } from './renderer.js'
import { currentStage, stageIndexFromMaxLevel } from './stage.js'

class Game {
  constructor() {
    this._canvas   = document.getElementById('game-canvas')
    this._renderer = new Renderer()
    this._numpad   = new Numpad()
    this._aimInput = new AimInput()
    this._unlock   = UnlockState.load(CONFIG)

    this._mode            = 'beginner'
    this._phase           = 'TITLE'
    this._stage           = CONFIG.STAGES[0]
    this._stageIndex      = 0
    this._zoomMin         = 0
    this._zoomMax         = 1000
    this._tickStep        = 100
    this._targetValue     = 0
    this._measuredValue   = null
    this._timerRemaining  = null
    this._timerInterval   = null
    this._firedArc        = null
    this._landingX        = null
    this._landingValue    = null
    this._hitResult       = null
    this._fireStart       = null
    this._fireDuration    = 700
    this._resultStart     = null
    this._resultDuration  = 1800
    this._pressPoint      = null
  }

  // イベントからキャンバス座標を得る（touchstart/touchend/mouse すべて対応）
  _eventXY(e) {
    const rect = this._canvas.getBoundingClientRect()
    const pt = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e
    return {
      x: (pt.clientX - rect.left) * (this._canvas.width  / rect.width),
      y: (pt.clientY - rect.top)  * (this._canvas.height / rect.height),
    }
  }

  _recordPress = (e) => { this._pressPoint = this._eventXY(e) }

  async start() {
    await this._renderer.init(this._canvas, CONFIG)
    this._renderer.startLoop(() => this._buildState())
    // 「押した場所」を常に記録（ボタンは押した点と離した点が同じボタン内のときだけ反応させる）
    this._canvas.addEventListener('touchstart', this._recordPress, { passive: true })
    this._canvas.addEventListener('mousedown',  this._recordPress)
    this._canvas.addEventListener('click',    (e) => this._onTitleTap(e.offsetX), { once: true })
    this._canvas.addEventListener('touchend', (e) => { e.preventDefault()
      const r = this._canvas.getBoundingClientRect()
      this._onTitleTap((e.changedTouches[0].clientX - r.left) * (this._canvas.width / r.width))
    }, { once: true, passive: false })
  }

  _buildState() {
    // MEASURE フェーズは大砲の先端（画面幅15%）から数直線を始める。他は通常マージン。
    const rsx = this._phase === 'MEASURE'
      ? Math.round(this._canvas.width * 0.155)
      : CONFIG.RULER.MARGIN_X
    // MEASURE：右端を双眼鏡フレームの内側（88%）に収める
    const rex = this._phase === 'MEASURE'
      ? Math.round(this._canvas.width * 0.88)
      : this._canvas.width - CONFIG.RULER.MARGIN_X
    const enemyX = valueToX(this._targetValue, this._zoomMin, this._zoomMax, rsx, rex)

    const panelGeom = this._panelGeom()
    const aimState  = (this._phase === 'AIM') ? this._aimInput.getState() : null

    return {
      phase:          this._phase,
      zoomMin:        this._zoomMin,
      zoomMax:        this._zoomMax,
      tickStep:       this._tickStep,
      targetValue:    this._targetValue,
      enemyX,
      stageIndex:     this._stageIndex,
      stageName:      this._stage.name,
      // 測量で船を見せるのは「窓の中だけ」。RESULT は横視点で正解位置に船を出す（リール無し＝次は別の的）。
      showShip:       this._phase === 'MEASURE' || this._phase === 'RESULT',
      // 敵船は showShip(MEASURE/RESULT のみ)で制御し、AIM/FIRE は一人称/横視点の背景が隠す。
      // 霧の白オーバーレイは背景アートを白く潰すため廃止。
      fog:            0,
      mode:           this._mode,
      aim:            aimState,
      panelGeom,
      buttonRects:    this._phase === 'AIM' ? this._buttonRects() : null, // ボタン矩形の単一の真実
      canZoom:        this._phase === 'AIM' && this._stage.aim.zoomable,
      memo:           (CONFIG.MODES[this._mode].showMemo && this._measuredValue != null
                       && this._phase === 'AIM') ? String(this._measuredValue) : null,
      firedArc:       this._firedArc,
      fireProgress:   (this._phase === 'FIRE' && this._fireStart != null)
                        ? Math.min(1, (performance.now() - this._fireStart) / this._fireDuration) : null,
      landingX:       this._landingX,
      hitResult:      this._hitResult,
      resultProgress: (this._phase === 'RESULT' && this._resultStart != null)
                        ? Math.min(1, (performance.now() - this._resultStart) / this._resultDuration) : null,
      timerRemaining:  this._timerRemaining,
      // FIRE/RESULT はタップを受けるリスナーが無い（自動で次へ進む）ので、押せないボタンは描かない
      backButtonRect:  (this._phase === 'MEASURE' || this._phase === 'AIM') ? this._backButtonRect() : null,
      rulerGeom:       { rsx, rex },
    }
  }

  // 照準パネルの数直線ジオメトリ（renderer と AimInput で共有）
  _panelGeom() {
    const sx = CONFIG.AIM_PANEL.MARGIN_X
    const ex = this._canvas.width - CONFIG.AIM_PANEL.MARGIN_X
    const y  = this._canvas.height - CONFIG.AIM_PANEL.Y_FROM_BOTTOM
    return { sx, ex, y }
  }

  _onTitleTap(x) {
    if (this._phase !== 'TITLE') return
    this._mode = (x !== undefined && x > this._canvas.width / 2) ? 'expert' : 'beginner'
    this._startMeasure()
  }

  _startMeasure() {
    this._phase = 'MEASURE'
    // 段階＝連続命中アンロック maxLevel に対応
    // 初心者モードは常にステージ0（序盤・小さい数字）に固定
    const effectiveMaxLevel = this._mode === 'beginner' ? 1 : this._unlock.maxLevel
    this._stageIndex = stageIndexFromMaxLevel(effectiveMaxLevel, CONFIG)
    this._stage      = currentStage(effectiveMaxLevel, CONFIG)

    this._targetValue = generateTarget(CONFIG.RULER.MIN, CONFIG.RULER.MAX, this._stage.targetStep)
    // 端でクランプ窓が潰れるのを避けたいだけなら target を内側へ寄せてもよいが、
    // getMeasureWindow が端クランプ済なので 0/1000 でも安全。
    const win = getMeasureWindow(this._targetValue, this._stage, CONFIG)
    this._zoomMin  = win.min
    this._zoomMax  = win.max
    this._tickStep = win.tickStep

    this._measuredValue = null
    this._firedArc      = null
    this._landingX      = null
    this._hitResult     = null
    this._fireStart     = null
    this._resultStart   = null

    // テンキー（初級のみ＝読んだ数を入力してメモにする）
    if (CONFIG.MODES[this._mode].showNumpad) {
      this._numpad.reset()
      this._numpad.show()
      this._numpad.onSubmit((val) => this._submitMeasure(val))
    } else {
      this._numpad.hide()
    }

    // 「読んで覚えたら そらをタップで射撃へ」（上級／初級は数字入力で進む）
    this._canvas.addEventListener('click',    this._handleMeasureTap)
    this._canvas.addEventListener('touchend', this._handleMeasureTap, { passive: false })

    // タイマー（上級のみ）：0で自動的に射撃へ
    if (CONFIG.MODES[this._mode].measureTimer) {
      this._timerRemaining = CONFIG.TIMER.MEASURE_SEC
      this._timerInterval = setInterval(() => {
        this._timerRemaining = Math.max(0, this._timerRemaining - 1)
        if (this._timerRemaining === 0) this._advanceFromMeasure()
      }, 1000)
    } else {
      this._timerRemaining = null
    }
  }

  // 測量中のタップ：上級は「読んだ→射撃へ」進む合図（初級はテンキーのOKで進むので無視）。
  // ※タップでズーム場所を選ぶ旧仕様は廃止（双眼鏡は船の周りを自動枠取り）。
  _handleMeasureTap = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'MEASURE') return
    const p = this._eventXY(e)
    if (isTapOnRect(this._pressPoint, p, this._backButtonRect())) { this._goToTitle(); return }
    if (CONFIG.MODES[this._mode].showNumpad) return // 初級はテンキーで進む
    this._advanceFromMeasure()
  }

  _advanceFromMeasure() {
    if (this._phase !== 'MEASURE') return
    clearInterval(this._timerInterval)
    this._canvas.removeEventListener('click',    this._handleMeasureTap)
    this._canvas.removeEventListener('touchend', this._handleMeasureTap)
    this._numpad.hide()
    this._measuredValue = null // 上級はメモ無し（記憶だけ）
    this._startAim()
  }

  _submitMeasure(val) {
    if (this._phase !== 'MEASURE') return
    clearInterval(this._timerInterval)
    this._canvas.removeEventListener('click',    this._handleMeasureTap)
    this._canvas.removeEventListener('touchend', this._handleMeasureTap)
    this._numpad.hide()
    this._measuredValue = val
    // ※測量誤差（calcMeasurementError）は判定に使わない＝spec §6。記録が要るまで呼ばない。
    this._startAim()
  }

  _startAim() {
    this._phase = 'AIM'
    this._aimInput.setStage(this._stage)
    // 発射はボタン（_handleAimButtons→_fireFromButton）で行う。AimInput はコールバックを取らない。
    // ジオメトリは getter 渡し（リサイズしても描画と入力がズレない）。
    // ボタンの上では針をつかませない（触れた瞬間に針が飛んで必ず外れるバグの根本対策）
    this._aimInput.attach(this._canvas, CONFIG, () => this._panelGeom(), () => {
      const b = this._buttonRects()
      return [this._backButtonRect(), b.fire, b.zoom]
    })
    // 発射ボタン／ズームボタンのタップを受ける（renderer がボタン矩形を描き、ここで当たり判定）
    this._canvas.addEventListener('click',    this._handleAimButtons)
    this._canvas.addEventListener('touchend', this._handleAimButtons, { passive: false })
  }

  // AIM 中のボタン当たり判定（発射・上級ズーム）。矩形は renderer と同じ計算式を使う。
  // ボタンは「押した点と離した点が同じボタン内」のときだけ反応。
  // ドラッグの指をボタンの上で離しただけで発射／タイトル戻りする誤動作を防ぐ。
  _handleAimButtons = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'AIM') return
    const p = this._eventXY(e)

    if (isTapOnRect(this._pressPoint, p, this._backButtonRect())) { this._goToTitle(); return }
    const b = this._buttonRects()
    if (b.fire && isTapOnRect(this._pressPoint, p, b.fire)) { this._fireFromButton(); return }
    if (b.zoom && isTapOnRect(this._pressPoint, p, b.zoom)) { this._aimInput.toggleZoom(); return }
  }

  _fireFromButton() {
    const st = this._aimInput.getState()
    this._fire(st.needleValue)
  }

  _backButtonRect() { return { x: 14, y: 14, w: 88, h: 44 } }

  _goToTitle() {
    clearInterval(this._timerInterval)
    this._canvas.removeEventListener('click',    this._handleMeasureTap)
    this._canvas.removeEventListener('touchend', this._handleMeasureTap)
    this._canvas.removeEventListener('click',    this._handleAimButtons)
    this._canvas.removeEventListener('touchend', this._handleAimButtons)
    this._aimInput.detach()
    this._numpad.hide()
    this._phase = 'TITLE'
    this._canvas.addEventListener('click',    (e) => this._onTitleTap(e.offsetX), { once: true })
    this._canvas.addEventListener('touchend', (e) => {
      e.preventDefault()
      const r = this._canvas.getBoundingClientRect()
      this._onTitleTap((e.changedTouches[0].clientX - r.left) * (this._canvas.width / r.width))
    }, { once: true, passive: false })
  }

  // 発射／ズームボタンの矩形（renderer.drawFrame と同じ式・単一の真実にするため共有計算）
  _buttonRects() {
    const cv = this._canvas
    const fire = { x: cv.width - 150, y: cv.height - 64, w: 130, h: 52 }
    const zoom = this._stage.aim.zoomable
      ? { x: 20, y: cv.height - 64, w: 130, h: 52 }
      : null
    return { fire, zoom }
  }

  _fire(value) {
    this._aimInput.detach()
    this._canvas.removeEventListener('click',    this._handleAimButtons)
    this._canvas.removeEventListener('touchend', this._handleAimButtons)
    this._phase = 'FIRE'

    const rsx = CONFIG.RULER.MARGIN_X
    const rex = this._canvas.width - CONFIG.RULER.MARGIN_X
    const rulerY  = this._canvas.height - CONFIG.RULER.Y_FROM_BOTTOM
    const cannonX = CONFIG.CANNON.X_FROM_LEFT
    const cannonY = rulerY + CONFIG.CANNON.Y_FROM_RULER

    // 着水点＝置いた値そのもの（ブレなし）。横視点 0〜1000 で x に変換。
    this._landingValue = value
    this._landingX = valueToX(value, CONFIG.RULER.MIN, CONFIG.RULER.MAX, rsx, rex)
    this._firedArc = arcPoints(cannonX, cannonY, this._landingX, rulerY, 36, 180)

    this._fireStart = performance.now()
    setTimeout(() => this._showResult(), this._fireDuration)
  }

  _showResult() {
    this._phase = 'RESULT'
    const isHit = judgeHit(this._landingValue, this._targetValue, this._stage.hitMargin)
    this._hitResult = isHit ? 'HIT' : 'MISS'
    this._unlock.recordHit(isHit)
    this._unlock.save()

    this._fireStart   = null
    this._resultStart = performance.now()
    setTimeout(() => this._startMeasure(), this._resultDuration)
  }
}

const game = new Game()
game.start()
window.__game = game // デバッグ・自動テスト用（描画や判定には不使用）
