// js/renderer.js
import { valueToX, getTicks } from './ruler.js'
import { VERSION } from './config.js'
import { enemyCamScale, isZoomableScene } from './camera.js'

const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg', 'island',
                     'ship-sink-1', 'ship-sink-2', 'ship-sink-3', 'binocular-frame', 'aim-panel',
                     'stage-bg', 'aim-pov', 'title-bg', 'sea-open', 'ruler-img', 'island-cutout',
                     'enemy-boat', 'enemy-drone', 'sea-evening', 'sea-night',
                     'boat-sink-1', 'boat-sink-2', 'boat-sink-3',
                     'drone-sink-1', 'drone-sink-2', 'drone-sink-3']

// 角丸長方形のパスを作る（古いSafari対策で arcTo 手書き）
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}

export class Renderer {
  constructor() {
    this._canvas = null
    this._ctx    = null
    this._CONFIG = null
    this._imgs   = {}
    this._rafId  = null
    this._w      = 0 // 論理サイズ（CSSピクセル）。座標計算はすべてこちらを使う
    this._h      = 0
    this._dpr    = 1 // 描画バッファだけ devicePixelRatio 倍にして文字のにじみをなくす
  }

  async init(canvas, CONFIG, onProgress = null) {
    this._canvas = canvas
    this._ctx    = canvas.getContext('2d')
    this._CONFIG = CONFIG
    this._resize()
    window.addEventListener('resize', () => this._resize())

    // 画像が未用意でもゲームは動く（Canvas 図形でフォールバック）
    let loaded = 0
    await Promise.allSettled(
      ASSET_NAMES.map(name => new Promise((resolve) => {
        const img = new Image()
        const done = () => {
          loaded++
          if (onProgress) onProgress(loaded, ASSET_NAMES.length)
          resolve()
        }
        img.onload  = () => { this._imgs[name] = img; done() }
        img.onerror = done
        img.src = `assets/${name}.webp`
      }))
    )
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    this._dpr = dpr
    this._w   = this._canvas.offsetWidth
    this._h   = this._canvas.offsetHeight
    this._canvas.width  = Math.round(this._w * dpr)
    this._canvas.height = Math.round(this._h * dpr)
  }

  // 論理サイズのビュー（width/height だけを持つ）。描画コードは実バッファでなくこれを見る
  _view() { return { width: this._w, height: this._h } }

  _rulerY()  { return this._h - this._CONFIG.RULER.Y_FROM_BOTTOM }
  _rulerSX() { return this._CONFIG.RULER.MARGIN_X }
  _rulerEX() { return this._w - this._CONFIG.RULER.MARGIN_X }

  drawFrame(state) {
    const { _ctx: ctx, _CONFIG: CFG } = this
    const cv = this._view()
    // 論理座標(CSSピクセル)で描き、バッファだけ dpr 倍 = Retinaでも文字がくっきり
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0)
    // MEASURE・FIRE・RESULT は同じ構図（数直線=高さ35%・船は水平線）。
    // 発射→着弾で画面が切り替わる違和感をなくすため FIRE も着弾シーンで描く。
    const seaView = state.phase === 'MEASURE' || state.phase === 'FIRE' || state.phase === 'RESULT'
    const rulerY = seaView ? Math.round(cv.height * 0.35) : this._rulerY()
    // game.js から渡された rulerGeom（MEASURE は大砲先端起点）を優先、なければデフォルト
    const rsx = state.rulerGeom?.rsx ?? this._rulerSX()
    const rex = state.rulerGeom?.rex ?? this._rulerEX()
    ctx.clearRect(0, 0, cv.width, cv.height)

