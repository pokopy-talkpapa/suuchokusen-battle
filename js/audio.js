// js/audio.js
// 効果音とBGMは全部 Web Audio 合成（ファイル読み込みゼロ）。
// MP3等の音源ファイルはロード遅延で無音になる事故があるため使わない。
// iOSは最初のユーザー操作まで音を出せない → unlock() をタッチで呼ぶ。
const STORAGE_KEY = 'suuchokusen_audio_v1'

// 単音（周波数スライド・音量エンベロープ付き）。out を渡すとそこへ出力（BGMのエコー用）。
function tone(c, { type = 'sine', freq = 440, freqEnd = null, start = 0, dur = 0.2, vol = 0.3, attack = 0.01, out = null }) {
  const t0 = c.currentTime + start
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  o.connect(g).connect(out || c.destination)
  o.start(t0); o.stop(t0 + dur + 0.05)
}

// ノイズ（爆発・水しぶき・タンバリン用）
function noise(c, { start = 0, dur = 0.3, vol = 0.3, filterFreq = 1000, filterEnd = null, type = 'lowpass' }) {
  const t0 = c.currentTime + start
  const len = Math.ceil(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource(); src.buffer = buf
  const f = c.createBiquadFilter(); f.type = type
  f.frequency.setValueAtTime(filterFreq, t0)
  if (filterEnd) f.frequency.exponentialRampToValueAtTime(filterEnd, t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t0)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t0)
}

// 効果音の定義（at = 開始オフセット秒）。試聴ページでぽこぴぃ承認済みの音（2026-07-05）。
const SOUNDS = {
  tap(c, at) { tone(c, { type: 'triangle', freq: 900, freqEnd: 600, start: at, dur: 0.08, vol: 0.25 }) },
  needle(c, at) { noise(c, { start: at, dur: 0.04, vol: 0.15, filterFreq: 2500, type: 'bandpass' }) },
  fire(c, at) {
    tone(c, { type: 'sine', freq: 180, freqEnd: 60, start: at, dur: 0.25, vol: 0.5 })
    noise(c, { start: at, dur: 0.15, vol: 0.3, filterFreq: 800, filterEnd: 200 })
  },
  // 飛翔ヒュー：ゲームの砲弾飛翔時間（700ms）に合わせて demo の1.1秒から短縮
  whistle(c, at) { tone(c, { type: 'sine', freq: 1400, freqEnd: 400, start: at, dur: 0.7, vol: 0.15 }) },
  hit(c, at) {
    tone(c, { type: 'sine', freq: 880, start: at, dur: 0.12, vol: 0.3 })
    tone(c, { type: 'sine', freq: 660, start: at + 0.13, dur: 0.25, vol: 0.3 })
    noise(c, { start: at + 0.3, dur: 0.5, vol: 0.4, filterFreq: 1200, filterEnd: 100 })
    tone(c, { type: 'sine', freq: 100, freqEnd: 40, start: at + 0.3, dur: 0.5, vol: 0.4 })
  },
  miss(c, at) {
    tone(c, { type: 'sine', freq: 500, freqEnd: 120, start: at, dur: 0.3, vol: 0.3 })
    noise(c, { start: at + 0.05, dur: 0.35, vol: 0.2, filterFreq: 600, filterEnd: 150 })
  },
  rankup(c, at) {
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => {
      tone(c, { type: 'square', freq: f, start: at + i * 0.12, dur: i === 3 ? 0.5 : 0.14, vol: 0.15 })
      tone(c, { type: 'triangle', freq: f / 2, start: at + i * 0.12, dur: i === 3 ? 0.5 : 0.14, vol: 0.15 })
    })
  },
  setend(c, at) {
    const seq = [[523, 0], [587, 0.12], [659, 0.24], [784, 0.36], [1047, 0.5]]
    seq.forEach(([f, s], i) => {
      tone(c, { type: 'triangle', freq: f, start: at + s, dur: i === 4 ? 0.7 : 0.15, vol: 0.2 })
    })
    tone(c, { type: 'sine', freq: 1319, start: at + 0.5, dur: 0.7, vol: 0.1 })
  },
}

// BGM v2：海賊シャンティ風ループ（6/8拍子・4小節=48ステップ・150ms刻み）。
// v1（単音ピコピコ）がチープだったので、ベース＋和音の刻み＋メロディ2声＋打楽器＋エコーの編成に。
// コード進行: Am | F | C | E（ラ・フォリア系の海の哀愁）
const BGM = {
  stepMs: 150,
  steps: 48,
  // step: [周波数, 長さ秒]。各小節の頭(0,6拍目)で ルート＋5度
  bass: {
    0: [110.0, 0.45],  6: [164.8, 0.28],   // Am: A2, E3
    12: [87.31, 0.45], 18: [130.8, 0.28],  // F:  F2, C3
    24: [130.8, 0.45], 30: [196.0, 0.28],  // C:  C3, G3
    36: [82.41, 0.45], 42: [123.5, 0.28],  // E:  E2, B2
  },
  // 裏拍(3,9拍目)の和音の刻み（シャンティの「チャッ」）
  chords: {
    3: [220.0, 261.6, 329.6],  9: [220.0, 261.6, 329.6],  // Am
    15: [174.6, 220.0, 261.6], 21: [174.6, 220.0, 261.6], // F
    27: [196.0, 261.6, 329.6], 33: [196.0, 261.6, 329.6], // C/G
    39: [164.8, 207.7, 246.9], 45: [164.8, 207.7, 246.9], // E
  },
  // step: [周波数, 長さ(ステップ数)]。Aマイナーの歌もの旋律
  melody: {
    0: [440, 2], 3: [523, 1], 5: [494, 1], 6: [440, 2], 9: [330, 2],
    12: [349, 2], 15: [440, 1], 17: [392, 1], 18: [349, 2], 21: [262, 2],
    24: [330, 2], 27: [392, 1], 29: [349, 1], 30: [330, 1], 32: [294, 1], 33: [262, 2],
    36: [247, 2], 39: [294, 1], 41: [262, 1], 42: [247, 2], 45: [330, 2],
  },
}
const NEEDLE_MIN_INTERVAL_MS = 50 // 針コリコリ音の最短間隔（ドラッグ中の鳴らしすぎ防止）

