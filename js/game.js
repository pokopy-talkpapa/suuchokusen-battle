// js/game.js
import { CONFIG, VERSION } from './config.js'
import { formatRulerValue, parseDisplayInput } from './display.js'
import { valueToX, xToValue, getMeasureWindow, zoomWindowAt } from './ruler.js'
import { arcPoints } from './physics.js'
import { generateTargetInsideWindow, judgeHit, measureAidLevel } from './measurement.js'
import { UnlockState } from './unlock.js'
import { Numpad } from './numpad.js'
import { AimInput } from './aim.js'
import { isTapOnRect } from './tap.js'
import { Renderer } from './renderer.js'
import { currentStage, stageIndexFromMaxLevel, rankInfo } from './stage.js'
import { calcShotScore, ScoreState } from './score.js'
import { AudioManager } from './audio.js'
import { Tutorial } from './tutorial.js'

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }

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
    this._tutorial = new Tutorial()
    this._tutorial.onClose(() => this._audio.play('tap'))
    // 卒業カードを閉じたらタイトルへ＝チュートリアル回は仕切り直して本番を最初から
    this._tutorial.onEndClose(() => { this._audio.play('tap'); this._goToTitle() })

    this._mode            = 'beginner'
    this._phase           = 'TITLE'
    this._stage           = CONFIG.STAGES[0]
    this._stageIndex      = 0
    this._zoomMin         = 0
    this._zoomMax         = 1000
    this._tickStep        = 100
    this._zoomAnim        = null // 部屋タップのズームイン/アウトを補間表示するための状態
    this._targetValue     = 0
    this._measureSpan     = null
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
    this._resultDur       = 1800  // RESULTの演出（撃沈アニメ等）の長さ。画面送りは「つぎへ」タップ待ち
    this._nextReadyAt     = 0     // 「つぎへ」ボタンが押せるようになる時刻（着弾直後の誤タップ防止）
    this._measureMiss     = 0     // このラウンドで測量の数字を外した回数（段階ヒントの判定に使う）
    this._aidPopAt        = 0     // ヒントが1段進んだ時刻（数字ポンの出現アニメ用）
    this._pressPoint      = null
    this._lastShotScore   = null
    this._setFinished     = false
    this._newBest         = false
    this._rankUp          = false
    this._rankUpName      = null
    this._resetConfirm    = false
    // 遊ぶランクの手動選択（タイトルのランクチップ）。null=解放済みのいちばん上で遊ぶ。
    // 解放済みなら下のランクへいつでも戻れる（苦手練習・難しかったら1個戻る）。
    this._playLevel       = this._loadPlayLevel()
    // 初回プレイの操作ガイド（実画面で「今ここを押す」を吹き出しで誘導）。
    // null=ガイドなし / 'measure'(めもりを読んで入力) / 'aim'(針を合わせる) / 'fire'(うつ！)
    this._guide           = null
    // ガイド付きで始めたラウンドか。この1発は練習＝ランク・スコアに記録しない。
    // 着弾を見せたら卒業カード（ズーム解放とおぼえてうつの予告）→タイトルへ戻して仕切り直す。
    this._guideRound      = false
  }

  // イベントからキャンバス座標を得る（touchstart/touchend/mouse すべて対応）
  _eventXY(e) {
    const rect = this._canvas.getBoundingClientRect()
    const pt = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || e
    return {
      x: (pt.clientX - rect.left) * (this._canvas.offsetWidth  / rect.width),
      y: (pt.clientY - rect.top)  * (this._canvas.offsetHeight / rect.height),
    }
  }

  _recordPress = (e) => {
    this._pressPoint = this._eventXY(e)
    this._audio.unlock() // iOSは最初のユーザー操作まで音を出せない
  }

  async start() {
    window.__gameBooted = true // ここまで来た＝JSは動く（index.htmlの起動見張りを解除）
    const bar     = document.getElementById('loading-bar')
    const overlay = document.getElementById('loading-overlay')
    await this._renderer.init(this._canvas, CONFIG, (done, total) => {
      if (bar) bar.style.width = `${Math.round(done / total * 100)}%`
    })
    if (overlay) overlay.classList.add('hidden')
    this._renderer.startLoop(() => this._buildState())
    // 「押した場所」を常に記録（ボタンは押した点と離した点が同じボタン内のときだけ反応させる）
    this._canvas.addEventListener('touchstart', this._recordPress, { passive: true })
    this._canvas.addEventListener('mousedown',  this._recordPress)
    this._addTitleListeners()
    this._tutorial.setOpenButtonVisible(true) // 起動時はTITLE表示中
    if (!this._tutorial.hasSeen()) this._tutorial.show()
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
        this._tutorial.resetRankUpSeen() // 最初からやり直す子にはランクアップ説明ももう一度見せる
        this._playLevel = null           // 遊ぶランクの選択もリセット
        this._savePlayLevel()
        this._resetConfirm = false
      } else {
        this._resetConfirm = true
      }
      return
    }
    this._resetConfirm = false
    // ランク選択チップ：解放済みのランクならタップでいつでも切り替え（🔒は無視）
    const chips = this._rankChipRects()
    for (let i = 0; i < chips.length; i++) {
      if (isTapOnRect(this._pressPoint, p, chips[i])) {
        if (this._unlock.isUnlocked(i + 1)) {
          this._playLevel = i + 1
          this._savePlayLevel()
          this._audio.play('tap')
        }
        return
      }
    }
    const mb = this._modeButtonRects()
    const mode = isTapOnRect(this._pressPoint, p, mb.beginner) ? 'beginner'
               : (isTapOnRect(this._pressPoint, p, mb.expert) && this._isExpertUnlocked()) ? 'expert'
               : null
    if (!mode) return // ボタン以外・未解放ボタンへのタップは無視（誤反応防止）
    this._mode = mode
    this._audio.play('tap')
    this._removeTitleListeners()
    this._startMeasure()
  }

  _resetButtonRect() { return this._titleLayout().resetRect }

  // おぼえてうつ解放条件＝でんせつランク（maxLevel 3）に到達済み（2026-07-05 ぽこぴぃ確定）
  _isExpertUnlocked() { return this._unlock.maxLevel >= 3 }

  // ── 遊ぶランクの選択（解放済みの範囲でいつでも上下できる） ──
  _loadPlayLevel() {
    try {
      const v = parseInt(localStorage.getItem('suuchokusen_play_level_v1'), 10)
      return (v >= 1 && v <= CONFIG.STAGES.length) ? v : null
    } catch { return null }
  }

  _savePlayLevel() {
    try {
      if (this._playLevel == null) localStorage.removeItem('suuchokusen_play_level_v1')
      else localStorage.setItem('suuchokusen_play_level_v1', String(this._playLevel))
    } catch { /* private modeなど失敗しても致命的ではない */ }
  }

  // 実際に遊ぶランク＝選択値を解放済みの範囲に丸める（未選択なら解放済みのいちばん上）
  _effectiveLevel() {
    const max = this._unlock.maxLevel
    return Math.max(1, Math.min(this._playLevel ?? max, max))
  }

  // タイトルのランク選択チップ3つの矩形（_titleLayout 参照・単一の真実）
  _rankChipRects() { return this._titleLayout().chips }

  // モード選択の2ボタン矩形（_titleLayout 参照・単一の真実）
  _modeButtonRects() { return this._titleLayout().modeBtns }

  // 音ON/OFFボタン（タイトル右下）。矩形は _titleLayout 参照・単一の真実。
  _soundButtonRects() { return this._titleLayout().soundRects }

  // ── タイトル画面の全要素の矩形とフォントを1箇所で計算する（単一の真実） ──
  // 全要素を上から順に積み上げるので、狭い高さでも重なりは構造的に起きない。
  // 高さ720pxを基準に s=0.55〜1 でスケールするが、フォントとタップ寸法には下限を設け、
  // どんな画面でも「読める・押せる」を下回らせない（v1.38の失敗＝一律s倍で縮めすぎ、の再発防止）。
  // 文字を入れる枠（チップ・下段ボタン）の幅は measureText で文字幅から導出する（固定幅にしない）。
  _titleLayout() {
    const cv = this._canvas, W = cv.offsetWidth, H = cv.offsetHeight
    const ctx = cv.getContext('2d')
    const s = Math.max(0.55, Math.min(1, H / 720))

    const fonts = {
      title:    Math.max(22, Math.round(42 * s)),
      btnTitle: Math.max(19, Math.round(32 * s)),
      btnSub:   Math.max(13, Math.round(18 * s)),
      chip:     Math.max(14, Math.round(17 * s)),
      best:     Math.max(14, Math.round(18 * s)),
      bottom:   Math.max(14, Math.round(17 * s)),
      version:  Math.max(11, Math.round(14 * s)),
    }

    // モードボタン：超横長で左右の端に散らばらないよう、中心からの距離に上限を設ける
    const bw = Math.min(280 * s, W * 0.38)
    const bh = Math.max(84, 124 * s)
    const half = Math.min(W * 0.23, 320)

    // ランクチップ：4つとも同幅（いちばん長いラベルに合わせる）。🔒表示のほうが長い場合も考慮
    // ☀️(U+2600+FE0F)はiOS Safariのcanvasで幅計算がずれて文字が右に流れる（2026-07-07実機FB）。
    // 修飾コードなしの1文字絵文字🌞に固定する。ここに新しい絵文字を足すときも1文字ものを選ぶこと
    const chipLabels       = ['🌞 みならい', '🌇 いっちょまえ', '🌙 でんせつ', '✨ まぼろし']
    const chipLockedLabels = ['🔒 みならい', '🔒 いっちょまえ', '🔒 でんせつ', '🔒 まぼろし']
    const chipCount = chipLabels.length
    ctx.font = `bold ${fonts.chip}px sans-serif`
    let chipTextW = 0
    for (const t of [...chipLabels, ...chipLockedLabels]) {
      chipTextW = Math.max(chipTextW, ctx.measureText(t).width)
    }
    const chipGap = Math.max(8, 12 * s)
    let chipW = Math.ceil(chipTextW) + 2 * Math.max(10, Math.round(14 * s))
    // 4つ横並びが画面幅に収まらないときはフォントごと縮めて収める
    const maxRow = W - 28
    if (chipW * chipCount + chipGap * (chipCount - 1) > maxRow) {
      const k = (maxRow - chipGap * (chipCount - 1)) / (chipW * chipCount)
      chipW = Math.floor(chipW * k)
      fonts.chip = Math.max(11, Math.floor(fonts.chip * k))
    }
    const chipH = Math.max(44, Math.round(46 * s)) // 44px＝最小タップサイズを下回らせない

    // 上から積み上げ（オフセット0の詰めた位置）。タイトルとボタンの間は初回ガイド吹き出しの分を確保
    const titleY  = fonts.title + Math.max(12, Math.round(20 * s))
    const btnTop  = titleY + Math.max(40, Math.round(92 * s))
    const chipY   = btnTop + bh + Math.max(12, Math.round(16 * s))
    const bestY   = chipY + chipH + Math.max(20, Math.round(26 * s))
    const contentBottom = bestY + 8

    // 下段バー（左=リセット／右=おと・きょく・バージョン）。高さ44px固定＝縮めない
    const m = 14 // セーフマージン：画面端で見切れさせない
    const bottomH = 44
    const bottomY = H - bottomH - m
    // 余裕がある画面では中身を下段との中間へ寄せる（背の高い画面で上端に張り付くのを防ぐ）
    const offset = Math.max(0, (bottomY - 10 - contentBottom) / 2)

    const cx1 = W / 2 - half, cx2 = W / 2 + half
    const modeBtns = {
      beginner: { x: cx1 - bw / 2, y: btnTop + offset, w: bw, h: bh },
      expert:   { x: cx2 - bw / 2, y: btnTop + offset, w: bw, h: bh },
    }
    const x0 = W / 2 - (chipW * chipCount + chipGap * (chipCount - 1)) / 2
    const chips = Array.from({ length: chipCount }, (_, i) => ({ x: x0 + i * (chipW + chipGap), y: chipY + offset, w: chipW, h: chipH }))

    // 下段の枠幅は入る文字（長いほうの表記）から導出
    ctx.font = `bold ${fonts.bottom}px sans-serif`
    const pad = 24
    const resetW = Math.ceil(Math.max(ctx.measureText('ランクを さいしょから').width,
                                      ctx.measureText('ほんとうに もどす？').width)) + pad
    const sfxW = Math.ceil(ctx.measureText('🔇 おと').width) + pad
    const bgmW = Math.ceil(ctx.measureText('🎵 きょく✕').width) + pad
    ctx.font = `${fonts.version}px sans-serif`
    const verW = Math.ceil(ctx.measureText(VERSION).width)

    const resetRect = { x: m, y: bottomY, w: resetW, h: bottomH }
    const bgmRect   = { x: W - m - verW - 8 - bgmW, y: bottomY, w: bgmW, h: bottomH }
    const sfxRect   = { x: bgmRect.x - 10 - sfxW,   y: bottomY, w: sfxW, h: bottomH }
    // バージョンは右下最小・きょくボタンの右横（ボタン側が場所を空ける＝重なりも見切れもしない）
    const versionPos = { x: W - m, y: bottomY + bottomH / 2 + fonts.version * 0.35 }

    return {
      s, fonts, chipLabels, chipLockedLabels,
      titleY: titleY + offset,
      modeBtns, chips,
      bestY: bestY + offset,
      resetRect, soundRects: { sfx: sfxRect, bgm: bgmRect }, versionPos,
    }
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
    // 海の構図（MEASURE/FIRE/RESULT）は大砲の先端（画面幅15.5%）から数直線を始める。
    // FIRE/RESULT も同じ起点にしないと、低い値の船・着弾が左端＝島の上に乗ってしまう。
    const seaView = this._phase === 'MEASURE' || this._phase === 'FIRE' || this._phase === 'RESULT'
    const rsx = seaView
      ? Math.round(this._canvas.offsetWidth * 0.155)
      : CONFIG.RULER.MARGIN_X
    const rex = seaView
      ? Math.round(this._canvas.offsetWidth * 0.88)
      : this._canvas.offsetWidth - CONFIG.RULER.MARGIN_X
    // FIRE/RESULT は「答え合わせ」＝全体スケール（0〜1000）で見せる。
    // 測量窓のままだと着弾X（全体スケール）と目盛りが食い違い、正しく撃っても見た目がズレる。
    const fullView = this._phase === 'FIRE' || this._phase === 'RESULT'
    // ズーム中（部屋タップ直後）は表示範囲を補間して「寄っていく/引いていく」感じを出す。
    // ロジック側（部屋の判定・ヒント）は this._zoomMin/_zoomMax（目標値）をそのまま使う。
    const zoomDisp = (!fullView && this._zoomAnim) ? this._displayedZoom() : null
    const vMin  = fullView ? CONFIG.RULER.MIN : (zoomDisp ? zoomDisp.min : this._zoomMin)
    const vMax  = fullView ? CONFIG.RULER.MAX : (zoomDisp ? zoomDisp.max : this._zoomMax)
    const vTick = fullView ? 100 : (zoomDisp ? this._tickStepForSpan(vMax - vMin) : this._tickStep)
    // ズーム中は端の数字を「補間した半端な数値」でなく、旧→新のクロスフェードで見せたい。
    // そのため旧値（fromMin/fromMax）と進行度（t）に加え、新値（＝目標値。this._zoomMin/_zoomMaxは
    // 補間されず常に確定値のまま）も渡す。表示用のvMin/vMaxは補間中の半端な数値なのでラベルには使わない。
    const zoomAnimT       = zoomDisp ? zoomDisp.t : null
    const zoomAnimFromMin = zoomDisp ? zoomDisp.fromMin : null
    const zoomAnimFromMax = zoomDisp ? zoomDisp.fromMax : null
    const zoomAnimToMin   = zoomDisp ? this._zoomMin : null
    const zoomAnimToMax   = zoomDisp ? this._zoomMax : null
    // 強調表示フェーズ中のみ非null。「ズーム前の見た目の中で、これから拡大する区間」を光らせるための値。
    const zoomHighlight    = zoomDisp ? zoomDisp.highlight : null
    const zoomHighlightMin = zoomHighlight ? zoomHighlight.min : null
    const zoomHighlightMax = zoomHighlight ? zoomHighlight.max : null
    const zoomHighlightP   = zoomHighlight ? zoomHighlight.p : null
    const enemyX = valueToX(this._targetValue, vMin, vMax, rsx, rex)

    const panelGeom = this._panelGeom()
    const aimState  = (this._phase === 'AIM') ? this._aimInput.getState() : null
    // タイトル画面の全矩形・フォントの単一の真実。1フレーム1回だけ計算して使い回す
    const titleLayout = this._phase === 'TITLE' ? this._titleLayout() : null

    return {
      phase:          this._phase,
      // ランクで時間帯が進む演出：みならい=昼 / いっちょまえ=夕方 / でんせつ=夜 / まぼろし=夜(仮・フェーズ3でミクロの海背景に差し替え)
      timeOfDay:      ['day', 'evening', 'night', 'night'][this._stageIndex] || 'day',
      zoomMin:        vMin,
      zoomMax:        vMax,
      tickStep:       vTick,
      targetValue:    this._targetValue,
      enemyX,
      stageIndex:     this._stageIndex,
      stageName:      this._stage.name,
      // 測量は「いま見えている範囲」に正解がある時だけ船を出す（違う部屋へズームしたら見えない）。
      // FIRE/RESULT は着弾シーン（全体スケール）で常に正解位置に船を出す。
      showShip:       this._phase === 'MEASURE'
                        ? (this._targetValue >= vMin && this._targetValue <= vMax)
                        : (this._phase === 'FIRE' || this._phase === 'RESULT'),
      // 進め方の文字案内は最小限に（文字より色・配置）。ズーム案内は操作を覚えるまでの
      // 最初の数回だけ、上級の「おぼえた！」はボタン自身が説明するので文字なし（2026-07-10）。
      measureHint:    this._phase === 'MEASURE'
                        ? (this._measureSpan && (this._zoomMax - this._zoomMin) > this._measureSpan
                            ? (this._zoomHintRounds <= CONFIG.HINT.ZOOM_ROUNDS
                                ? 'ふねの あたりを タップ！' : null)
                            : (CONFIG.MODES[this._mode].showNumpad && measureAidLevel(this._measureMiss) >= 1
                                ? 'はしっこを みてみよう' : null))
                        : null,
      // 測量ミスの段階ヒント（2回外し=両端強調／4回外し=端のひとつ前に数字）。renderer が描く
      measureAid:     (this._phase === 'MEASURE' && measureAidLevel(this._measureMiss) >= 1)
                        ? { level: measureAidLevel(this._measureMiss), popStart: this._aidPopAt }
                        : null,
      // 敵船は showShip(MEASURE/RESULT のみ)で制御し、AIM/FIRE は一人称/横視点の背景が隠す。
      // 霧の白オーバーレイは背景アートを白く潰すため廃止。
      fog:            0,
      mode:           this._mode,
      aim:            aimState,
      panelGeom,
      buttonRects:    this._phase === 'AIM' ? this._buttonRects() : null, // ボタン矩形の単一の真実
      canZoom:        this._phase === 'AIM' && this._stage.aim.zoomable,
      memo:           (CONFIG.MODES[this._mode].showMemo && this._measuredValue != null
                       && this._phase === 'AIM') ? formatRulerValue(this._measuredValue, this._stage) : null,
      firedArc:       this._firedArc,
      fireProgress:   (this._phase === 'FIRE' && this._fireStart != null)
                        ? Math.min(1, (performance.now() - this._fireStart) / this._fireDuration) : null,
      landingX:       this._landingX,
      hitResult:      this._hitResult,
      // ねらい（正解）と着弾のずれ量（value単位）。結果画面でミス時に「◯◯ ずれた」を出す
      resultGap:      (this._phase === 'RESULT' && this._landingValue != null)
                        ? Math.abs(this._landingValue - this._targetValue) : null,
      resultProgress: (this._phase === 'RESULT' && this._resultStart != null)
                        ? Math.min(1, (performance.now() - this._resultStart) / this._resultDur) : null,
      // ランク（両モード共通・連続命中で進む）とスコア
      rank:           rankInfo(this._unlock.maxLevel, this._unlock.streak, CONFIG),
      // 昇格カウントが動くのは最上位ランクで遊んでいる時だけ。下のランクでは星を薄く描く（①）
      rankProgressActive: (this._stageIndex + 1) === this._unlock.maxLevel,
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
      // FIRE はタップを受けるリスナーが無いので、押せないボタンは描かない
      backButtonRect:  (this._phase === 'MEASURE' || this._phase === 'AIM') ? this._backButtonRect() : null,
      // 結果画面の「つぎへ」（③・自動送り廃止）。着弾直後の誤タップを防ぐため少し待ってから出す
      nextButtonRect:  (this._phase === 'RESULT' && !this._guideRound
                        && performance.now() >= this._nextReadyAt) ? this._nextButtonRect() : null,
      // ズームしている最中だけ表示。どこをタップすれば戻れるか一目でわかるように専用ボタンを出す。
      zoomOutButtonRect: (this._phase === 'MEASURE' && this._canZoomOut()) ? this._zoomOutButtonRect() : null,
      // 上級の測量だけ右下に「おぼえた！」（そらタップ廃止・タイマー切れの自動進行は残る）
      memorizedButtonRect: (this._phase === 'MEASURE' && !CONFIG.MODES[this._mode].showNumpad)
                        ? this._memorizedButtonRect() : null,
      // 初回プレイの操作ガイド吹き出し（対象座標＋文言）。非ガイド時は null。
      guide:           this._guideCallout(),
      // タイトル画面の積み上げレイアウト（renderer はこれだけを見て描画・自前の再計算はしない）
      titleLayout,
      resetButton:     titleLayout
                         ? { rect: titleLayout.resetRect, confirm: this._resetConfirm } : null,
      // ランク選択チップ（タイトルのみ）：解放済みはタップで切替・未解放は🔒表示
      rankChips:       titleLayout
                         ? { rects: titleLayout.chips,
                             selected: this._effectiveLevel(),
                             maxLevel: this._unlock.maxLevel } : null,
      // おぼえてうつ（じかん制限で記憶して撃つ）は「よんでうつ」ででんせつランクに到達してから解放。
      // 読まずに記憶頼みで進めるのを防ぐため、まず読む力を一定水準まで育ててから開放する順にする。
      expertLocked:    !this._isExpertUnlocked(),
      // 音ボタンはTITLEのみ（MEASUREは右下にテンキーDOMが重なる）。プレイ中の消音は「もどる」経由。
      soundButtons:    titleLayout
                         ? { rects: titleLayout.soundRects,
                             sfxOn: this._audio.sfxOn, bgmOn: this._audio.bgmOn } : null,
      rulerGeom:       { rsx, rex },
      // ズーム遷移中のみ非null。端の数字クロスフェード＆数直線の強調演出に使う。
      zoomAnimT:       zoomAnimT,
      zoomAnimFromMin: zoomAnimFromMin,
      zoomAnimFromMax: zoomAnimFromMax,
      zoomAnimToMin:   zoomAnimToMin,
      zoomAnimToMax:   zoomAnimToMax,
      zoomHighlightMin: zoomHighlightMin,
      zoomHighlightMax: zoomHighlightMax,
      zoomHighlightP:   zoomHighlightP,
    }
  }

  // ズーム中の表示範囲を計算（easeOutCubicで補間）。完了したら _zoomAnim を消して以後は目標値をそのまま返す。
  // t・fromMin/fromMax も返す＝端の数字を「補間した半端な数値」でなく旧→新のクロスフェードで見せるため。
  // ズームインは「強調表示フェーズ→拡大フェーズ」の2段構成。強調表示中は数直線を動かさず、
  // タップした区間（toMin〜toMax）をズーム前の見た目（fromMin〜fromMax）の中で点滅させるだけにする
  // （例：0〜1000のうち800〜900だけが光る＝「ここが今から大きくなる」を先に見せてから広げる。2026-07-05実機FB）。
  _displayedZoom() {
    if (!this._zoomAnim) {
      return { min: this._zoomMin, max: this._zoomMax, t: null, fromMin: null, fromMax: null, highlight: null }
    }
    const a = this._zoomAnim
    const elapsed = performance.now() - a.start
    if (elapsed < a.highlightDuration) {
      const p = elapsed / a.highlightDuration
      return {
        min: a.fromMin, max: a.fromMax, t: 0, fromMin: a.fromMin, fromMax: a.fromMax,
        highlight: { min: a.toMin, max: a.toMax, p },
      }
    }
    const t = Math.min(1, (elapsed - a.highlightDuration) / a.zoomDuration)
    const e = easeOutCubic(t)
    // 端点lerpだと窓が横滑りして「横から拡大してくる」ように見えるため、
    // タップした区間がその場で左右の端へ広がる補間（zoomWindowAt）を使う
    const { min, max } = zoomWindowAt(a.fromMin, a.fromMax, a.toMin, a.toMax, e)
    if (t >= 1) this._zoomAnim = null
    return { min, max, t, fromMin: a.fromMin, fromMax: a.fromMax, highlight: null }
  }

  // ズームアニメ中の目盛り間隔＝いま見えている幅から動的に決める（1000幅に1目盛りだと目盛りが多すぎるため）
  _tickStepForSpan(span) {
    if (span > 100.5) return 100
    if (span > 10.5)  return 10
    return 1
  }

  // 部屋タップの結果（目標のズーム範囲）へ補間アニメーションを開始する。ズームイン/アウト共通。
  // ズームインだけ強調表示フェーズを挟む（ズームアウトは対象がすでに全画面なので強調の意味が薄い）。
  _animateZoomTo(min, max, tick) {
    const disp = this._displayedZoom()
    const isZoomIn = (max - min) < (disp.max - disp.min)
    this._zoomAnim = {
      fromMin: disp.min, fromMax: disp.max, toMin: min, toMax: max,
      start: performance.now(),
      highlightDuration: isZoomIn ? 500 : 0,
      zoomDuration: 400,
    }
    this._zoomMin  = min
    this._zoomMax  = max
    this._tickStep = tick
  }

  // 照準パネルの数直線ジオメトリ（renderer と AimInput で共有）
  // 初回プレイの操作ガイド：今やってほしい操作の場所へ吹き出しを出す。
  // 座標は renderer と同じ式で毎フレーム計算（リサイズしてもズレない）。
  _guideCallout() {
    const cv = this._canvas
    // タイトル画面：ようこそカードを閉じたら「よんでうつ」ボタンへ誘導
    if (this._phase === 'TITLE') {
      if (!this._tutorial.shouldGuide() || this._tutorial.isOpen()) return null
      const tl = this._titleLayout()
      const b = tl.modeBtns.beginner
      // 吹き出しも s でスケール：狭い高さでは間隔も縮むため、固定pxだとタイトルに食い込む
      return { x: b.x + b.w / 2, y: b.y + b.h / 2, ring: b, text: 'ここを タップで スタート！', scale: tl.s }
    }
    if (!this._guide) return null
    if (this._guide === 'measure' && this._phase === 'MEASURE') {
      const rulerY = Math.round(cv.offsetHeight * 0.35)
      const rsx = Math.round(cv.offsetWidth * 0.155)
      const rex = Math.round(cv.offsetWidth * 0.88)
      const x = valueToX(this._targetValue, this._zoomMin, this._zoomMax, rsx, rex)
      return { x, y: rulerY, ring: null,
               text: 'ふねの うえの めもりを よんで すうじを おそう！' }
    }
    if (this._phase === 'AIM') {
      const a = this._aimInput.getState()
      const g = this._panelGeom()
      if (this._guide === 'aim') {
        const nx = valueToX(a.needleValue, a.panelMin, a.panelMax, g.sx, g.ex)
        return { x: nx, y: g.y - CONFIG.AIM_PANEL.HEIGHT / 2, ring: null,
                 text: `あかい つまみを ${this._measuredValue} まで ドラッグ！` }
      }
      if (this._guide === 'fire') {
        const b = this._buttonRects().fire
        return { x: b.x + b.w / 2, y: b.y, ring: b, text: 'ぴったり！ うつ！ボタンで はっしゃ！' }
      }
    }
    return null
  }

  _panelGeom() {
    const sx = CONFIG.AIM_PANEL.MARGIN_X
    const ex = this._canvas.offsetWidth - CONFIG.AIM_PANEL.MARGIN_X
    const y  = this._canvas.offsetHeight - CONFIG.AIM_PANEL.Y_FROM_BOTTOM
    return { sx, ex, y }
  }

  _startMeasure() {
    this._phase = 'MEASURE'
    this._tutorial.setOpenButtonVisible(false)
    this._audio.startBgm() // 既に鳴っていれば何もしない（タイトル復帰後の再開も兼ねる）
    // 段階＝タイトルで選んだランク（未選択なら解放済みのいちばん上）。モードは「入力のしかた」だけの違い。
    const playLevel  = this._effectiveLevel()
    this._stageIndex = stageIndexFromMaxLevel(playLevel, CONFIG)
    this._stage      = currentStage(playLevel, CONFIG)

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
    this._measureSpan = windowSpan
    this._zoomAnim    = null // 前ラウンドのズームアニメが残っていたら消す
    if (windowSpan) {
      // 窓のある段階は全体0〜1000から始める。船のあたりをタップ→その「部屋」へズーム（A案・2026-07-05）。
      // 自動で船の周りを枠取りすると「全体のどのへんか」を考える工程が丸ごと飛ぶため。
      this._zoomMin  = CONFIG.RULER.MIN
      this._zoomMax  = CONFIG.RULER.MAX
      this._tickStep = 100
      this._zoomHintRounds = this._countZoomHintRound()
    } else {
      const win = getMeasureWindow(this._targetValue, this._stage, CONFIG)
      this._zoomMin  = win.min
      this._zoomMax  = win.max
      this._tickStep = win.tickStep
    }

    this._measuredValue = null
    this._firedArc      = null
    this._landingX      = null
    this._hitResult     = null
    this._fireStart     = null
    this._resultStart   = null
    this._measureMiss   = 0
    this._aidPopAt      = 0

    // テンキー（初級のみ＝読んだ数を入力してメモにする）
    if (CONFIG.MODES[this._mode].showNumpad) {
      this._numpad.reset()
      this._numpad.setDecimalMode(!!this._stage.display) // まぼろしだけ小数点キー
      this._numpad.show()
      this._numpad.onSubmit((str) => this._submitMeasure(parseDisplayInput(str, this._stage)))
    } else {
      this._numpad.hide()
    }

    // 初回プレイ（またはあそびかたボタンで再要求）の操作ガイドを開始。
    // ガイドは初級（テンキーあり）の流れ専用。初回は必ず初級＆みならいなのでこれで足りる。
    this._guide = (this._tutorial.shouldGuide() && CONFIG.MODES[this._mode].showNumpad) ? 'measure' : null
    this._guideRound = this._guide != null
    this._numpad.setHighlight(this._guide === 'measure')

    // 測量中のタップ受付（上級=「おぼえた！」ボタンで射撃へ／初級は数字入力で進む）
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

  // 測量中のタップ：
  // ①窓のある段階＝数直線の近くをタップ→その「部屋」へズーム（ズームインのみ）
  // ②専用「もどす」ボタン→ズームを1段階だけ手前に戻す（ズームインとジェスチャーを分けて戻り方を明確にする）
  // ③上級は右下の「おぼえた！」ボタン→射撃へ（初級はテンキーのOKで進む）
  _handleMeasureTap = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'MEASURE') return
    const p = this._eventXY(e)
    if (isTapOnRect(this._pressPoint, p, this._backButtonRect())) { this._audio.play('tap'); this._goToTitle(); return }
    if (this._canZoomOut() && isTapOnRect(this._pressPoint, p, this._zoomOutButtonRect())) {
      this._audio.play('tap'); this._zoomOutOneLevel(); return
    }
    // 上級の「射撃へ進む」は専用の「おぼえた！」ボタンだけ（2026-07-10実機FB）。
    // 旧「そらタップで進む」は①ズーム帯判定が広く実質そらが存在せず進めない
    // ②直せても数直線のすぐ上がそら＝指ズレで誤発射に進む事故が構造的に残る、の2重の理由で廃止。
    if (!CONFIG.MODES[this._mode].showNumpad
        && isTapOnRect(this._pressPoint, p, this._memorizedButtonRect())) {
      this._audio.play('tap')
      this._advanceFromMeasure()
      return
    }
    if (this._measureSpan && this._handleMeasureZoomTap(p)) return
  }

  // 窓のある段階を何回目に遊んでいるかを localStorage で数える（ズーム案内を最初の数回だけ出す用）。
  // 上限を超えたら書き込みを止める＝カウンタが際限なく増えない
  _countZoomHintRound() {
    let n = parseInt(localStorage.getItem('suuchokusen_zoom_hint_v1'), 10) || 0
    if (n <= CONFIG.HINT.ZOOM_ROUNDS) {
      n += 1
      localStorage.setItem('suuchokusen_zoom_hint_v1', String(n))
    }
    return n
  }

  // 「おぼえた！」ボタン（上級の測量のみ）。射撃の「うつ！」と同じ位置・同じ形＝迷わない
  _memorizedButtonRect() {
    const cv = this._canvas
    return { x: cv.offsetWidth - 150, y: cv.offsetHeight - 64, w: 130, h: 52 }
  }

  // ズームを1段階だけ手前に戻せる状態か（＝ズームしている最中かどうか）
  _canZoomOut() {
    return this._measureSpan != null && (this._zoomMax - this._zoomMin) < (CONFIG.RULER.MAX - CONFIG.RULER.MIN)
  }

  // 「もどす」ボタンの矩形（測量ヒントの下・中央）
  _zoomOutButtonRect() {
    const cv = this._canvas
    return { x: Math.round(cv.offsetWidth / 2 - 100), y: 54, w: 200, h: 40 }
  }

  // 段階ズームをひとつ手前へ戻す（10の部屋→100の部屋、100の部屋→全体）。
  // 専用ボタンから呼ぶ＝数直線タップ(ズームイン専用)とはジェスチャーを分ける。
  // 混ぜてしまうと「奥→1段戻す→また奥」の行き来しかできず全体表示に戻れなくなるため(2026-07-06に発覚)。
  _zoomOutOneLevel() {
    const width = this._zoomMax - this._zoomMin
    if (width < 100) {
      // 10の部屋→100の部屋へ（今いた場所を含む100の部屋を復元）
      const backSpan = 100
      const min = Math.floor(this._zoomMin / backSpan) * backSpan
      this._animateZoomTo(min, min + backSpan, 10)
    } else {
      // 100の部屋→全体へ
      this._animateZoomTo(CONFIG.RULER.MIN, CONFIG.RULER.MAX, 100)
    }
  }

  // 数直線から船の水面までの帯へのタップだけズーム扱い。処理したら true。ズームインのみ行う。
  // 帯の下端は±固定pxでなく船の水平線基準にする＝縦に広い画面（iPad）でも
  // 「ふねの あたりを タップ」の指示どおり船本体を叩いて反応する。
  // 段階ズーム：全体(1000)→100の部屋→(でんせつのみ)10の部屋。いちばん奥まで来ていたら何もしない
  // （戻るのは専用の「もどす」ボタンの役目）。
  _handleMeasureZoomTap(p) {
    const cv = this._canvas
    const rulerY = Math.round(cv.offsetHeight * 0.35) // 海の構図の数直線Y（renderer と同じ式）
    const waterY = Math.round(cv.offsetHeight * 0.55) // 船が浮く水平線（renderer と同じ式）
    if (p.y < rulerY - 120 || p.y > waterY + 90) return false
    this._audio.play('tap')
    const width = this._zoomMax - this._zoomMin
    if (width <= this._measureSpan) return true // いちばん奥＝これ以上は入れない
    const rsx = Math.round(cv.offsetWidth * 0.155)
    const rex = Math.round(cv.offsetWidth * 0.88)
    const x = Math.max(rsx, Math.min(rex, p.x))
    const v = xToValue(x, this._zoomMin, this._zoomMax, rsx, rex)
    // 1段深い部屋へ（段階の窓幅より深くは行かない）＝ズームイン
    const span = Math.max(width > 100 ? 100 : 10, this._measureSpan)
    let min = Math.floor(v / span) * span
    let max = min + span
    if (max > CONFIG.RULER.MAX) { max = CONFIG.RULER.MAX; min = max - span }
    if (min < CONFIG.RULER.MIN) { min = CONFIG.RULER.MIN; max = min + span }
    this._animateZoomTo(min, max, span === 100 ? 10 : 1)
    return true
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
    if (val == null) return // 打ちかけ・不正入力は無反応（空文字OKと同じ扱い）
    // 読まずに適当な数字を打っても通ってしまわないよう、実際にその位置にある正解と一致しない限り先へ進めない。
    // ズームで見えている範囲は必ず正解がぴったり目盛りに乗る深さなので、正しく読めていれば必ず一致するはず。
    if (val !== this._targetValue) {
      this._audio.play('miss')
      this._numpad.reset()
      this._numpad.flashWrong()
      // 段階ヒント（②）：外した回数を数え、ヒントが1段進んだ瞬間を記録（数字ポンの出現アニメ用）
      const before = measureAidLevel(this._measureMiss)
      this._measureMiss++
      if (measureAidLevel(this._measureMiss) > before) this._aidPopAt = performance.now()
      return
    }
    clearInterval(this._timerInterval)
    this._canvas.removeEventListener('click',    this._handleMeasureTap)
    this._canvas.removeEventListener('touchend', this._handleMeasureTap)
    this._numpad.hide()
    this._numpad.setHighlight(false)
    this._measuredValue = val
    if (this._guide) this._guide = 'aim' // ガイド次段：針を合わせる
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
    this._aimInput.onNeedleMove = () => {
      this._audio.playNeedle()
      // ガイド中：針が正解に十分近づいたら「うつ！」の案内へ（離れたら針合わせの案内に戻る）
      if (this._guide === 'aim' || this._guide === 'fire') {
        const near = Math.abs(this._aimInput.getState().needleValue - this._targetValue) <= this._stage.hitMargin
        this._guide = near ? 'fire' : 'aim'
      }
    }
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
    this._canvas.removeEventListener('click',    this._handleResultTap)
    this._canvas.removeEventListener('touchend', this._handleResultTap)
    this._aimInput.detach()
    this._numpad.hide()
    this._numpad.setHighlight(false)
    this._guide = null // 途中でやめたら次のプレイでまた最初からガイドする（markSeenしない）
    this._guideRound = false
    this._phase = 'TITLE'
    this._resetConfirm = false
    this._addTitleListeners()
    this._tutorial.setOpenButtonVisible(true)
  }

  // 発射／ズームボタンの矩形（renderer.drawFrame と同じ式・単一の真実にするため共有計算）
  _buttonRects() {
    const cv = this._canvas
    const fire = { x: cv.offsetWidth - 150, y: cv.offsetHeight - 64, w: 130, h: 52 }
    const zoom = this._stage.aim.zoomable
      ? { x: 20, y: cv.offsetHeight - 64, w: 130, h: 52 }
      : null
    return { fire, zoom }
  }

  _fire(value) {
    // ガイドは発射までやり切ったら卒業（ここで初めて「見た」を記録する）
    if (this._guide) { this._tutorial.markSeen(); this._guide = null }
    this._aimInput.detach()
    this._canvas.removeEventListener('click',    this._handleAimButtons)
    this._canvas.removeEventListener('touchend', this._handleAimButtons)
    this._phase = 'FIRE'
    this._audio.play('fire')
    this._audio.play('whistle', 0.1) // 発射音の直後から飛翔ヒュー（着弾700msに合わせた長さ）

    // FIRE は RESULT と同じ着弾シーン構図（数直線=高さ35%・島の大砲から水平線へ撃つ）。
    // 発射→着弾で画面が切り替わる違和感をなくすため、最初から答え合わせの画面で飛ばす。
    const cv  = this._canvas
    // 数直線の起点は _buildState の seaView と同じ（大砲先端15.5%〜88%）。ズレると着弾と目盛りが食い違う。
    const rsx = Math.round(cv.offsetWidth * 0.155)
    const rex = Math.round(cv.offsetWidth * 0.88)
    // 砲口＝island-cutout の絵の中の大砲の先端（島は幅16%・大砲が rulerY 付近に来る配置）
    const rulerY  = Math.round(cv.offsetHeight * 0.35)
    const cannonX = Math.round(cv.offsetWidth * 0.144)
    const cannonY = Math.round(rulerY + cv.offsetWidth * 0.021)
    const waterY  = Math.round(cv.offsetHeight * 0.55) // 船が浮く水平線

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

    // チュートリアル回は練習＝ランクにもスコアにも記録しない。
    // 着弾だけ見せて卒業カード（ここからは自分の力で）→タイトルへ仕切り直し。
    if (this._guideRound) {
      this._lastShotScore = calcShotScore(this._landingValue, this._targetValue, this._stage.hitMargin, CONFIG.SCORE)
      this._audio.play(isHit ? 'hit' : 'miss')
      this._fireStart   = null
      this._resultStart = performance.now()
      this._resultDur   = this._resultDuration
      setTimeout(() => {
        this._guideRound = false
        this._tutorial.showEnd()
      }, this._resultDur)
      return
    }

    // ランクアップ判定（recordHit 前後の maxLevel 比較）。
    // 遊んだランクを渡す＝最上位ランクで遊んだときだけカウントが動く（①・下のランクは自由練習）
    const prevMax = this._unlock.maxLevel
    this._unlock.recordHit(isHit, this._stageIndex + 1)
    this._unlock.save()
    this._rankUp = this._unlock.maxLevel > prevMax
    this._rankUpName = this._rankUp ? currentStage(this._unlock.maxLevel, CONFIG).name : null
    if (this._rankUp) {
      // 上がった瞬間はその新ランクで遊ぶ（下のランクを選んで練習していた場合も新ランクへ）
      this._playLevel = this._unlock.maxLevel
      this._savePlayLevel()
    }

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
    // 演出（撃沈アニメ・フラッシュ）の長さ。ランクアップやセット満了はじっくり見せる
    this._resultDur = (this._rankUp || this._setFinished) ? 3000 : this._resultDuration
    // 画面送りは自動でなく「つぎへ」タップ待ち（③）。着弾を見た余韻＋誤タップ防止で少し待ってから出す
    this._nextReadyAt = performance.now() + 600
    this._canvas.addEventListener('click',    this._handleResultTap)
    this._canvas.addEventListener('touchend', this._handleResultTap, { passive: false })
  }

  // 結果画面の「つぎへ」タップ（③）。押した点と離した点が同じボタン内のときだけ反応。
  _handleResultTap = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'RESULT') return
    if (performance.now() < this._nextReadyAt) return
    const p = this._eventXY(e)
    if (!isTapOnRect(this._pressPoint, p, this._nextButtonRect())) return
    this._audio.play('tap')
    this._canvas.removeEventListener('click',    this._handleResultTap)
    this._canvas.removeEventListener('touchend', this._handleResultTap)
    // そのランクに初めて上がった時だけ、次のラウンドの前に説明カードを見せる
    // （敵が「小さくなる」・ズームできる、を実物を見せる直前に一言で）
    const rankUpLevel = this._rankUp ? this._unlock.maxLevel : null
    if (rankUpLevel != null && !this._tutorial.hasSeenRankUp(rankUpLevel)) {
      this._tutorial.showRankUp(rankUpLevel, () => { this._audio.play('tap'); this._startMeasure() })
    } else {
      this._startMeasure()
    }
  }

  // 「つぎへ」ボタンの矩形（発射ボタンと同じ右下・renderer と共有する単一の真実）
  _nextButtonRect() {
    const cv = this._canvas
    return { x: cv.offsetWidth - 150, y: cv.offsetHeight - 64, w: 130, h: 52 }
  }
}

const game = new Game()
game.start()
window.__game = game // デバッグ・自動テスト用（描画や判定には不使用）