    // 背景（フェーズで切替）：TITLE=タイトル / AIM=一人称POV / MEASURE・FIRE・RESULT=海。
    // 海はランクの時間帯で本物の背景に差し替える（昼=sea-open / 夕方=sea-evening / 夜=sea-night）。
    const seaBg = state.timeOfDay === 'evening' ? 'sea-evening'
                : state.timeOfDay === 'night'   ? 'sea-night'
                : 'sea-open'
    const bgName = (state.phase === 'TITLE') ? 'title-bg'
                 : (state.phase === 'AIM')   ? 'aim-pov'
                 : seaBg
    const bgImg = this._imgs[bgName] || this._imgs['stage-bg'] || this._imgs['sea-bg']
    if (bgImg) {
      if (seaView) {
        // sea-open.pngの水平線は画像高さ約53%。crop=0.96なら canvas上53/96≈55%に来る
        ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height * 0.96, 0, 0, cv.width, cv.height)
      } else if (state.phase === 'TITLE') {
        // タイトル背景はアスペクト比を保って cover（はみ出す側を中央クロップ）。
        // 引き伸ばすと超横長の画面で絵が歪むため
        const k = Math.max(cv.width / bgImg.width, cv.height / bgImg.height)
        const sw = cv.width / k, sh = cv.height / k
        ctx.drawImage(bgImg, (bgImg.width - sw) / 2, (bgImg.height - sh) / 2, sw, sh,
                      0, 0, cv.width, cv.height)
      } else {
        ctx.drawImage(bgImg, 0, 0, cv.width, cv.height)
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, cv.height)
      grad.addColorStop(0, '#87ceeb')
      grad.addColorStop(0.55, '#1a6fa8')
      grad.addColorStop(1, '#0d4f7a')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, cv.width, cv.height)
    }

    // タイトル画面：モードを大きな2ボタンで選ぶ（取り違え防止）
    // 位置・サイズ・フォントはすべて state.titleLayout（game.js の _titleLayout が単一の真実）に従う。
    // ここでは再計算せず rect を読むだけ。文字は必ず fitFont で枠内に収める＝はみ出しゼロの保証。
    if (state.phase === 'TITLE' && state.titleLayout) {
      const tl = state.titleLayout
      const s  = tl.s
      // 指定幅に収まるフォントサイズへ縮めて ctx.font にセットする（収まればそのまま）
      const fitFont = (text, px, maxW, bold = true) => {
        let f = px
        ctx.font = `${bold ? 'bold ' : ''}${f}px sans-serif`
        const w = ctx.measureText(text).width
        if (w > maxW) {
          f = Math.max(10, Math.floor(f * maxW / w))
          ctx.font = `${bold ? 'bold ' : ''}${f}px sans-serif`
        }
        return f
      }
      // 枠の中央に1行テキスト（ベースラインは枠の高さから導出＝手合わせの数値ずれをなくす）
      const centerText = (text, r, px, bold = true) => {
        const f = fitFont(text, px, r.w - 12, bold)
        ctx.fillText(text, r.x + r.w / 2, r.y + r.h / 2 + f * 0.35)
      }

      // title-bg のキービジュアルを活かすため暗幕は薄め。文字の可読性はテキスト側のフチで確保。
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffdd00'
      fitFont('めざせ！すうちょくせんマスター', tl.fonts.title, cv.width * 0.92)
      ctx.fillText('めざせ！すうちょくせんマスター', cv.width / 2, tl.titleY)

      const drawBtn = (r, color, title, sub) => {
        const cx = r.x + r.w / 2
        ctx.fillStyle = color
        roundRectPath(ctx, r.x, r.y, r.w, r.h, 22 * s)
        ctx.fill()
        ctx.fillStyle = '#fff'
        fitFont(title, tl.fonts.btnTitle, r.w - 20)
        ctx.fillText(title, cx, r.y + r.h * 0.44)
        fitFont(sub, tl.fonts.btnSub, r.w - 16, false)
        ctx.fillText(sub, cx, r.y + r.h * 0.76)
      }
      // モード＝入力のしかたの違いだけ（難易度はランクが決める）
      drawBtn(tl.modeBtns.beginner, '#2e8b57', 'よんでうつ', 'テンキーで かきとめる')
      // おぼえてうつ＝でんせつランク到達まで灰色でロック（色と鍵アイコンで伝える・文字を増やさない）
      if (state.expertLocked) {
        drawBtn(tl.modeBtns.expert, '#5a5a5a', 'おぼえてうつ', '🔒 でんせつで かいほう')
      } else {
        drawBtn(tl.modeBtns.expert, '#c0531f', 'おぼえてうつ', 'じかんせいげんで きおく')
      }

      // ランク選択チップ（ボタンの下）：解放済みならタップでいつでも戻れる／進める。
      // 「難しかったら1個戻る」「苦手な段を練習する」を子ども自身が選べるようにする。
      if (state.rankChips) {
        const { rects, selected, maxLevel } = state.rankChips
        rects.forEach((r, i) => {
          const lvl = i + 1
          const unlocked = lvl <= maxLevel
          const isSel = lvl === selected
          ctx.fillStyle = !unlocked ? 'rgba(40,40,40,0.72)'
                        : isSel     ? '#c0531f'
                        :             'rgba(20,40,70,0.72)'
          roundRectPath(ctx, r.x, r.y, r.w, r.h, 12)
          ctx.fill()
          if (isSel) {
            // 選択枠は矩形の内側に描く＝隣のチップと接して見えるのを防ぐ
            ctx.lineWidth = 4
            ctx.strokeStyle = '#ffdd00'
            roundRectPath(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10)
            ctx.stroke()
          }
          ctx.textAlign = 'center'
          ctx.fillStyle = unlocked ? '#ffffff' : 'rgba(255,255,255,0.45)'
          const label = unlocked ? tl.chipLabels[i] : tl.chipLockedLabels[i]
          centerText(label, r, tl.fonts.chip)
        })
        // 自己ベスト（チップ行の下に1行だけ・0点のときは出さない）
        if (state.score && state.score.best > 0) {
          ctx.font = `bold ${tl.fonts.best}px sans-serif`
          ctx.fillStyle = '#ffdd00'
          ctx.fillText(`じこベスト ${state.score.best}てん`, cv.width / 2, tl.bestY)
        }
      }

      // ランクリセット（左下・2回押しで確定）
      if (state.resetButton) {
        const { rect: rb, confirm } = state.resetButton
        ctx.fillStyle = confirm ? 'rgba(170,30,30,0.9)' : 'rgba(0,0,0,0.5)'
        roundRectPath(ctx, rb.x, rb.y, rb.w, rb.h, 10)
        ctx.fill()
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffffff'
        centerText(confirm ? 'ほんとうに もどす？' : 'ランクを さいしょから', rb, tl.fonts.bottom)
      }

      // バージョン番号（右下最小・きょくボタンの右横＝レイアウト側が場所を空けている）
      ctx.font = `${tl.fonts.version}px sans-serif`
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(VERSION, tl.versionPos.x, tl.versionPos.y)
      this._drawSoundButtons(state)
      if (state.guide) this._drawGuide(state.guide) // 初回：「よんでうつ」への誘導
      return
    }

    // 島（海の構図・左端）：大砲の高さが rulerY に来るよう位置合わせ。
    // 島は数直線の「0」の位置に固定されたモノとして扱い、ズームで0が画面外へ流れたら島も一緒に流れて消える
    // （双眼鏡で寄ると自分の足元＝島が視界から切れていく感覚を出すため。全体表示時は元の見た目と一致する）。
    if (seaView && this._imgs['island-cutout']) {
      const img = this._imgs['island-cutout']
      const iW  = cv.width * 0.16                          // 画面幅の16%
      const iH  = iW * (img.height / img.width)            // アスペクト比維持
      const zeroX = valueToX(CFG.RULER.MIN, state.zoomMin, state.zoomMax, rsx, rex)
      const iX  = zeroX - rsx - iW * 0.05                  // 全体表示時は従来どおり -iW*0.05 に一致
      const iY  = rulerY - iH * 0.38                       // 大砲が rulerY に来るよう上にオフセット
      ctx.drawImage(img, iX, iY, iW, iH)
    }

    // 時間帯の色かぶせ（ランク演出）：背景・島だけを染め、この後に描く数直線・船・
    // パネル・文字は昼のまま＝夜でも読みやすい（数直線が暗くて見にくい実機FB 2026-07-06）。
    this._drawTimeOfDay(state)

    // 数直線。AIM は手元パネルが別の数直線を持つので主数直線は描かない。
    // MEASURE も含め全フェーズ共通で Canvas 動的描画にする（ズーム中の目盛りの伸び縮みをそのまま見せるため）。
    // 静止画（ruler-img）は「今の窓（zoomMin〜zoomMax）」を反映できず、部屋ズームしても絵が変わらない
    // ＝ズームした実感が出ない原因になっていたため MEASURE 専用の分岐は廃止（2026-07-05）。
    if (state.phase !== 'AIM') {
      const ticks = getTicks(state.zoomMin, state.zoomMax, state.tickStep)
        // 夜（でんせつ）は空が暗くなるので、数直線は焦げ茶→生成り色に切り替えて読めるようにする
        const rulerColor = state.timeOfDay === 'night' ? '#f2ead6' : '#3C2415'

        ctx.strokeStyle = rulerColor
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(rsx, rulerY)
        ctx.lineTo(rex, rulerY)
        ctx.stroke()

        ctx.textAlign = 'center'
        ticks.forEach(({ value, isMajor }) => {
          const x  = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
          const tH = isMajor ? 22 : 12
          ctx.strokeStyle = rulerColor
          ctx.lineWidth = isMajor ? 3 : 2
          ctx.beginPath()
          ctx.moveTo(x, rulerY - tH / 2)
          ctx.lineTo(x, rulerY + tH / 2)
          ctx.stroke()
        })

        ;[state.zoomMin, state.zoomMax].forEach((value) => {
          const x = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
          ctx.strokeStyle = rulerColor
          ctx.lineWidth = 5
          ctx.beginPath()
          ctx.moveTo(x, rulerY - 30)
          ctx.lineTo(x, rulerY + 30)
          ctx.stroke()
        })

        // ズームイン前の強調表示フェーズ：今の見た目（zoomMin〜zoomMax＝まだ拡大前の範囲）の中で、
        // これからタップで拡大される区間（zoomHighlightMin〜Max）だけを点滅させる。
        // 例：0〜1000のうち800〜900だけが光る＝「ここが今から大きくなる」を数直線を動かす前に見せる。
        if (state.zoomHighlightMin != null) {
          const hx1 = valueToX(state.zoomHighlightMin, state.zoomMin, state.zoomMax, rsx, rex)
          const hx2 = valueToX(state.zoomHighlightMax, state.zoomMin, state.zoomMax, rsx, rex)
          const alpha = 0.6 * Math.abs(Math.sin(state.zoomHighlightP * Math.PI * 2))
          if (alpha > 0.01) {
            ctx.save()
            ctx.fillStyle = `rgba(255, 200, 30, ${alpha})`
            ctx.fillRect(hx1, rulerY - 34, Math.max(2, hx2 - hx1), 68)
            ctx.strokeStyle = `rgba(255, 160, 0, ${Math.min(1, alpha + 0.2)})`
            ctx.lineWidth = 3
            ctx.strokeRect(hx1, rulerY - 34, Math.max(2, hx2 - hx1), 68)
            ctx.restore()
          }
        }

        // 端の数字はMEASUREだけ後段（双眼鏡の枠の上）で描く。他フェーズはここで描く。
        if (state.phase !== 'MEASURE') {
          ;[state.zoomMin, state.zoomMax].forEach((value) => {
            const x = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
            // 端の真上にセンタリング。画面からはみ出す分だけ内側へ寄せる
            ctx.font = 'bold 26px sans-serif'
            ctx.textAlign = 'center'
            const hw = ctx.measureText(String(value)).width / 2
            const lx = Math.max(6 + hw, Math.min(cv.width - 6 - hw, x))
            ctx.lineWidth = 6
            ctx.strokeStyle = 'rgba(255,255,255,0.95)'
            ctx.strokeText(String(value), lx, rulerY - 36)
            ctx.fillStyle = '#3C2415' // 白フチ＋濃色は夜の空でもそのまま読める
            ctx.fillText(String(value), lx, rulerY - 36)
          })
        }
    }

    // 敵（RESULT＋命中時は撃沈／墜落アニメ／通常は静止）。ランクで敵が変わる：
    // みならい=海賊船（昼）/ いっちょまえ=小舟（夕方）/ でんせつ=ドローン（夜・空中）。
    if (state.showShip) {
      const stg   = CFG.STAGES[state.stageIndex] || {}
      const spriteName = stg.enemySprite || 'ship-enemy'
      const meta  = (CFG.ENEMY.SPRITES && CFG.ENEMY.SPRITES[spriteName])
                    || { w: CFG.ENEMY.SHIP_WIDTH, h: CFG.ENEMY.SHIP_HEIGHT, scale: stg.enemyScale || 1, air: 0 }
      const scale = meta.scale
      // ズームして見えている幅が狭いほど「敵に近づいた」ように大きく見せる（双眼鏡で寄る感覚）。
      // 全体ビューで小さく・ズームが深いほど大きい。倍率パラメータは CFG.ZOOM_ENEMY（camera.js）。
      const camScale = enemyCamScale(state.zoomMin, state.zoomMax, CFG, isZoomableScene(state.phase, stg))
      const shipW = meta.w * scale * camScale
      const shipH = meta.h * scale * camScale
      // 海の構図：敵底が水平線（canvas上約55%）に乗るよう配置。空とぶ敵（air>0）はそこから浮かせる。
      // 水平線Y = imgHorizon(53%) / crop(0.96) → 55.2% ≈ 0.552H
      const airLift = (meta.air || 0) * cv.height
      const baseCenterY = seaView
        ? Math.round(cv.height * 0.55 - shipH * 0.5)   // 水面基準（浮かせない位置）
        : rulerY - shipH / 2
      const centerY = baseCenterY - airLift            // 静止時：空とぶ敵は水面から浮かせる
      const sinking = state.phase === 'RESULT' && state.hitResult === 'HIT' && state.resultProgress != null
      if (sinking) {
        const p = state.resultProgress
        // ランク別の撃沈／墜落アニメ（正方形3コマ：傾く/被弾→崩れる/落下→沈没/着水）。
        const prefix = meta.sink || 'ship-sink'
        const name = p < 0.4 ? `${prefix}-1` : (p < 0.75 ? `${prefix}-2` : `${prefix}-3`)
        const img  = this._imgs[name]
        // コマは正方形タイルなので正方形のまま描く（横伸び防止）。船と同じく1.9倍で煙・しぶきまで収める。
        const dSize = Math.max(shipW, shipH) * 1.9
        // 空とぶ敵（ドローン）は撃たれると浮遊位置から水面へ落下：進行に従い airLift を抜いていく。
        const sinkCenterY = baseCenterY - airLift * (1 - p)
        const alpha = p > 0.85 ? Math.max(0, 1 - (p - 0.85) / 0.15) : 1
        ctx.save()
        ctx.globalAlpha = alpha
        if (img) {
          // 喫水線（コマ下部の水しぶき）が水平線あたりに来るよう少し下げて配置
          ctx.drawImage(img, state.enemyX - dSize / 2, sinkCenterY - dSize / 2 + shipH * 0.2, dSize, dSize)
        } else {
          ctx.translate(state.enemyX, sinkCenterY + p * (shipH + 50))
          ctx.rotate(p * 1.0)
          ctx.fillStyle = '#8b0000'
          ctx.fillRect(-shipW / 2, -shipH / 2, shipW, shipH)
        }
        ctx.restore()
      } else if (this._imgs[spriteName]) {
        ctx.drawImage(this._imgs[spriteName], state.enemyX - shipW / 2, centerY - shipH / 2, shipW, shipH)
      } else {
        ctx.fillStyle = '#8b0000'
        ctx.fillRect(state.enemyX - shipW / 2, centerY - shipH / 2, shipW, shipH)
      }
    }

    // ── 射撃フェーズ（一人称 aim-pov 背景の上に手元の照準パネルを置く） ──
    if (state.phase === 'AIM' && state.aim) {
      ctx.save()
      const { sx, ex, y } = state.panelGeom
      const a = state.aim

      // 照準パネル PNG（土台）：画面幅いっぱいに固定で描き、数直線（sx〜ex）は
      // PNGの木の内側（左右の金具＝約12%を除いた領域）に収める。
      const ph = CFG.AIM_PANEL.HEIGHT
      if (this._imgs['aim-panel']) {
        ctx.drawImage(this._imgs['aim-panel'], 20, y - ph / 2, cv.width - 40, ph)
      } else {
        ctx.fillStyle = '#caa05a'
        roundRectPath(ctx, 20, y - ph / 2, cv.width - 40, ph, 16); ctx.fill()
      }

      // パネル上の数直線（全体スケール or 上級ズーム窓）
      // ズーム中は「500・550・600 の基準を見比べて、その間に目分量で針を置く」のが学びの核。
      // 真ん中の550しか読めなかった実機FB(2026-07-10)への対策は2点セット：
      // ①ズーム中だけ数字を大きく・濃く出す(ここ) ②両端の数字が下角のボタンに描き潰され
      // ないよう数直線を内側に寄せる(config.js AIM_PANEL.MARGIN_X)。①だけでは直らない。
      ctx.strokeStyle = '#3a2410'
      ctx.fillStyle   = '#2a1a00'
      ctx.textAlign = 'center'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(ex, y); ctx.stroke()
      const labelFont = a.zoomed ? 'bold 21px sans-serif' : 'bold 13px sans-serif'
      const labelDy   = a.zoomed ? 22 : 16
      ctx.font = labelFont
      getTicks(a.panelMin, a.panelMax, a.tickStep).forEach(({ value, isMajor }) => {
        const tx = valueToX(value, a.panelMin, a.panelMax, sx, ex)
        const tH = isMajor ? 18 : 9
        ctx.lineWidth = isMajor ? 2 : 1
        ctx.beginPath(); ctx.moveTo(tx, y - tH / 2); ctx.lineTo(tx, y + tH / 2); ctx.stroke()
        // 数字は線の下側（上側だと針のつまみと重なって読めない）
        if (isMajor) ctx.fillText(String(value), tx, y + tH / 2 + labelDy)
      })

      // 針（つまみ）
      const nx = valueToX(a.needleValue, a.panelMin, a.panelMax, sx, ex)
      ctx.fillStyle = '#d23b2b'
      ctx.fillRect(nx - CFG.NEEDLE.WIDTH / 2, y - ph / 2 + 6, CFG.NEEDLE.WIDTH, ph - 12)
      ctx.beginPath()
      ctx.arc(nx, y - ph / 2 + 2, CFG.NEEDLE.HEAD_R, 0, Math.PI * 2)
      ctx.fillStyle = '#e8503c'; ctx.fill()
      ctx.strokeStyle = '#7a1c12'; ctx.lineWidth = 3; ctx.stroke()

      // メモ（初級のみ＝読んだ数）
      if (state.memo) {
        ctx.font = 'bold 40px sans-serif'; ctx.textAlign = 'center'
        ctx.fillStyle = '#ffdd00'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6
        const label = `ねらえ ${state.memo}`
        ctx.strokeText(label, cv.width / 2, 56); ctx.fillText(label, cv.width / 2, 56)
      }

      // 発射ボタン（右下）※矩形は state.buttonRects（game.js 由来）を使う＝単一の真実
      const fb = state.buttonRects.fire
      ctx.fillStyle = '#c0531f'; roundRectPath(ctx, fb.x, fb.y, fb.w, fb.h, 12); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('うつ！', fb.x + fb.w / 2, fb.y + 35)

      // ズームボタン（上級のみ・左下）
      if (state.canZoom && state.buttonRects.zoom) {
        const zb = state.buttonRects.zoom
        ctx.fillStyle = a.zoomed ? '#2e8b57' : '#2a5a8a'
        roundRectPath(ctx, zb.x, zb.y, zb.w, zb.h, 12); ctx.fill()
        ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'
        ctx.fillText(a.zoomed ? 'もどす' : 'ズーム', zb.x + zb.w / 2, zb.y + 33)
      }
      ctx.restore()
    }

    // 砲弾の飛翔（FIRE）：firedArc を fireProgress まで描き、先端に弾。
    if (state.firedArc && state.fireProgress != null) {
      const arc = state.firedArc
      const idx = Math.min(arc.length - 1, Math.round(state.fireProgress * (arc.length - 1)))
      ctx.strokeStyle = 'rgba(255,170,0,0.85)'
      ctx.lineWidth = 3
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      for (let i = 0; i <= idx; i++) {
        i === 0 ? ctx.moveTo(arc[i].x, arc[i].y) : ctx.lineTo(arc[i].x, arc[i].y)
      }
      ctx.stroke(); ctx.setLineDash([])
      const p = arc[idx]
      if (p) {
        const s = 30
        if (this._imgs['cannonball']) ctx.drawImage(this._imgs['cannonball'], p.x - s/2, p.y - s/2, s, s)
        else { ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI*2); ctx.fill() }
      }
    }

    // 着弾エフェクト（RESULT）
    if (state.phase === 'RESULT' && state.landingX !== null) {
      const rp = state.resultProgress ?? 0
      // 命中の瞬間だけ画面が一瞬光る
      if (state.hitResult === 'HIT' && rp < 0.18) {
        const f = (0.18 - rp) / 0.18
        ctx.fillStyle = `rgba(255,255,255,${f * 0.7})`
        ctx.fillRect(0, 0, cv.width, cv.height)
      }
      // 着弾は船の浮かぶ水平線（canvas高さ55%）で見せる
      const splashY = Math.round(cv.height * 0.55)
      if (state.hitResult === 'HIT' && this._imgs['splash']) {
        // 命中の爆発：序盤に大きく出て、徐々に薄く消える
        const a = rp < 0.45 ? 1 : Math.max(0, 1 - (rp - 0.45) / 0.3)
        if (a > 0) {
          const burst = 130
          ctx.save()
          ctx.globalAlpha = a
          ctx.drawImage(this._imgs['splash'], state.landingX - burst / 2, splashY - burst * 0.75, burst, burst)
          ctx.restore()
        }
      } else if (state.hitResult !== 'HIT') {
        // はずれ：水しぶき
        ctx.fillStyle = '#4488ff'
        ctx.beginPath()
        ctx.arc(state.landingX, splashY, 22, 0, Math.PI * 2)
        ctx.fill()
      }

      // ねらい（旗＝正解の位置）と着弾を数直線上に並べる（③）：
      // 水しぶきから数直線へ点線を立ち上げ、旗とのずれを帯で見せる＝測量→ブレの因果を言葉ゼロで。
      {
        // 着弾の垂線（水面→数直線）と数直線上の着弾点
        ctx.save()
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 3
        ctx.setLineDash([7, 6])
        ctx.beginPath()
        ctx.moveTo(state.landingX, splashY - 8)
        ctx.lineTo(state.landingX, rulerY)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = '#4488ff'
        ctx.beginPath()
        ctx.arc(state.landingX, rulerY, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.stroke()

        // ずれの帯（旗と着弾の間）。命中はほぼ幅ゼロ＝出ないのが正しい
        const fx = state.enemyX
        const bx1 = Math.min(fx, state.landingX), bx2 = Math.max(fx, state.landingX)
        if (bx2 - bx1 > 4) {
          ctx.fillStyle = state.hitResult === 'HIT' ? 'rgba(90,220,120,0.35)' : 'rgba(255,80,60,0.35)'
          ctx.fillRect(bx1, rulerY - 7, bx2 - bx1, 14)
        }
        // ミス時だけ「◯◯ ずれた」を帯の下に一言（外部レビュー反映：絵だけでは
        // 「赤＝ダメ」以上が伝わりにくい。ずれを数で見せる＝数直線の値差の実感にもなる）
        if (state.hitResult !== 'HIT' && state.resultGap != null && state.resultGap > 0) {
          const tx = Math.max(50, Math.min(cv.width - 50, (bx1 + bx2) / 2))
          ctx.font = 'bold 22px sans-serif'
          ctx.textAlign = 'center'
          ctx.lineWidth = 5
          ctx.strokeStyle = 'rgba(0,0,0,0.55)'
          ctx.strokeText(`${state.resultGap} ずれた`, tx, rulerY + 38)
          ctx.fillStyle = '#ffdd00'
          ctx.fillText(`${state.resultGap} ずれた`, tx, rulerY + 38)
        }

        // 旗（ねらうべき場所＝正解値の真上）。ロゴ色のオレンジ＋こげ茶の棒
        const poleH = 46
        ctx.strokeStyle = '#3C2415'
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(fx, rulerY)
        ctx.lineTo(fx, rulerY - poleH)
        ctx.stroke()
        ctx.fillStyle = '#F7931E'
        ctx.beginPath()
        ctx.moveTo(fx, rulerY - poleH)
        ctx.lineTo(fx + 30, rulerY - poleH + 9)
        ctx.lineTo(fx, rulerY - poleH + 18)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      ctx.font = 'bold 52px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = state.hitResult === 'HIT' ? '#ffdd00' : '#ffffff'
      ctx.fillText(
        state.hitResult === 'HIT' ? '命中！🎯' : 'はずれ💦',
        cv.width / 2, cv.height / 2 - 20
      )

      // スコア（1発の点数＋セットの進み）
      if (state.score && state.score.last != null) {
        const s = state.score
        ctx.font = 'bold 34px sans-serif'
        ctx.lineWidth = 5
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.fillStyle = s.last > 0 ? '#ffdd00' : '#dddddd'
        ctx.strokeText(`+${s.last}てん`, cv.width / 2, cv.height / 2 + 26)
        ctx.fillText(`+${s.last}てん`, cv.width / 2, cv.height / 2 + 26)

        ctx.font = 'bold 19px sans-serif'
        ctx.lineWidth = 4
        ctx.fillStyle = '#ffffff'
        const setLine = `${s.shotCount}/${s.setSize}はつ　ごうけい ${s.setTotal}てん`
        ctx.strokeText(setLine, cv.width / 2, cv.height / 2 + 56)
        ctx.fillText(setLine, cv.width / 2, cv.height / 2 + 56)

        if (s.setFinished) {
          ctx.font = 'bold 24px sans-serif'
          ctx.fillStyle = '#ffdd00'
          const doneLine = s.newBest ? `セットかんりょう！ じこベストこうしん ${s.best}てん！` : 'セットかんりょう！'
          ctx.strokeText(doneLine, cv.width / 2, cv.height / 2 + 90)
          ctx.fillText(doneLine, cv.width / 2, cv.height / 2 + 90)
        }
      }

      // ランクアップ演出（金のフラッシュ＋バナー）
      if (state.rankUp && state.rankUpName) {
        if (rp < 0.22) {
          const f = (0.22 - rp) / 0.22
          ctx.fillStyle = `rgba(255,221,0,${f * 0.5})`
          ctx.fillRect(0, 0, cv.width, cv.height)
        }
        ctx.font = 'bold 34px sans-serif'
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(0,0,0,0.6)'
        ctx.fillStyle = '#ffdd00'
        const banner = `⭐ ランクアップ！ ${state.rankUpName} ⭐`
        ctx.strokeText(banner, cv.width / 2, 84)
        ctx.fillText(banner, cv.width / 2, 84)
      }
    }

    // 双眼鏡の覗き込み（MEASURE中）：レンズ外を黒で塞ぎ、その上に枠PNGを重ねる。
    if (state.phase === 'MEASURE') {
      // 横視点の舞台に合わせる初期値（実機で詰める）。数直線(MEASURE)は cv.height*0.52。
      const cy  = Math.round(cv.height * 0.50)
      const R   = Math.min(cv.width * 0.30, cv.height * 0.58)
      const cxL = cv.width / 2 - R * 0.82
      const cxR = cv.width / 2 + R * 0.82

      // レンズ外（2円の外側）だけ黒幕（evenodd を2回 clip）
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, cv.width, cv.height)
      ctx.moveTo(cxL + R, cy); ctx.arc(cxL, cy, R, 0, Math.PI * 2)
      ctx.clip('evenodd')
      ctx.beginPath()
      ctx.rect(0, 0, cv.width, cv.height)
      ctx.moveTo(cxR + R, cy); ctx.arc(cxR, cy, R, 0, Math.PI * 2)
      ctx.clip('evenodd')
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.restore()

      // 双眼鏡の枠PNG（レンズ内透過）を 2円にだいたい合わせて重ねる
      if (this._imgs['binocular-frame']) {
        const fw = (cxR - cxL) + R * 2.3
        const fh = fw * (this._imgs['binocular-frame'].height / this._imgs['binocular-frame'].width)
        ctx.drawImage(this._imgs['binocular-frame'], cv.width / 2 - fw / 2, cy - fh / 2, fw, fh)
      }

      // 数直線の端の数字（0・1000等）は枠より上に描く。
      // 枠の下だと右端の「1000」が金具に隠れて「100」に読めてしまう（2026-07-05実機FB）。
      // ズーム遷移中は補間した半端な数値（例:127.4）をそのまま出すと「ランダムな数字」に見えてしまうため、
      // 旧の値（例:0）→新の値（例:300）をクロスフェードで見せる（両者とも位置は同じ端＝rsx/rex）。
      // 段階ヒント（②）1段目：2回外したら両端の数字がふわっと大きくなって光る＝「まず端を見る」。
      // 正解の目盛りは光らせない（つまずきは位置でなく「1目盛りはいくつか」の読み違いのため）。
      const aidPulse = state.measureAid
        ? 1 + 0.22 * (0.5 + 0.5 * Math.sin(performance.now() / 1000 * 2.6))
        : 1
      const drawEdgeLabel = (edgeValue, text, alpha) => {
        if (alpha <= 0) return
        const x = valueToX(edgeValue, state.zoomMin, state.zoomMax, rsx, rex)
        ctx.font = `bold ${Math.round(26 * aidPulse)}px sans-serif`
        ctx.textAlign = 'center'
        const hw = ctx.measureText(text).width / 2
        const lx = Math.max(6 + hw, Math.min(cv.width - 6 - hw, x))
        ctx.save()
        ctx.globalAlpha = alpha
        if (state.measureAid) {
          ctx.shadowColor = '#ffdd00'
          ctx.shadowBlur  = 16 * aidPulse
        }
        ctx.lineWidth = 6
        ctx.strokeStyle = state.measureAid ? 'rgba(255,240,160,0.95)' : 'rgba(255,255,255,0.95)'
        ctx.strokeText(text, lx, rulerY - 18)
        ctx.fillStyle = '#111'
        ctx.fillText(text, lx, rulerY - 18)
        ctx.restore()
      }
      const fading = state.zoomAnimT != null
      ;[
        { value: state.zoomMin, from: state.zoomAnimFromMin, to: state.zoomAnimToMin },
        { value: state.zoomMax, from: state.zoomAnimFromMax, to: state.zoomAnimToMax },
      ].forEach(({ value, from, to }) => {
        if (fading) {
          // 表示位置は補間中の value（=state.zoomMin/Max）で計算しつつ、文字は確定した整数のfrom/toだけを使う。
          // 補間中の半端な小数（例:222.42…）をそのまま文字にすると「ランダムな数字」に見えてしまうため。
          drawEdgeLabel(value, String(from), 1 - state.zoomAnimT)
          drawEdgeLabel(value, String(to), state.zoomAnimT)
        } else {
          drawEdgeLabel(value, String(value), 1)
        }
      })

      // 段階ヒント（②）2段目：4回外したら「端のひとつ前の目盛り」に数字がポンと出る
      // （例：0〜1000なら900、400〜500の部屋なら490）。1目盛りがいくつかを自力で逆算する足がかり。
      // 答えの目盛りには最後まで何も出さない。ズーム遷移中は半端な値になるので描かない。
      if (state.measureAid && state.measureAid.level >= 2 && state.zoomAnimT == null) {
        const v = state.zoomMax - state.tickStep
        const x = valueToX(v, state.zoomMin, state.zoomMax, rsx, rex)
        const pop = Math.min(1, (performance.now() - state.measureAid.popStart) / 350)
        const size = Math.round(24 * (0.5 + 0.5 * pop))
        ctx.save()
        ctx.font = `bold ${size}px sans-serif`
        ctx.textAlign = 'center'
        ctx.lineWidth = 5
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.strokeText(String(v), x, rulerY + 44)
        ctx.fillStyle = '#F7931E'
        ctx.fillText(String(v), x, rulerY + 44)
        ctx.restore()
      }
    }

    // タイマー（MEASURE・上級のみ。左上・もどるボタンの右隣。ボタンの真下に描くと隠れて見えない）
    if (state.phase === 'MEASURE' && state.timerRemaining != null) {
      ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = state.timerRemaining <= 5 ? '#ff5555' : '#ffffff'
      ctx.fillText(`⏱ ${state.timerRemaining}`, 116, 46)
    }

    // 進め方ヒント（上中央）：ズーム案内（最初の数回のみ）／初級の測量ミス段階ヒント
    if (state.measureHint) {
      ctx.font = 'bold 22px sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth = 4
      ctx.strokeText(state.measureHint, cv.width / 2, 40)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(state.measureHint, cv.width / 2, 40)
    }

    // ズームを1段階戻すボタン（測量中・ズームしている時だけ／ヒントの下）：どこをタップすれば戻れるか明示する
    if (state.zoomOutButtonRect) {
      const b = state.zoomOutButtonRect
      ctx.save()
      ctx.fillStyle = '#2e8b57'
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 10)
      ctx.fill()
      ctx.font = 'bold 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('◀ ひとつ もどす', b.x + b.w / 2, b.y + 26)
      ctx.restore()
    }

    // 「おぼえた！」ボタン（上級の測量・右下）：射撃の「うつ！」と同じ位置・同じ色＝押せば進むが一目でわかる
    if (state.memorizedButtonRect) {
      const b = state.memorizedButtonRect
      ctx.save()
      ctx.fillStyle = '#c0531f'
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 12)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 22px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('おぼえた！', b.x + b.w / 2, b.y + 33)
      ctx.restore()
    }

    // ランクと連続命中メーター（右上・測量中）：上達の道を見える化
    if (state.phase === 'MEASURE' && state.rank) {
      const r = state.rank
      ctx.save()
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      // 表示は「今あそんでいる段」の名前（下のランクを選んで練習中に最高ランク名が出ると混乱する）
      ctx.fillText(state.stageName || r.name, cv.width - 20, 32)
      // 昇格カウントが動くのは最上位ランクで遊んでいる時だけ（①）。
      // 下のランクで遊んでいる間は薄く描いて「ここでは進まない」を文字なしで伝える。
      const dim = state.rankProgressActive ? 1 : 0.35
      if (r.needed != null) {
        // 次のランクへの道のり＝星（埋まった数が連続命中・文字を使わない）右揃え
        const rad = 11, gap = 28
        const endX = cv.width - 20 - rad
        ctx.globalAlpha = dim
        for (let i = 0; i < r.needed; i++) {
          const x = endX - (r.needed - 1 - i) * gap
          this._drawStar(ctx, x, 58, rad, i < Math.min(r.streak, r.needed))
        }
        ctx.globalAlpha = 1
      } else {
        // 最高ランク：連続記録を見せる
        ctx.globalAlpha = dim
        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(`れんぞく ${r.streak}かい`, cv.width - 20, 56)
        ctx.globalAlpha = 1
      }
      // 下のランクで遊んでいる間は「れんしゅうちゅう」と一言（外部レビュー反映：
      // 薄い星だけでは「バグ？なんで増えないの？」になる。練習という枠を言葉で与えて納得感を出す）
      if (!state.rankProgressActive) {
        ctx.font = 'bold 14px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText('れんしゅうちゅう', cv.width - 20, 84)
      }
      ctx.restore()
    }

    // 「つぎへ」ボタン（RESULT・右下）：自動送り廃止＝子どものペースで結果を眺められる（③）
    if (state.nextButtonRect) {
      const b = state.nextButtonRect
      ctx.save()
      ctx.fillStyle = '#c0531f'
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 12)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 26px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('つぎへ ▶', b.x + b.w / 2, b.y + 35)
      ctx.restore()
    }

    // 戻るボタン（TITLE 以外・左上）
    if (state.backButtonRect) {
      const b = state.backButtonRect
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      roundRectPath(ctx, b.x, b.y, b.w, b.h, 10)
      ctx.fill()
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.fillText('◀ もどる', b.x + b.w / 2, b.y + 30)
      ctx.restore()
    }

    // 音ON/OFFボタン（soundButtons がある画面でだけ描く。今はTITLEのみ）
    this._drawSoundButtons(state)

    // 初回プレイの操作ガイド（最前面）：対象を指す吹き出し＋ボタンなら光る枠
    if (state.guide) this._drawGuide(state.guide)
  }

  // 5角の星（昇格メーター用）。絵文字だとiOS canvasで見た目が揃わないためパスで描く。
  // filled=true は金色（連続命中1回分）、false は輪郭だけの空き星（あと何回か）。
  _drawStar(ctx, cx, cy, r, filled) {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5
      const rad = i % 2 === 0 ? r : r * 0.45
      const x = cx + Math.cos(ang) * rad
      const y = cy + Math.sin(ang) * rad
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = filled ? '#ffdd00' : 'rgba(255,255,255,0.22)'
    ctx.fill()
    ctx.lineWidth = 2
    ctx.strokeStyle = filled ? '#c8860a' : 'rgba(0,0,0,0.5)'
    ctx.stroke()
  }

  // ガイド吹き出し：対象の真上でふわふわ上下する吹き出し（▼のしっぽ付き）。
  // guide.ring が矩形なら、その周りに脈打つ金色の枠も描く（ボタン誘導用）。
  _drawGuide(guide) {
    const ctx = this._ctx
    const cv  = this._view()
    const t = performance.now() / 1000
    ctx.save()

    // guide.scale はタイトル画面のみ渡される（_titleLayout の s）。狭い高さでは
    // タイトルとボタンの間隔も縮むため、吹き出しを固定pxのままにするとタイトルに食い込む。
    // 文字サイズには下限を設けて読めなくならないようにする。
    const gs = guide.scale || 1
    const guideFont = Math.max(15, Math.round(24 * gs))

    if (guide.ring) {
      const pulse = (4 + Math.sin(t * 5) * 3) * gs
      const r = guide.ring
      ctx.strokeStyle = '#ffdd00'
      ctx.lineWidth = 5 * gs
      roundRectPath(ctx, r.x - pulse, r.y - pulse, r.w + pulse * 2, r.h + pulse * 2, 14 * gs)
      ctx.stroke()
    }

    ctx.font = `bold ${guideFont}px sans-serif`
    const pad = 16 * gs
    const w = ctx.measureText(guide.text).width + pad * 2
    const h = guideFont * 2
    const bounce = Math.sin(t * 3.5) * 7 * gs
    let bx = guide.x - w / 2
    bx = Math.max(10, Math.min(cv.width - w - 10, bx)) // 画面からはみ出さない
    const tailH = 16 * gs
    const by = guide.y - 64 * gs - h - tailH + bounce

    // しっぽ（▼）→ 本体の順に塗ってから、輪郭をまとめて描く
    ctx.fillStyle = '#fffbe8'
    ctx.strokeStyle = '#3C2415'
    ctx.lineWidth = 3
    roundRectPath(ctx, bx, by, w, h, 12)
    ctx.fill(); ctx.stroke()
    const tailX = Math.max(bx + 20 * gs, Math.min(bx + w - 20 * gs, guide.x))
    ctx.beginPath()
    ctx.moveTo(tailX - 11 * gs, by + h - 1)
    ctx.lineTo(tailX + 11 * gs, by + h - 1)
    ctx.lineTo(tailX, by + h + tailH)
    ctx.closePath()
    ctx.fill(); ctx.stroke()
    // しっぽと本体の境目の線を消す（同色で上塗り）
    ctx.fillRect(tailX - 9 * gs, by + h - 3, 18 * gs, 4)

    ctx.fillStyle = '#3C2415'
    ctx.textAlign = 'center'
    ctx.fillText(guide.text, bx + w / 2, by + h / 2 + guideFont * 0.35)
    ctx.restore()
  }

  // ランクで時間帯が進む演出（みならい=昼／いっちょまえ=夕方／でんせつ=夜）。
  // multiply合成で景色全体を染めるので、絵の輪郭やディテールはそのまま残る。
  _drawTimeOfDay(state) {
    const tod = state.timeOfDay
    if (tod !== 'evening' && tod !== 'night') return
    // 海の構図（MEASURE/FIRE/RESULT）は時間帯そのものの背景画像（sea-evening / sea-night）に
    // 差し替え済み。色かぶせを重ねると二重に暗くなり、夜は月が二つ描かれてしまうので海ではかけない。
    // 一人称の砦（AIM）だけは背景が固定画像なので、ここで時間帯の色を薄くかぶせて雰囲気を合わせる。
    if (state.phase !== 'AIM') return
    const ctx = this._ctx
    const cv  = this._view()
    ctx.save()

    if (tod === 'evening') {
      // 夕方＝黄昏時：上空は藤色に暮れて、水平線に近づくほど夕焼けの橙〜金色。
      // 水平線ぎわに夕日の照り返しの帯を重ねて「日が沈みかけている」感を出す。
      ctx.globalCompositeOperation = 'multiply'
      const g = ctx.createLinearGradient(0, 0, 0, cv.height)
      g.addColorStop(0,    'rgb(175, 130, 195)')  // 藤色の宵空
      g.addColorStop(0.30, 'rgb(255, 150, 105)')  // 燃える夕焼け
      g.addColorStop(0.52, 'rgb(255, 205, 125)')  // 水平線ぎわの金色
      g.addColorStop(0.70, 'rgb(230, 150, 120)')  // 夕日を映す海
      g.addColorStop(1,    'rgb(205, 135, 135)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.globalCompositeOperation = 'source-over'
      // 水平線の照り返し（上下対称のグロー帯）
      const hy = cv.height * 0.53
      const glow = ctx.createLinearGradient(0, hy - cv.height * 0.16, 0, hy + cv.height * 0.12)
      glow.addColorStop(0,   'rgba(255, 150, 50, 0)')
      glow.addColorStop(0.55, 'rgba(255, 130, 45, 0.30)')
      glow.addColorStop(1,   'rgba(255, 150, 50, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, hy - cv.height * 0.16, cv.width, cv.height * 0.28)
    } else {
      // 夜：全体を青く沈めて、星と月を出す
      ctx.globalCompositeOperation = 'multiply'
      const g = ctx.createLinearGradient(0, 0, 0, cv.height)
      g.addColorStop(0,   'rgb(80, 95, 155)')
      g.addColorStop(0.55, 'rgb(105, 120, 175)')
      g.addColorStop(1,   'rgb(90, 105, 160)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.globalCompositeOperation = 'source-over'
      // 星と月は空が見えている海の画面だけ（AIMは砦の中＝壁に月が浮いて見えてしまう）
      if (state.phase === 'AIM') { ctx.restore(); return }
      // 星（位置は固定・またたきだけ時間で揺らす）。空＝画面上部30%に散らす
      const t = performance.now() / 1000
      for (let i = 0; i < 26; i++) {
        const x = ((i * 137.508) % 97) / 97 * cv.width
        const y = ((i * 61.803) % 89) / 89 * cv.height * 0.3
        const tw = 0.35 + 0.45 * Math.abs(Math.sin(t * 1.3 + i * 2.1))
        ctx.fillStyle = `rgba(255, 250, 220, ${tw})`
        const r = 1.5 + (i % 3) * 0.8
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      }
      // 月（右上）：ほんのり光る満月
      const mx = cv.width * 0.84, my = cv.height * 0.13, mr = 30
      const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3)
      halo.addColorStop(0, 'rgba(255, 250, 210, 0.35)')
      halo.addColorStop(1, 'rgba(255, 250, 210, 0)')
      ctx.fillStyle = halo
      ctx.beginPath(); ctx.arc(mx, my, mr * 3, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fdf6d8'
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }

  // 音ON/OFFボタン（効果音とBGMを別々に切替）。矩形は game.js の _soundButtonRects 由来＝単一の真実。
  _drawSoundButtons(state) {
    if (!state.soundButtons) return
    const ctx = this._ctx
    const { rects, sfxOn, bgmOn } = state.soundButtons
    // フォントは titleLayout（矩形と同じ単一の真実）から。ベースラインは枠の高さから導出
    const fontSize = state.titleLayout ? state.titleLayout.fonts.bottom : 17
    const drawToggle = (r, on, label) => {
      ctx.save()
      ctx.fillStyle = on ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.7)'
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
      ctx.fill()
      ctx.font = `bold ${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.45)'
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + fontSize * 0.35)
      ctx.restore()
    }
    drawToggle(rects.sfx, sfxOn, sfxOn ? '🔊 おと' : '🔇 おと')
    drawToggle(rects.bgm, bgmOn, bgmOn ? '🎵 きょく' : '🎵 きょく✕')
  }

  startLoop(getState) {
    const loop = () => {
      // 1回の描画エラーで永久フリーズさせない：エラー画面を出してループを止める
      try {
        this.drawFrame(getState())
      } catch (err) {
        if (window.showFatalError) window.showFatalError(err)
        return
      }
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  stopLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
  }
}