export class AudioManager {
  constructor({ sfxOn = true, bgmOn = true } = {}) {
    this.sfxOn = sfxOn
    this.bgmOn = bgmOn
    this._ctx = null
    this._bgmTimer = null
    this._bgmStep = 0
    this._melBus = null
    this._lastNeedleAt = 0
  }

  // 最初のユーザー操作（touchstart/mousedown）で呼ぶ。iOSの自動再生制限対策。
  unlock() {
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext)
    if (!AC) return
    if (!this._ctx) this._ctx = new AC()
    if (this._ctx.state === 'suspended') this._ctx.resume()
  }

  play(name, at = 0) {
    if (!this.sfxOn) return
    this.unlock() // ユーザー操作起点の呼び出しならここで生成・再開できる
    if (!this._ctx) return
    const fn = SOUNDS[name]
    if (fn) fn(this._ctx, at)
  }

  // 針ドラッグ音は間引いて鳴らす（毎フレーム鳴るとノイズの壁になる）
  playNeedle(now = Date.now()) {
    if (!this._needleReady(now)) return
    this._lastNeedleAt = now
    this.play('needle')
  }

  _needleReady(now) {
    return now - this._lastNeedleAt >= NEEDLE_MIN_INTERVAL_MS
  }

  startBgm() {
    if (!this.bgmOn || !this._ctx || this._bgmTimer) return
    this._bgmTick()
    this._bgmTimer = setInterval(() => this._bgmTick(), BGM.stepMs)
  }

  stopBgm() {
    if (this._bgmTimer) clearInterval(this._bgmTimer)
    this._bgmTimer = null
    this._bgmStep = 0
  }

  isBgmPlaying() { return this._bgmTimer != null }

  // メロディ用エコーバス（船上の広がり感）。ドライ＋ディレイ0.27s×フィードバックで薄く残響
  _melodyBus() {
    if (this._melBus) return this._melBus
    const c = this._ctx
    const bus = c.createGain()
    bus.gain.value = 1
    bus.connect(c.destination) // ドライ
    const delay = c.createDelay(1)
    delay.delayTime.value = 0.27
    const fb = c.createGain(); fb.gain.value = 0.3
    const wet = c.createGain(); wet.gain.value = 0.25
    bus.connect(delay); delay.connect(fb); fb.connect(delay)
    delay.connect(wet); wet.connect(c.destination)
    this._melBus = bus
    return bus
  }

  _bgmTick() {
    const c = this._ctx
    const step = this._bgmStep % BGM.steps
    const beat = step % 12 // 6/8の1小節=12ステップ

    // ベース（ルート＋1オクターブ下を重ねて太く）
    const b = BGM.bass[step]
    if (b) {
      tone(c, { type: 'triangle', freq: b[0], dur: b[1], vol: 0.13 })
      tone(c, { type: 'sine', freq: b[0] / 2, dur: b[1], vol: 0.09 })
    }

    // 裏拍の和音の刻み
    const ch = BGM.chords[step]
    if (ch) ch.forEach(f => tone(c, { type: 'triangle', freq: f, dur: 0.13, vol: 0.035, attack: 0.005 }))

    // メロディ（2声：主声＋わずかにずらした副声=コーラス感、エコーバスへ）
    const m = BGM.melody[step]
    if (m) {
      const dur = m[1] * (BGM.stepMs / 1000) * 0.92
      const out = this._melodyBus()
      tone(c, { type: 'triangle', freq: m[0], dur, vol: 0.10, attack: 0.02, out })
      tone(c, { type: 'square', freq: m[0] * 1.004, dur, vol: 0.022, attack: 0.02, out })
    }

    // 打楽器：小節頭にドン・6拍目にシャン・裏拍にチッ
    if (beat === 0) tone(c, { type: 'sine', freq: 150, freqEnd: 55, dur: 0.12, vol: 0.18 })
    if (beat === 6) noise(c, { dur: 0.06, vol: 0.055, filterFreq: 6000, type: 'highpass' })
    if (beat === 3 || beat === 9) noise(c, { dur: 0.03, vol: 0.03, filterFreq: 8000, type: 'highpass' })

    this._bgmStep++
  }

  toggleSfx() {
    this.sfxOn = !this.sfxOn
    this.save()
    return this.sfxOn
  }

  toggleBgm() {
    this.bgmOn = !this.bgmOn
    this.save()
    if (!this.bgmOn) this.stopBgm()
    return this.bgmOn
  }

  save() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sfxOn: this.sfxOn, bgmOn: this.bgmOn }))
  }

  static load() {
    if (typeof localStorage === 'undefined') return new AudioManager()
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      return new AudioManager(data)
    } catch {
      return new AudioManager()
    }
  }
}
