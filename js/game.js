// js/game.js
import { CONFIG } from './config.js'
import { valueToX, getMeasureWindow } from './ruler.js'
import { arcPoints } from './physics.js'
import { generateTargetInsideWindow, judgeHit } from './measurement.js'
import { UnlockState } from './unlock.js'
import { Numpad } from './numpad.js'
import { AimInput } from './aim.js'
import { isTapOnRect } from './tap.js'
import { Renderer } from './renderer.js'
import { currentStage, stageIndexFromMaxLevel, rankInfo } from './stage.js'
import { calcShotScore, ScoreState } from './score.js'
import { AudioManager } from './audio.js'

class Game {
  constructor() {
    this._canvas   = document.getElementById('game-canvas')
    this._renderer = new Renderer()
    this._numpad   = new Numpad()
    this._aimInput = new AimInput()
    this._unlock   = UnlockState.load(CONFIG)
    this._score    = ScoreState.load(CONFIG.SCORE)
    this._audio    = AudioManager.load()
    this._numpad.onPress(() => this._audio.play('tap'))

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
    this._resultDur       = 1800  // 今回のRESULT表示時間（ランクアップ時は延長）
    this._pressPoint      = null
    this._lastShotScore   = null
    this._setFinished     = false
    this._newBest         = false
    this._rankUp          = false
    this._rankUpName      = null
    this._resetConfirm    = false
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

  _recordPress = (e) => {
    this._pressPoint = this._eventXY(e)
    this._audio.unlock() // iOSは最初のユーザー操作まで音を出せない
  }

  async start() {
    await this._renderer.init(this._canvas, CONFIG)
    this._renderer.startLoop(() => this._buildState())
    // 「押した場所」を常に記録（ボタンは押した点と離した点が同じボタン内のときだけ反応させる）
    this._canvas.addEventListener('touchstart', this._recordPress, { passive: true })
    this._canvas.addEventListener('mousedown',  this._recordPress)
    this._addTitleListeners()
  }

  _addTitleListeners() {
    this._canvas.addEventListener('click',    this._handleTitleTap)
    this._canvas.addEventListener('touchend', this._handleTitleTap, { passive: false })
  }

  _removeTitleListeners() {
    this._canvas.removeEventListener('click',    this._handleTitleTap)
    this._canvas.removeEventListener('touchend', this._handleTitleTap)
  }

  // タイトルのタップ：ランクリセット（2回押しで確定）／音ON/OFF／左右でモード選択
  _handleTitleTap = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'TITLE') return
    const p = this._eventXY(e)
    if (this._handleSoundButtons(p)) return
    if (isTapOnRect(this._pressPoint, p, this._resetButtonRect())) {
      this._audio.play('tap')
      if (this._resetConfirm) {
        this._unlock = new UnlockState(CONFIG) // ランクと連続命中を最初に戻す（じこベストは残す）
        this._unlock.save()
        this._resetConfirm = false
      } else {
        this._resetConfirm = true
      }
      return
    }
    this._resetConfirm = false
    this._mode = p.x > this._canvas.width / 2 ? 'expert' : 'beginner'
    this._audio.play('tap')
    this._removeTitleListeners()
    this._startMeasure()
  }

  _resetButtonRect() { return { x: 14, y: this._canvas.height - 58, w: 210, h: 44 } }

  // 音ON/OFFボタン（右下・TITLEとMEASUREに表示）。矩形は renderer と共有＝単一の真実。
  _soundButtonRects() {
    const cv = this._canvas
    const bgm = { x: cv.width - 14 - 110, y: cv.height - 58, w: 110, h: 44 }
    const sfx = { x: bgm.x - 10 - 110,    y: cv.height - 58, w: 110, h: 44 }
    return { sfx, bgm }
  }

  // 音ボタンのタップ判定（TITLEのみ）。押していたら true を返す。
  _handleSoundButtons(p) {
    const b = this._soundButtonRects()
    if (isTapOnRect(this._pressPoint, p, b.sfx)) {
      this._audio.toggleSfx()
      this._audio.play('tap') // ONにした直後の確認音（OFFなら鳴らない）
      return true
    }
    if (isTapOnRect(this._pressPoint, p, b.bgm)) {
      this._audio.toggleBgm() // OFFは toggleBgm 内で停止。ONは次のプレイ開始から鳴る
      return true
    }
    return false
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
    // FIRE/RESULT は「答え合わせ」＝全体スケール（0〜1000）で見せる。
    // 測量窓のままだと着弾X（全体スケール）と目盛りが食い違い、正しく撃っても見た目がズレる。
    const fullView = this._phase === 'FIRE' || this._phase === 'RESULT'
    const vMin  = fullView ? CONFIG.RULER.MIN : this._zoomMin
    const vMax  = fullView ? CONFIG.RULER.MAX : this._zoomMax
    const vTick = fullView ? 100 : this._tickStep
    const enemyX = valueToX(this._targetValue, vMin, vMax, rsx, rex)

    const panelGeom = this._panelGeom()
    const aimState  = (this._phase === 'AIM') ? this._aimInput.getState() : null

    return {
      phase:          this._phase,
      zoomMin:        vMin,
      zoomMax:        vMax,
      tickStep:       vTick,
      targetValue:    this._targetValue,
      enemyX,
      stageIndex:     this._stageIndex,
      stageName:      this._stage.name,
      // 測量は窓の中、FIRE/RESULT は着弾シーン（同じ構図）で正解位置に船を出す。
      showShip:       this._phase === 'MEASURE' || this._phase === 'FIRE' || this._phase === 'RESULT',
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
                        ? Math.min(1, (performance.now() - this._resultStart) / this._resultDur) : null,
      // ランク（両モード共通・連続命中で進む）とスコア
      rank:           rankInfo(this._unlock.maxLevel, this._unlock.streak, CONFIG),
      score: {
        last:        this._lastShotScore,
        shotCount:   this._score.shotCount(),
        setSize:     CONFIG.SCORE.SET_SIZE,
        setTotal:    this._score.setTotal(),
        best:        this._score.best,
        setFinished: this._setFinished,
        newBest:     this._newBest,
      },
      rankUp:         this._rankUp,
      rankUpName:     this._rankUpName,
      timerRemaining:  this._timerRemaining,
      // FIRE/RESULT はタップを受けるリスナーが無い（自動で次へ進む）ので、押せないボタンは描かない
      backButtonRect:  (this._phase === 'MEASURE' || this._phase === 'AIM') ? this._backButtonRect() : null,
      resetButton:     this._phase === 'TITLE'
                         ? { rect: this._resetButtonRect(), confirm: this._resetConfirm } : null,
      // 音ボタンはTITLEのみ（MEASUREは右下にテンキーDOMが重なる）。プレイ中の消音は「もどる」経由。
      soundButtons:    this._phase === 'TITLE'
                         ? { rects: this._soundButtonRects(),
                             sfxOn: this._audio.sfxOn, bgmOn: this._audio.bgmOn } : null,
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

  _startMeasure() {
    this._phase = 'MEASURE'
    this._audio.startBgm() // 既に鳴っていれば何もしない（タイトル復帰後の再開も兼ねる）
    // 段階＝連続命中ランク（両モード共通）。モードは「入力のしかた」だけの違い。
    this._stageIndex = stageIndexFromMaxLevel(this._unlock.maxLevel, CONFIG)
    this._stage      = currentStage(this._unlock.maxLevel, CONFIG)

    // 前のセットが満了していたら新しいセットを始める
    if (this._score.isSetFinished()) this._score.startNewSet()
    this._lastShotScore = null
    this._setFinished   = false
    this._newBest       = false
    this._rankUp        = false
    this._rankUpName    = null

    // 正解は端(0/1000)にも測量窓の端にも乗せない（船が島や枠に重なるため）
    const windowSpan = this._stage.measureMode === 'hundred' ? 100
                     : this._stage.measureMode === 'ten'     ? 10
                     : null
    this._targetValue = generateTargetInsideWindow(
      CONFIG.RULER.MIN, CONFIG.RULER.MAX, this._stage.targetStep, windowSpan)
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
    if (isTapOnRect(this._pressPoint, p, this._backButtonRect())) { this._audio.play('tap'); this._goToTitle(); return }
    if (CONFIG.MODES[this._mode].showNumpad) return // 初級はテンキーで進む
    this._audio.play('tap')
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
    // 針ドラッグの手応え音（AudioManager 側で間引く）
    this._aimInput.onNeedleMove = () => this._audio.playNeedle()
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

    if (isTapOnRect(this._pressPoint, p, this._backButtonRect())) { this._audio.play('tap'); this._goToTitle(); return }
    const b = this._buttonRects()
    if (b.fire && isTapOnRect(this._pressPoint, p, b.fire)) { this._fireFromButton(); return }
    if (b.zoom && isTapOnRect(this._pressPoint, p, b.zoom)) { this._audio.play('tap'); this._aimInput.toggleZoom(); return }
  }

  _fireFromButton() {
    const st = this._aimInput.getState()
    this._fire(st.needleValue)
  }

  _backButtonRect() { return { x: 14, y: 14, w: 88, h: 44 } }

  _goToTitle() {
    this._audio.stopBgm() // タイトルは無音（教室で置いておける）
    clearInterval(this._timerInterval)
    this._canvas.removeEventListener('click',    this._handleMeasureTap)
    this._canvas.removeEventListener('touchend', this._handleMeasureTap)
    this._canvas.removeEventListener('click',    this._handleAimButtons)
    this._canvas.removeEventListener('touchend', this._handleAimButtons)
    this._aimInput.detach()
    this._numpad.hide()
    this._phase = 'TITLE'
    this._resetConfirm = false
    this._addTitleListeners()
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
    this._audio.play('fire')
    this._audio.play('whistle', 0.1) // 発射音の直後から飛翔ヒュー（着弾700msに合わせた長さ）

    // FIRE は RESULT と同じ着弾シーン構図（数直線=高さ35%・島の大砲から水平線へ撃つ）。
    // 発射→着弾で画面が切り替わる違和感をなくすため、最初から答え合わせの画面で飛ばす。
    const cv  = this._canvas
    const rsx = CONFIG.RULER.MARGIN_X
    const rex = cv.width - CONFIG.RULER.MARGIN_X
    // 砲口＝island-cutout の絵の中の大砲の先端（島は幅16%・大砲が rulerY 付近に来る配置）
    const rulerY  = Math.round(cv.height * 0.35)
    const cannonX = Math.round(cv.width * 0.144)
    const cannonY = Math.round(rulerY + cv.width * 0.021)
    const waterY  = Math.round(cv.height * 0.55) // 船が浮く水平線

    // 着水点＝置いた値そのもの（ブレなし）。全体スケール 0〜1000 で x に変換。
    this._landingValue = value
    this._landingX = valueToX(value, CONFIG.RULER.MIN, CONFIG.RULER.MAX, rsx, rex)
    this._firedArc = arcPoints(cannonX, cannonY, this._landingX, waterY, 36, 140)

    this._fireStart = performance.now()
    setTimeout(() => this._showResult(), this._fireDuration)
  }

  _showResult() {
    this._phase = 'RESULT'
    const isHit = judgeHit(this._landingValue, this._targetValue, this._stage.hitMargin)
    this._hitResult = isHit ? 'HIT' : 'MISS'

    // ランクアップ判定（recordHit 前後の maxLevel 比較）
    const prevMax = this._unlock.maxLevel
    this._unlock.recordHit(isHit)
    this._unlock.save()
    this._rankUp = this._unlock.maxLevel > prevMax
    this._rankUpName = this._rankUp ? currentStage(this._unlock.maxLevel, CONFIG).name : null

    // スコア（誤差→点数・SET_SIZE発で1セット・自己ベスト永続化）
    this._lastShotScore = calcShotScore(this._landingValue, this._targetValue, this._stage.hitMargin, CONFIG.SCORE)
    const r = this._score.addShot(this._lastShotScore)
    this._setFinished = r.finished
    this._newBest     = r.isNewBest
    this._score.save()

    // 着弾音→（あれば）ランクアップのファンファーレ→セット完了ジングルの順で重ねる
    this._audio.play(isHit ? 'hit' : 'miss')
    if (this._rankUp) this._audio.play('rankup', 0.9)
    if (this._setFinished) this._audio.play('setend', this._rankUp ? 1.7 : 0.9)

    this._fireStart   = null
    this._resultStart = performance.now()
    // ランクアップやセット満了はじっくり見せる
    this._resultDur = (this._rankUp || this._setFinished) ? 3000 : this._resultDuration
    setTimeout(() => this._startMeasure(), this._resultDur)
  }
}

const game = new Game()
game.start()
window.__game = game // デバッグ・自動テスト用（描画や判定には不使用）
