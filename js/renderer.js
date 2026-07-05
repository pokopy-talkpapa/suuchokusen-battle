// js/renderer.js
import { valueToX, getTicks } from './ruler.js'
import { VERSION } from './config.js'

const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg', 'island',
                     'ship-sink-1', 'ship-sink-2', 'ship-sink-3', 'binocular-frame', 'aim-panel',
                     'stage-bg', 'aim-pov', 'title-bg', 'sea-open', 'ruler-img', 'island-cutout']

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
    // MEASURE・FIRE・RESULT は同じ構図（数直線=高さ35%・船は水平線）。
    // 発射→着弾で画面が切り替わる違和感をなくすため FIRE も着弾シーンで描く。
    const seaView = state.phase === 'MEASURE' || state.phase === 'FIRE' || state.phase === 'RESULT'
    const rulerY = seaView ? Math.round(cv.height * 0.35) : this._rulerY()
    // game.js から渡された rulerGeom（MEASURE は大砲先端起点）を優先、なければデフォルト
    const rsx = state.rulerGeom?.rsx ?? this._rulerSX()
    const rex = state.rulerGeom?.rex ?? this._rulerEX()
    ctx.clearRect(0, 0, cv.width, cv.height)

    // 背景（フェーズで切替）：TITLE=タイトル / AIM=一人称POV / MEASURE・FIRE・RESULT=海。
    const bgName = (state.phase === 'TITLE') ? 'title-bg'
                 : (state.phase === 'AIM')   ? 'aim-pov'
                 : 'sea-open'
    const bgImg = this._imgs[bgName] || this._imgs['stage-bg'] || this._imgs['sea-bg']
    if (bgImg) {
      if (seaView) {
        // sea-open.pngの水平線は画像高さ約53%。crop=0.96なら canvas上53/96≈55%に来る
        ctx.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height * 0.96, 0, 0, cv.width, cv.height)
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
    if (state.phase === 'TITLE') {
      // title-bg のキービジュアルを活かすため暗幕は薄め。文字の可読性はテキスト側のフチで確保。
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffdd00'
      ctx.font = 'bold 42px sans-serif'
      ctx.fillText('めざせ！すうちょくせんマスター', cv.width / 2, 72)
      ctx.fillStyle = '#fff'
      ctx.font = '22px sans-serif'
      ctx.fillText('モードを えらんでね', cv.width / 2, 112)

      const bw = Math.min(280, cv.width * 0.38)
      const bh = 124
      const by = cv.height * 0.55 - bh / 2
      const drawBtn = (cx, color, title, sub) => {
        const x = cx - bw / 2
        ctx.fillStyle = color
        roundRectPath(ctx, x, by, bw, bh, 22)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 32px sans-serif'
        ctx.fillText(title, cx, by + 54)
        ctx.font = '18px sans-serif'
        ctx.fillText(sub, cx, by + 90)
      }
      // モード＝入力のしかたの違いだけ（難易度はランクが決める）
      drawBtn(cv.width * 0.27, '#2e8b57', 'よんでうつ', 'テンキーで かきとめる')
      // おぼえてうつ＝でんせつランク到達まで灰色でロック（色と鍵アイコンで伝える・文字を増やさない）
      if (state.expertLocked) {
        drawBtn(cv.width * 0.73, '#5a5a5a', 'おぼえてうつ', '🔒 でんせつで かいほう')
      } else {
        drawBtn(cv.width * 0.73, '#c0531f', 'おぼえてうつ', 'じかんせいげんで きおく')
      }

      // 現在のランクと自己ベスト（ボタンの下）
      if (state.rank) {
        ctx.font = 'bold 20px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffdd00'
        const bestText = state.score && state.score.best > 0 ? `　じこベスト ${state.score.best}てん` : ''
        ctx.fillText(`ランク：${state.rank.name}${bestText}`, cv.width / 2, by + bh + 38)
      }

      // ランクリセット（左下・2回押しで確定）
      if (state.resetButton) {
        const { rect: rb, confirm } = state.resetButton
        ctx.fillStyle = confirm ? 'rgba(170,30,30,0.9)' : 'rgba(0,0,0,0.5)'
        roundRectPath(ctx, rb.x, rb.y, rb.w, rb.h, 10)
        ctx.fill()
        ctx.font = 'bold 17px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffffff'
        ctx.fillText(confirm ? 'ほんとうに もどす？' : 'ランクを さいしょから',
                     rb.x + rb.w / 2, rb.y + 28)
      }

      // バージョン番号（右下）
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText(VERSION, cv.width - 14, cv.height - 12)
      this._drawSoundButtons(state)
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

    // 数直線。AIM は手元パネルが別の数直線を持つので主数直線は描かない。
    // MEASURE も含め全フェーズ共通で Canvas 動的描画にする（ズーム中の目盛りの伸び縮みをそのまま見せるため）。
    // 静止画（ruler-img）は「今の窓（zoomMin〜zoomMax）」を反映できず、部屋ズームしても絵が変わらない
    // ＝ズームした実感が出ない原因になっていたため MEASURE 専用の分岐は廃止（2026-07-05）。
    if (state.phase !== 'AIM') {
      const ticks = getTicks(state.zoomMin, state.zoomMax, state.tickStep)
      // ズーム遷移中は数直線全体を金色にパルスさせ「今ここがタップされて広がっている」ことを強調する。
      // 0→1→0（サイン波）で1回だけ光らせる＝タップした区間の強調表示（点滅）の代わり。
      const flash = state.zoomAnimT != null ? Math.sin(Math.min(1, state.zoomAnimT) * Math.PI) : 0
      const rulerColor = flash > 0
        ? `rgb(${Math.round(60 + flash * 195)}, ${Math.round(36 + flash * 140)}, ${Math.round(21 - flash * 21)})`
        : '#3C2415'

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
            ctx.fillStyle = '#3C2415'
            ctx.fillText(String(value), lx, rulerY - 36)
          })
        }
    }

    // 敵船（RESULT＋命中時は沈むコマアニメ／通常は静止）
    if (state.showShip) {
      const scale = (CFG.STAGES[state.stageIndex] && CFG.STAGES[state.stageIndex].enemyScale) || 1
      // ズームして見えている幅が狭いほど「船に近づいた」ように大きく見せる（双眼鏡で寄る感覚）。
      // 全体(1000)なら1倍。でんせつは100窓→10窓と2段ズームがあるため、1段目は控えめにとどめ、
      // 最深部（10窓）でも数直線の目盛りに被らず「触れる」程度で頭打ちにする（2026-07-05実機FB）。
      const spanRatio = (CFG.RULER.MAX - CFG.RULER.MIN) / (state.zoomMax - state.zoomMin)
      const camScale = Math.min(2.3, 1 + (Math.sqrt(spanRatio) - 1) * 0.45)
      const shipW = CFG.ENEMY.SHIP_WIDTH  * scale * camScale
      const shipH = CFG.ENEMY.SHIP_HEIGHT * scale * camScale
      // 海の構図：船底が水平線（canvas上約55%）に乗るよう配置。
      // 水平線Y = imgHorizon(53%) / crop(0.96) → 55.2% ≈ 0.552H
      const centerY = seaView
        ? Math.round(cv.height * 0.55 - shipH * 0.5)
        : rulerY - shipH / 2
      const sinking = state.phase === 'RESULT' && state.hitResult === 'HIT' && state.resultProgress != null
      if (sinking) {
        const p = state.resultProgress
        // 3コマ（傾く→半分沈む→ほぼ沈没）を進行度で切り替え
        const name = p < 0.4 ? 'ship-sink-1' : (p < 0.75 ? 'ship-sink-2' : 'ship-sink-3')
        const img  = this._imgs[name]
        const dW = shipW * 1.9, dH = shipH * 1.9   // 正方コマ（船＋煙＋水しぶきを含む）
        const alpha = p > 0.85 ? Math.max(0, 1 - (p - 0.85) / 0.15) : 1
        ctx.save()
        ctx.globalAlpha = alpha
        if (img) {
          // 喫水線が数直線あたりに来るよう少し下げて配置
          ctx.drawImage(img, state.enemyX - dW / 2, centerY - dH / 2 + shipH * 0.2, dW, dH)
        } else {
          ctx.translate(state.enemyX, centerY + p * (shipH + 50))
          ctx.rotate(p * 1.0)
          ctx.fillStyle = '#8b0000'
          ctx.fillRect(-shipW / 2, -shipH / 2, shipW, shipH)
        }
        ctx.restore()
      } else if (this._imgs['ship-enemy']) {
        ctx.drawImage(this._imgs['ship-enemy'], state.enemyX - shipW / 2, centerY - shipH / 2, shipW, shipH)
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
      ctx.strokeStyle = '#3a2410'
      ctx.fillStyle   = '#2a1a00'
      ctx.font = 'bold 13px sans-serif'
      ctx.textAlign = 'center'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(ex, y); ctx.stroke()
      getTicks(a.panelMin, a.panelMax, a.tickStep).forEach(({ value, isMajor }) => {
        const tx = valueToX(value, a.panelMin, a.panelMax, sx, ex)
        const tH = isMajor ? 18 : 9
        ctx.lineWidth = isMajor ? 2 : 1
        ctx.beginPath(); ctx.moveTo(tx, y - tH / 2); ctx.lineTo(tx, y + tH / 2); ctx.stroke()
        // 数字は線の下側（上側だと針のつまみと重なって読めない）
        if (isMajor) ctx.fillText(String(value), tx, y + tH / 2 + 16)
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
      const drawEdgeLabel = (edgeValue, text, alpha) => {
        if (alpha <= 0) return
        const x = valueToX(edgeValue, state.zoomMin, state.zoomMax, rsx, rex)
        ctx.font = 'bold 26px sans-serif'
        ctx.textAlign = 'center'
        const hw = ctx.measureText(text).width / 2
        const lx = Math.max(6 + hw, Math.min(cv.width - 6 - hw, x))
        ctx.save()
        ctx.globalAlpha = alpha
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
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
    }

    // タイマー（MEASURE・上級のみ。左上・もどるボタンの右隣。ボタンの真下に描くと隠れて見えない）
    if (state.phase === 'MEASURE' && state.timerRemaining != null) {
      ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = state.timerRemaining <= 5 ? '#ff5555' : '#ffffff'
      ctx.fillText(`⏱ ${state.timerRemaining}`, 116, 46)
    }

    // 進め方ヒント（上中央）：ズーム前=「ふねの あたりを タップ！」／上級ズーム後=「おぼえたら そらを タップ！」
    if (state.measureHint) {
      ctx.font = 'bold 22px sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth = 4
      ctx.strokeText(state.measureHint, cv.width / 2, 40)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(state.measureHint, cv.width / 2, 40)
    }

    // ランクと連続命中メーター（右上・測量中）：上達の道を見える化
    if (state.phase === 'MEASURE' && state.rank) {
      const r = state.rank
      ctx.save()
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText(r.name, cv.width - 20, 32)
      if (r.needed != null) {
        // 次のランクまでのメーター（●=連続命中）右揃え
        const rad = 7, gap = 20
        const endX = cv.width - 20 - rad
        for (let i = 0; i < r.needed; i++) {
          const x = endX - (r.needed - 1 - i) * gap
          ctx.beginPath()
          ctx.arc(x, 52, rad, 0, Math.PI * 2)
          ctx.fillStyle = i < Math.min(r.streak, r.needed) ? '#ffdd00' : 'rgba(255,255,255,0.30)'
          ctx.fill()
          ctx.lineWidth = 2
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'
          ctx.stroke()
        }
        if (r.remaining > 0) {
          ctx.font = 'bold 15px sans-serif'
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.fillText(`あと${r.remaining}かいで ${r.nextName}`, cv.width - 20, 80)
        }
      } else {
        // 最高ランク：連続記録を見せる
        ctx.font = 'bold 15px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(`れんぞく ${r.streak}かい`, cv.width - 20, 56)
      }
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
  }

  // 音ON/OFFボタン（効果音とBGMを別々に切替）。矩形は game.js の _soundButtonRects 由来＝単一の真実。
  _drawSoundButtons(state) {
    if (!state.soundButtons) return
    const ctx = this._ctx
    const { rects, sfxOn, bgmOn } = state.soundButtons
    const drawToggle = (r, on, label) => {
      ctx.save()
      ctx.fillStyle = on ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.7)'
      roundRectPath(ctx, r.x, r.y, r.w, r.h, 10)
      ctx.fill()
      ctx.font = 'bold 17px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = on ? '#ffffff' : 'rgba(255,255,255,0.45)'
      ctx.fillText(label, r.x + r.w / 2, r.y + 28)
      ctx.restore()
    }
    drawToggle(rects.sfx, sfxOn, sfxOn ? '🔊 おと' : '🔇 おと')
    drawToggle(rects.bgm, bgmOn, bgmOn ? '🎵 きょく' : '🎵 きょく✕')
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
