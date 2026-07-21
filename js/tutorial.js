// js/tutorial.js
// チュートリアル＝「実際のプレイ画面での操作誘導（ガイド）」が本体。
// この DOM オーバーレイは冒頭の物語1枚（きみは砲手だよ）だけを担当する。
// 文字スライドで遊び方を説明しても子どもは読まないため、操作説明はすべて
// game.js/renderer.js のガイド（吹き出し＋ハイライト）側でやる(2026-07-06方針転換)。
const SEEN_KEY        = 'suuchokusen_tutorial_seen_v1'
const RANKUP_SEEN_KEY = 'suuchokusen_rankup_seen_v1'

// 初めてそのランクに上がった時だけ見せる説明カード。
// ポイントは「敵は遠くなるのではなく“小さくなる”」＝だからズームして細かく読む、を明言すること。
// icon は絵文字でなく実際の敵スプライト画像を使う（🚁だとゲーム内のドローンと絵が
// 違って混乱する・2026-07-08 実機FB）。「次に出てくる敵そのもの」を見せる。
const RANKUP_CARDS = {
  2: {
    img: 'assets/enemy-boat.webp',
    title: 'いっちょまえ砲手に ランクアップ！',
    body: [
      'こんどの てきは <b>ちいさい ふね</b>！',
      '🔍 ふねの あたりを タップすると <b>ズーム</b>して こまかい めもりが よめるよ！',
    ],
  },
  3: {
    img: 'assets/enemy-drone.webp',
    title: 'でんせつの砲手に ランクアップ！',
    body: [
      'てきは そらとぶ ドローン！ もっと <b>ちいさい</b>ぞ！',
      '🔍 ズームは <b>2かい</b> できる！ 1の めもりまで よもう！',
      '🏆 「<b>おぼえてうつ</b>」モードも かいほう！',
    ],
  },
  4: {
    img: 'assets/enemy-drone.webp',
    title: 'まぼろしの砲手に ランクアップ！',
    body: [
      '3と 4の あいだ… そこには まだ <b>かずの うみ</b>が かくれている！',
      '🔍 ズームして <b>3.4</b> みたいな <b>しょうすう</b>を よもう！',
    ],
  },
}

export class Tutorial {
  constructor() {
    this._overlay    = document.getElementById('tutorial-overlay')
    this._openBtn    = document.getElementById('tutorial-open-btn')
    this._startBtn   = document.getElementById('tutorial-start')
    this._endOverlay = document.getElementById('tutorial-end-overlay')
    this._endBtn     = document.getElementById('tutorial-end-close')
    this._rankupOverlay = document.getElementById('rankup-overlay')
    this._rankupIcon    = document.getElementById('rankup-icon')
    this._rankupTitle   = document.getElementById('rankup-title')
    this._rankupBody    = document.getElementById('rankup-body')
    this._rankupBtn     = document.getElementById('rankup-close')
    this._onClose    = null
    this._onEndClose = null
    this._onRankupClose = null
    this._guideRequested = false // 「あそびかた」ボタンで見返す時、次のプレイをもう一度ガイドする

    this._startBtn.addEventListener('click', () => this._close())
    this._openBtn.addEventListener('click', () => { this._guideRequested = true; this.show() })
    this._endBtn.addEventListener('click', () => {
      this._endOverlay.classList.remove('visible')
      if (this._onEndClose) this._onEndClose()
    })
    this._rankupBtn.addEventListener('click', () => {
      this._rankupOverlay.classList.remove('visible')
      const cb = this._onRankupClose
      this._onRankupClose = null
      if (cb) cb()
    })
  }

  hasSeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return true }
  }

  // ガイドを最後（発射）までやり切った時だけ「見た」扱いにする。
  // ようこそ画面を閉じただけでは記録しない＝途中でやめたら次のプレイでまたガイドする。
  markSeen() {
    this._guideRequested = false
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private modeなど失敗しても致命的ではない */ }
  }

  // 次のプレイをガイド付きにするか
  shouldGuide() { return this._guideRequested || !this.hasSeen() }

  isOpen() { return this._overlay.classList.contains('visible') }

  onClose(cb) { this._onClose = cb }
  onEndClose(cb) { this._onEndClose = cb }

  // 卒業カード：チュートリアル終了＋この先の楽しみ（ズーム解放・おぼえてうつ）の予告
  showEnd() {
    this.markSeen()
    this._endOverlay.classList.add('visible')
  }

  // ── ランクアップ説明カード（そのランクに初めて上がった時だけ） ──
  hasSeenRankUp(level) {
    try { return JSON.parse(localStorage.getItem(RANKUP_SEEN_KEY) || '{}')[level] === true }
    catch { return true }
  }

  markRankUpSeen(level) {
    try {
      const d = JSON.parse(localStorage.getItem(RANKUP_SEEN_KEY) || '{}')
      d[level] = true
      localStorage.setItem(RANKUP_SEEN_KEY, JSON.stringify(d))
    } catch { /* private modeなど失敗しても致命的ではない */ }
  }

  // ランクリセット時に呼ぶ＝最初からやり直す子には説明ももう一度見せる
  resetRankUpSeen() {
    try { localStorage.removeItem(RANKUP_SEEN_KEY) } catch { /* 同上 */ }
  }

  // カードを表示して既読にする。閉じたら onClose（次のラウンド開始）を呼ぶ。
  showRankUp(level, onClose) {
    const card = RANKUP_CARDS[level]
    if (!card) { if (onClose) onClose(); return }
    this._rankupIcon.innerHTML = `<img src="${card.img}" alt="" style="height:72px; vertical-align:middle;">`
    this._rankupTitle.textContent = card.title
    this._rankupBody.innerHTML = card.body.map(t => `<p>${t}</p>`).join('')
    this._onRankupClose = onClose
    this._rankupOverlay.classList.add('visible')
    this.markRankUpSeen(level)
  }

  // タイトル画面にいる間だけ「あそびかた」ボタンを出す
  setOpenButtonVisible(visible) {
    this._openBtn.classList.toggle('visible', visible)
  }

  show() { this._overlay.classList.add('visible') }

  _close() {
    this._overlay.classList.remove('visible')
    if (this._onClose) this._onClose()
  }
}
