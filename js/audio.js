// js/audio.js
// 効果音とBGMは全部 Web Audio 合成（ファイル読み込みゼロ）。
// MP3等の音源ファイルはロード遅延で無音になる事故があるため使わない。
// iOSは最初のユーザー操作まで音を出せない → unlock() をタッチで呼ぶ。
const STORAGE_KEY = 'suuchokusen_audio_v1'

// 単音（周波数スライド・音量エンベロープ付き）
function tone(c, { type = 'sine', freq = 440, freqEnd = null, start = 0, dur = 0.2, vol = 0.3, attack = 0.01 }) {
  const t0 = c.currentTime + start
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(vol, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  o.connect(g).connect(c.destination)
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

// BGM：海賊風ループ（32ステップ・140ms刻み）。A案＝合成ループ（承認済みの試作そのまま）。
const BGM_BASS = [110, 110, 165, 110, 98, 98, 147, 110] // A A E A G G D A
const BGM_MELODY = [
  440, 0, 523, 440, 659, 0, 587, 523,
  440, 0, 523, 587, 659, 784, 659, 0,
  587, 0, 523, 494, 523, 0, 587, 659,
  440, 523, 440, 0, 330, 0, 440, 0,
]
const BGM_STEP_MS = 140
const NEEDLE_MIN_INTERVAL_MS = 50 // 針コリコリ音の最短間隔（ドラッグ中の鳴らしすぎ防止）

export class AudioManager {
  constructor({ sfxOn = true, bgmOn = true } = {}) {
    this.sfxOn = sfxOn
    this.bgmOn = bgmOn
    this._ctx = null
    this._bgmTimer = null
    this._bgmStep = 0
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
    this._bgmTimer = setInterval(() => this._bgmTick(), BGM_STEP_MS)
  }

  stopBgm() {
    if (this._bgmTimer) clearInterval(this._bgmTimer)
    this._bgmTimer = null
    this._bgmStep = 0
  }

  isBgmPlaying() { return this._bgmTimer != null }

  _bgmTick() {
    const c = this._ctx
    const step = this._bgmStep % 32
    if (step % 2 === 0) {
      tone(c, { type: 'triangle', freq: BGM_BASS[(step / 2) % 8], dur: 0.22, vol: 0.12 })
    }
    const m = BGM_MELODY[step]
    if (m) tone(c, { type: 'square', freq: m, dur: 0.15, vol: 0.06 })
    if (step % 4 === 2) noise(c, { dur: 0.05, vol: 0.05, filterFreq: 6000, type: 'highpass' })
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
