// js/renderer.js
import { valueToX, getTicks } from './ruler.js'

const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg', 'island',
                     'ship-sink-1', 'ship-sink-2', 'ship-sink-3', 'binocular-frame', 'aim-panel',
                     'stage-bg', 'aim-pov', 'title-bg']

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
    // 測量中は数直線・船を双眼鏡レンズの中心高さへ上げる（枠PNGの下部に隠れないように）。
    // それ以外（結果の横視点など）は従来どおり画面下。
    const rulerY = (state.phase === 'MEASURE') ? Math.round(cv.height * 0.52) : this._rulerY()
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

    // タイトル画面：モードを大きな2ボタンで選ぶ（取り違え防止）
    if (state.phase === 'TITLE') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
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
      drawBtn(cv.width * 0.27, '#2e8b57', 'しょしんしゃ', 'じっくり・ヒントあり')
      drawBtn(cv.width * 0.73, '#c0531f', 'じょうきゅう', 'じかんせいげん・きおく')
      return
    }

    // 数直線（茶色のシンプルな1本線＋等間隔の縦目盛り。数字は両端だけ・PNG定規は廃止）。
    // AIM は手元パネルが別の数直線を持つので主数直線は描かない。
    if (state.phase !== 'AIM') {
      const ticks = getTicks(state.zoomMin, state.zoomMax, state.tickStep)

      // 基準線（細い茶色の1本）
      ctx.strokeStyle = '#3C2415'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(rsx, rulerY)
      ctx.lineTo(rex, rulerY)
      ctx.stroke()

      // 途中の目盛り（数字なし）
      ctx.textAlign = 'center'
      ticks.forEach(({ value, isMajor }) => {
        const x  = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
        const tH = isMajor ? 22 : 12
        ctx.strokeStyle = '#3C2415'
        ctx.lineWidth = isMajor ? 3 : 2
        ctx.beginPath()
        ctx.moveTo(x, rulerY - tH / 2)
        ctx.lineTo(x, rulerY + tH / 2)
        ctx.stroke()
      })

      // 両端だけ：長い縦線＋数字（最小・最大）。途中に数字を出さない＝「読む」必然を守る。
      ;[state.zoomMin, state.zoomMax].forEach((value) => {
        const x = valueToX(value, state.zoomMin, state.zoomMax, rsx, rex)
        ctx.strokeStyle = '#3C2415'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(x, rulerY - 30)
        ctx.lineTo(x, rulerY + 30)
        ctx.stroke()
        ctx.font = 'bold 26px sans-serif'
        ctx.lineWidth = 6
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'
        ctx.strokeText(String(value), x, rulerY - 36)
        ctx.fillStyle = '#3C2415'
        ctx.fillText(String(value), x, rulerY - 36)
      })
    }

    // 敵船（RESULT＋命中時は沈むコマアニメ／通常は静止）
    if (state.showShip) {
      const scale = (CFG.STAGES[state.stageIndex] && CFG.STAGES[state.stageIndex].enemyScale) || 1
      const shipW = CFG.ENEMY.SHIP_WIDTH  * scale
      const shipH = CFG.ENEMY.SHIP_HEIGHT * scale
      const centerY = rulerY - rulerH / 2 - shipH / 2
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

    // 霧（AIM/FIRE中に敵船を隠す）
    if (state.fog > 0) {
      const fogTop = 0
      const fogBottom = rulerY - rulerH / 2
      const grad = ctx.createLinearGradient(0, fogTop, 0, fogBottom)
      grad.addColorStop(0,   `rgba(255,255,255,${0.92 * state.fog})`)
      grad.addColorStop(1,   `rgba(255,255,255,${0.78 * state.fog})`)
      ctx.fillStyle = grad
      ctx.fillRect(0, fogTop, cv.width, fogBottom - fogTop)
    }

    // ── 射撃フェーズ（一人称・手元の照準パネル） ──
    if (state.phase === 'AIM' && state.aim) {
      ctx.save()
      const { sx, ex, y } = state.panelGeom
      const a = state.aim

      // 一人称の暗い前景（海・遠くの船は見えない）。霧(state.fog)に重ねて下半分を陣地色に。
      // ※renderer は CONFIG を import しない。設定は CFG(=this._CONFIG) 経由で読む。
      const horizon = y - CFG.AIM_PANEL.HEIGHT
      const fg = ctx.createLinearGradient(0, horizon - 80, 0, cv.height)
      fg.addColorStop(0, 'rgba(20,24,30,0.0)')
      fg.addColorStop(0.5, 'rgba(20,24,30,0.85)')
      fg.addColorStop(1, 'rgba(12,15,20,0.98)')
      ctx.fillStyle = fg
      ctx.fillRect(0, horizon - 80, cv.width, cv.height - (horizon - 80))

      // 砲口（奥へ向く＝向きだけ見える）。中央やや上に楕円の砲口。
      ctx.fillStyle = '#1b1b1f'
      ctx.beginPath()
      ctx.ellipse(cv.width / 2, horizon - 24, 46, 20, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#3a3a42'
      ctx.lineWidth = 8
      ctx.stroke()

      // 照準パネル PNG（土台）
      const ph = CFG.AIM_PANEL.HEIGHT
      if (this._imgs['aim-panel']) {
        ctx.drawImage(this._imgs['aim-panel'], sx - 30, y - ph / 2, (ex - sx) + 60, ph)
      } else {
        ctx.fillStyle = '#caa05a'
        roundRectPath(ctx, sx - 30, y - ph / 2, (ex - sx) + 60, ph, 16); ctx.fill()
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
        if (isMajor) ctx.fillText(String(value), tx, y - tH / 2 - 4)
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

    // 島＋大砲（横視点の足場・砲台）。射撃フェーズは一人称なので横向き大砲は描かない。
    if (state.phase !== 'AIM') {
      // 島（砲台の足場・数直線の外）
      const isl = CFG.ISLAND
      const islTop = rulerY - rulerH / 2 + 6  // 数直線帯の高さに足元を合わせる
      if (this._imgs['island']) {
        ctx.drawImage(this._imgs['island'],
          isl.CENTER_X - isl.WIDTH / 2, islTop - isl.HEIGHT, isl.WIDTH, isl.HEIGHT)
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
      if (state.hitResult === 'HIT' && this._imgs['splash']) {
        // 命中の爆発：序盤に大きく出て、徐々に薄く消える
        const a = rp < 0.45 ? 1 : Math.max(0, 1 - (rp - 0.45) / 0.3)
        if (a > 0) {
          const burst = 130
          const by = rulerY - rulerH / 2 - CFG.ENEMY.SHIP_HEIGHT * 0.5
          ctx.save()
          ctx.globalAlpha = a
          ctx.drawImage(this._imgs['splash'], state.landingX - burst / 2, by - burst / 2, burst, burst)
          ctx.restore()
        }
      } else if (state.hitResult !== 'HIT') {
        // はずれ：水しぶき
        ctx.fillStyle = '#4488ff'
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

    // 双眼鏡の覗き込み（MEASURE中）：レンズ外を黒で塞ぎ、その上に枠PNGを重ねる。
    if (state.phase === 'MEASURE') {
      const cy  = cv.height * 0.46
      const R   = Math.min(cv.width * 0.30, cv.height * 0.60)
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
      ctx.fillStyle = 'rgba(10,15,20,0.94)'
      ctx.fillRect(0, 0, cv.width, cv.height)
      ctx.restore()

      // 双眼鏡の枠PNG（レンズ内透過）を 2円にだいたい合わせて重ねる
      if (this._imgs['binocular-frame']) {
        const fw = (cxR - cxL) + R * 2.3
        const fh = fw * (this._imgs['binocular-frame'].height / this._imgs['binocular-frame'].width)
        ctx.drawImage(this._imgs['binocular-frame'], cv.width / 2 - fw / 2, cy - fh / 2, fw, fh)
      }
    }

    // タイマー＋進め方ヒント（MEASURE フェーズ・上級のみ）
    if (state.phase === 'MEASURE' && state.timerRemaining != null) {
      // タイマー（左上）
      ctx.font = 'bold 30px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillStyle = state.timerRemaining <= 5 ? '#ff5555' : '#ffffff'
      ctx.fillText(`⏱ ${state.timerRemaining}`, 20, 46)
      // 「読んで覚えたら そらをタップで発射へ」ヒント（上中央）
      ctx.font = 'bold 22px sans-serif'
      ctx.textAlign = 'center'
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth = 4
      const hint = 'おぼえたら そらを タップ！'
      ctx.strokeText(hint, cv.width / 2, 40)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(hint, cv.width / 2, 40)
    }

    // 段階名（右上・常時）
    if (state.phase === 'MEASURE') {
      ctx.save()
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(state.stageName ?? '', cv.width - 20, 32)
      ctx.restore()
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
