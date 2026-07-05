import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioManager } from '../js/audio.js'

test('初期状態: 効果音もBGMもON', () => {
  const a = new AudioManager()
  assert.equal(a.sfxOn, true)
  assert.equal(a.bgmOn, true)
})

test('toggleSfx で ON/OFF が反転し、新しい状態を返す', () => {
  const a = new AudioManager()
  assert.equal(a.toggleSfx(), false)
  assert.equal(a.sfxOn, false)
  assert.equal(a.toggleSfx(), true)
})

test('toggleBgm で ON/OFF が反転する', () => {
  const a = new AudioManager()
  assert.equal(a.toggleBgm(), false)
  assert.equal(a.bgmOn, false)
})

test('BGM OFF のとき startBgm しても再生されない', () => {
  const a = new AudioManager({ bgmOn: false })
  a.startBgm()
  assert.equal(a.isBgmPlaying(), false)
})

test('AudioContext が無い環境では play/unlock/startBgm が安全に何もしない', () => {
  const a = new AudioManager()
  a.unlock()
  a.play('tap')
  a.playNeedle()
  a.startBgm() // ctx が無いので開始しない
  assert.equal(a.isBgmPlaying(), false)
  a.stopBgm()
})

test('針の音は最短間隔（50ms）で間引かれる', () => {
  const a = new AudioManager()
  assert.equal(a._needleReady(1000), true)
  a._lastNeedleAt = 1000
  assert.equal(a._needleReady(1030), false) // 30ms後はまだ
  assert.equal(a._needleReady(1050), true)  // 50ms後はOK
})

test('save/load で ON/OFF 設定が復元される', () => {
  const store = {}
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v },
  }
  try {
    const a = new AudioManager()
    a.toggleSfx() // OFF
    const b = AudioManager.load()
    assert.equal(b.sfxOn, false)
    assert.equal(b.bgmOn, true)
  } finally {
    delete globalThis.localStorage
  }
})

test('壊れた保存データでもデフォルトで起動する', () => {
  globalThis.localStorage = {
    getItem: () => '{{{broken',
    setItem: () => {},
  }
  try {
    const a = AudioManager.load()
    assert.equal(a.sfxOn, true)
    assert.equal(a.bgmOn, true)
  } finally {
    delete globalThis.localStorage
  }
})
