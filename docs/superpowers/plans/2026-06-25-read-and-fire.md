# 数直線バトル「数を読んで撃つ」実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 発射時に敵船を霧で隠し、子どもが「読んだ数」だけを頼りに数直線の目盛りから位置を割り出して撃つゲームへ作り替える。あわせて砲台を島に出し、命中判定の誤差を一本化する。

**Architecture:** 既存のフェーズ駆動Canvasゲーム（TITLE→MEASURE→AIM→FIRE→RESULT）を踏襲。ピュア関数（physics/measurement/ruler）はTDD、描画・DOM演出（renderer/game/index.html）は実装後にブラウザ＋実機で確認。新規アセット（島・砲弾）はマゼンタ背景をPythonでクロマキー除去して配置。

**Tech Stack:** バニラJS（ESモジュール）、Canvas 2D、node:test、Pillow（画像切り出し）、GitHub Pages。

## Global Constraints

- 横向きスマホ専用（portraitは回転オーバーレイで蓋）。
- 数直線レンジは 0〜1000。tickStep=1は使わない／レベル3の最細目盛り=5。
- ズーム3段：肉眼(LEVEL1 step100)→双眼鏡(LEVEL2 step10)→望遠鏡(LEVEL3 step5)。連続命中で解放（既存 UnlockState 維持）。
- 双眼鏡フレーム・霧は**Canvas描画**で実装する（PNGロード遅延で無音/未表示になる既知の罠を避ける）。
- 発射時に画面へ出さないもの3点：①敵船 ②正解位置マーカー ③着水点の現在数値。
- テスト実行：`npm test`（= `node --test tests/*.test.js`）。
- ブラウザ検証時はHTTPキャッシュ対策で import/script src に `?v=N` を付け、`location.replace(path+'?fresh='+Date.now())` で再読込する。
- アセットはPublicリポジトリに入れてよい（教材アプリ）。

---

### Task 1: 島・砲弾アセットの切り出し

**Files:**
- Create: `tools/cutout_single.py`
- Create (output): `assets/island.png`
- Overwrite (output): `assets/cannonball.png`（従来未使用の枠を実画像で埋める）

**Interfaces:**
- Produces: `assets/island.png`（島・透明背景・余白トリム済）, `assets/cannonball.png`（砲弾・透明背景・余白トリム済）

- [ ] **Step 1: 切り出しスクリプトを書く**

```python
#!/usr/bin/env python3
"""マゼンタ#FF00FF背景の単体スプライトをクロマキー除去し、余白をトリムして保存する。
使い方: python3 tools/cutout_single.py <入力png> <出力png>"""
import sys
from PIL import Image

def chroma_key(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mag = min(r, b) - g  # マゼンタ度（高いほど背景）
            if r > 170 and b > 170 and g < 120:
                px[x, y] = (r, g, b, 0)
            elif mag > 70:
                ng = min(255, g + mag // 2)
                alpha = max(0, 255 - mag * 2)
                px[x, y] = (r, ng, b, alpha)
    return img

def trim(img):
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img

if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    img = trim(chroma_key(Image.open(src)))
    img.save(out)
    print(f"saved {out}: {img.size[0]}x{img.size[1]}")
```

- [ ] **Step 2: 島と砲弾を切り出す**

Run:
```bash
cd ~/Workspace/suuchokusen-battle
python3 tools/cutout_single.py \
  "/Users/pokopy/.claude/uploads/5d6c31aa-157c-4d44-b444-8ebfc1de910f/3c234604-8500F98503FD42A9A07F19EF7FB9779D.png" \
  assets/island.png
python3 tools/cutout_single.py \
  "/Users/pokopy/.claude/uploads/5d6c31aa-157c-4d44-b444-8ebfc1de910f/c57d8bae-43CB33EFA01C4C5AB860C92098CE7C1F.png" \
  assets/cannonball.png
```
Expected: `saved assets/island.png: WxH` と `saved assets/cannonball.png: WxH` が出力され、マゼンタが消えていること。

- [ ] **Step 3: 透明化を目視確認**

Run: `python3 -c "from PIL import Image; im=Image.open('assets/island.png'); print(im.mode, im.size); print('corner alpha', im.getpixel((0,0))[3])"`
Expected: `RGBA`、四隅のalphaが0（背景が透明）。

- [ ] **Step 4: コミット**

```bash
git add tools/cutout_single.py assets/island.png assets/cannonball.png
git commit -m "feat: add island and cannonball sprites (chroma-keyed)"
```

---

### Task 2: 命中判定の純関数化＋ブレ撤廃

レビュー指摘5の解決。誤差源を「着水点の位置 vs 正解位置」の1つに絞る。`applyBlur`（測量誤差で砲弾がランダムにブレる仕組み）を判定経路から外す。

**Files:**
- Modify: `js/measurement.js`
- Modify: `js/game.js:145-181`（_fire と _showResult）
- Test: `tests/measurement.test.js`

**Interfaces:**
- Produces: `judgeHit(landingValue, targetValue, marginValue) -> boolean` — 着水点の値と正解値の差が許容幅以内かを返す純関数。
- Consumes: `xToValue`（ruler.js・既存）で着水点Xをvalueへ変換。

- [ ] **Step 1: judgeHit の失敗するテストを書く**

`tests/measurement.test.js` に追記：
```js
import { judgeHit } from '../js/measurement.js'

test('judgeHit: 差が許容幅以内なら命中', () => {
  assert.equal(judgeHit(360, 350, 30), true)   // 差10 <= 30
})
test('judgeHit: 差が許容幅ちょうどは命中', () => {
  assert.equal(judgeHit(380, 350, 30), true)   // 差30 <= 30
})
test('judgeHit: 差が許容幅超なら外れ', () => {
  assert.equal(judgeHit(400, 350, 30), false)  // 差50 > 30
})
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `npm test`
Expected: FAIL（`judgeHit` is not a function / not exported）。

- [ ] **Step 3: judgeHit を実装し、applyBlur を削除**

`js/measurement.js` に追加：
```js
// 着水点の値と正解値の差が許容幅以内なら命中
export function judgeHit(landingValue, targetValue, marginValue) {
  return Math.abs(landingValue - targetValue) <= marginValue
}
```
同ファイルから `applyBlur` 関数を削除する（YAGNI・誤差の二重化を断つ）。`generateTarget` と `calcMeasurementError` は残す。

- [ ] **Step 4: applyBlur のテストを削除**

`tests/measurement.test.js` 内の `applyBlur` を import/呼び出ししているテストを削除する。`import` 行から `applyBlur` を外す。

- [ ] **Step 5: game.js のブレ撤廃と判定差し替え**

`js/game.js` 冒頭の import を修正（`applyBlur` を外し `judgeHit` と `xToValue` を確保）：
```js
import { valueToX, xToValue, getZoomRange } from './ruler.js'
import { generateTarget, calcMeasurementError, judgeHit } from './measurement.js'
```
`_fire`（着弾Xを理想値のまま使う・ブレなし）:
```js
  _fire(shot) {
    this._cannonInput.detach()
    this._phase = 'FIRE'

    const rulerY  = this._canvas.height - CONFIG.RULER.Y_FROM_BOTTOM
    const cannonY = rulerY + CONFIG.CANNON.Y_FROM_RULER
    const cannonX = CONFIG.CANNON.X_FROM_LEFT

    const idealX  = calcLandingX(cannonX, cannonY, shot.power, shot.angleRad,
                                  CONFIG.PHYSICS.GRAVITY, rulerY)
    this._firedTrajectory = calcTrajectory(
      cannonX, cannonY, shot.power, shot.angleRad, CONFIG.PHYSICS.GRAVITY
    )
    this._landingX = idealX !== null ? idealX : (cannonX + 200)

    setTimeout(() => this._showResult(), 600)
  }
```
`_showResult`（judgeHit で判定）:
```js
  _showResult() {
    this._phase = 'RESULT'
    const rsx = CONFIG.RULER.MARGIN_X
    const rex = this._canvas.width - CONFIG.RULER.MARGIN_X
    const landingValue = xToValue(this._landingX, CONFIG.RULER.MIN, CONFIG.RULER.MAX, rsx, rex)
    const isHit = judgeHit(landingValue, this._targetValue, CONFIG.UNLOCK.HIT_MARGIN_VALUE)

    this._hitResult = isHit ? 'HIT' : 'MISS'
    this._unlock.recordHit(isHit)
    this._unlock.save()

    setTimeout(() => this._startMeasure(), 1800)
  }
```

- [ ] **Step 6: テストが通ることを確認**

Run: `npm test`
Expected: PASS（judgeHit 3件含め全テスト緑）。

- [ ] **Step 7: コミット**

```bash
git add js/measurement.js js/game.js tests/measurement.test.js
git commit -m "feat: single-source hit judgment, remove random blur (applyBlur)"
```

---

### Task 3: 砲台を島へ移設

問題②の解決。砲台を数直線の外（左の島）に乗せ、0や100も普通に狙える的にする。

**Files:**
- Modify: `js/config.js`（CANNON.X_FROM_LEFT、RULER.MARGIN_X、ISLAND 追加）
- Modify: `js/renderer.js`（島の描画、ASSET_NAMES に island 追加）
- Test: `tests/ruler.test.js`（valueToX が新マージンでも正しいこと・既存で担保、追加確認）

**Interfaces:**
- Consumes: `assets/island.png`（Task 1）
- Produces: 砲台中心X = `CONFIG.CANNON.X_FROM_LEFT`、数直線左端 = `CONFIG.RULER.MARGIN_X`（島の右）。

- [ ] **Step 1: config を更新**

`js/config.js` の RULER.MARGIN_X と CANNON.X_FROM_LEFT を、砲台が数直線左端より左（島の上）に来るよう調整し、ISLAND ブロックを追加：
```js
  RULER: {
    MIN: 0,
    MAX: 1000,
    Y_FROM_BOTTOM: 90,
    HEIGHT: 56,
    MARGIN_X: 150,       // 数直線の左端を島の右側へ（旧80）
  },
  // ...
  CANNON: {
    X_FROM_LEFT: 78,     // 砲台中心を島の上＝数直線の外へ（旧100）
    Y_FROM_RULER: -80,
    BLUR_FACTOR: 0.25,
    DRAG_MIN_PX: 20,
    DRAG_MAX_PX: 160,
    DRAG_SCALE: 5,
  },
  ISLAND: {
    CENTER_X: 78,        // 島の中心X（砲台と揃える）
    WIDTH: 150,
    HEIGHT: 70,
  },
```

- [ ] **Step 2: renderer に island をロード対象として追加**

`js/renderer.js:5` の ASSET_NAMES に `'island'` を加える：
```js
const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg', 'island']
```

- [ ] **Step 3: 島を大砲の下に描画**

`js/renderer.js` の大砲描画ブロック（`// 大砲` の直前）に島描画を挿入：
```js
    // 島（砲台の足場・数直線の外）
    const isl = CFG.ISLAND
    const islTop = rulerY - rulerH / 2 + 6  // 数直線帯の高さに足元を合わせる
    if (this._imgs['island']) {
      ctx.drawImage(this._imgs['island'],
        isl.CENTER_X - isl.WIDTH / 2, islTop - isl.HEIGHT, isl.WIDTH, isl.HEIGHT)
    }
```
（island.png が未ロードでもフォールバック不要：砲台は従来通り描かれる。）

- [ ] **Step 4: ブラウザで配置確認**

`index.html` の `<script ... src="js/game.js">` を一時的に `src="js/game.js?v=1"` にして preview を開き、`location.replace('index.html?fresh='+Date.now())` で再読込。砲台が島に乗り、数直線が島の右から始まり、0/100の的が島と被らないことを目視。確認後 `?v=1` は戻す。

- [ ] **Step 5: テスト（既存の座標変換が壊れていないこと）**

Run: `npm test`
Expected: PASS（ruler.test.js 含む全件）。

- [ ] **Step 6: コミット**

```bash
git add js/config.js js/renderer.js
git commit -m "feat: mount cannon on an island outside the number line"
```

---

### Task 4: 敵船の比率修正・フェーズ表示制御・霧

敵船の横伸びを直し（元517×560＝比0.92）、MEASURE/RESULTでは見せ、AIM/FIREでは霧で隠す。霧はCanvas描画。

**Files:**
- Modify: `js/config.js`（ENEMY の描画寸法を比率0.92へ）
- Modify: `js/renderer.js`（敵船の表示フェーズ制御、霧オーバーレイ）
- Modify: `js/game.js:42-61`（_buildState に「敵船を見せるか」「霧の濃さ」を渡す）

**Interfaces:**
- Consumes: `state.phase`
- Produces: `state.showShip`（boolean）, `state.fog`（0〜1の濃さ）を _buildState が返す。

- [ ] **Step 1: ENEMY の寸法を元画像比に直す**

`js/config.js` の ENEMY を修正（比0.92を保つ）：
```js
  ENEMY: {
    X_RATIO: 0.75,
    SHIP_WIDTH: 104,     // 高さ113 × 0.92（旧140＝横伸びの原因）
    SHIP_HEIGHT: 113,
  },
```

- [ ] **Step 2: _buildState に showShip と fog を追加**

`js/game.js` の `_buildState` の return に追記：
```js
      showShip:        this._phase === 'MEASURE' || this._phase === 'RESULT',
      fog:             (this._phase === 'AIM' || this._phase === 'FIRE') ? 1 : 0,
```

- [ ] **Step 3: 敵船の描画を showShip で条件化**

`js/renderer.js` の `// 敵船` ブロック全体を `if (state.showShip) { ... }` で囲う。既存の drawImage/フォールバックはそのまま中に入れる。

- [ ] **Step 4: 霧オーバーレイを描画**

`js/renderer.js` の敵船描画の直後に追加（海の上半分を白くもやで覆う）：
```js
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
```

- [ ] **Step 5: ブラウザで確認**

preview を `?v=` で再読込。MEASURE中は船が見え（横伸びが直っている）、ドラッグ（AIM）に入ると霧で船が隠れ、撃って結果が出ると霧が晴れて船が現れることを目視。

- [ ] **Step 6: テスト（回帰）**

Run: `npm test`
Expected: PASS。

- [ ] **Step 7: コミット**

```bash
git add js/config.js js/renderer.js js/game.js
git commit -m "feat: fix ship aspect ratio, hide ship behind fog during aim/fire"
```

---

### Task 5: 着水点のボヤけ・砲弾描画・正解マーカー無しの担保

着水点の印を「位置だけ・数値なし・ボヤけ」に。正解位置マーカーは出さない（現状も出していないことを確認）。放物線の先端に砲弾を描く。

**Files:**
- Modify: `js/renderer.js:141-190`（AIM予測ブロック、FIRE軌跡ブロック）

**Interfaces:**
- Consumes: `assets/cannonball.png`（Task 1）, `state.cannonPreview`, `state.firedTrajectory`

- [ ] **Step 1: 着弾予測点をボヤけ表現に差し替え**

`js/renderer.js` の AIM 予測ブロック内、着弾予測点（`// 着弾予測点（数直線上）と ▼ マーカー`）の描画を、数値なし・ボヤけた淡い円に置き換える（▼マーカーは残してよいが、正解マーカーではなく「自分の着水点」を示す印）：
```js
      const landX = calcLandingX(cannonX, cannonY, power, angleRad, CFG.PHYSICS.GRAVITY, rulerY)
      if (landX !== null) {
        // ボヤけた着水点（位置の印のみ・数値は出さない）
        const r = CFG.PHYSICS.PREVIEW_RADIUS
        const g = ctx.createRadialGradient(landX, rulerY, 0, landX, rulerY, r * 1.6)
        g.addColorStop(0, 'rgba(255,80,0,0.55)')
        g.addColorStop(1, 'rgba(255,80,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(landX, rulerY, r * 1.6, 0, Math.PI * 2)
        ctx.fill()
      }
```
（正解位置を示す印・敵船は AIM/FIRE では描かれない＝Task 4 で担保済み。ここで新たな正解マーカーを足さないこと。）

- [ ] **Step 2: 飛んでいる砲弾を軌跡先端に描画**

`js/renderer.js` の FIRE 軌跡ブロック（`// 砲弾軌跡（FIRE フェーズ）`）の末尾に、軌跡の最終点へ砲弾画像を描く：
```js
    if (state.firedTrajectory) {
      // ...既存の軌跡破線描画...
      const last = state.firedTrajectory[state.firedTrajectory.length - 1]
      if (this._imgs['cannonball'] && last) {
        const s = 26
        ctx.drawImage(this._imgs['cannonball'], last.x - s/2, last.y - s/2, s, s)
      }
    }
```

- [ ] **Step 3: ブラウザで確認**

preview 再読込。AIM中の着水点が淡くボヤけ、数値が出ていないこと。発射で砲弾が放物線の先に描かれること。

- [ ] **Step 4: テスト（回帰）**

Run: `npm test`
Expected: PASS。

- [ ] **Step 5: コミット**

```bash
git add js/renderer.js
git commit -m "feat: blurred aim marker (no value/no target marker), draw flying cannonball"
```

---

### Task 6: 初心者／上級者モード

メモ（読んだ数）の表示有無と測量タイマーの有無を切り替える。タイトルでモードを選ぶ。

**Files:**
- Modify: `js/config.js`（MODES 追加）
- Modify: `js/game.js`（モード状態、タイトルでの選択、メモ表示・タイマー分岐）
- Modify: `js/renderer.js`（タイトルのモード選択表示、発射中のメモ表示）
- Modify: `index.html`（必要なら選択ボタン。本プランではCanvasタップで選択するため不要）

**Interfaces:**
- Produces: `this._mode`（'beginner' | 'expert'）, `state.mode`, `state.memo`（初心者中は数値文字列、上級者は null）
- Consumes: `CONFIG.MODES`

- [ ] **Step 1: config に MODES を追加**

`js/config.js` に追加：
```js
  MODES: {
    beginner: { showMemo: true,  measureTimer: false },
    expert:   { showMemo: false, measureTimer: true  },
  },
```

- [ ] **Step 2: タイトルで左右タップによるモード選択**

`js/game.js` の `_onTitleTap` を、タップX座標で beginner/expert を選んで開始するよう変更。`start()` のタイトルタップ取得を座標付きに：
```js
  _onTitleTap(x) {
    if (this._phase !== 'TITLE') return
    // 画面左半分=初心者 / 右半分=上級者
    this._mode = (x !== undefined && x > this._canvas.width / 2) ? 'expert' : 'beginner'
    this._startMeasure()
  }
```
`start()` のリスナを座標付きに：
```js
    this._canvas.addEventListener('click',    (e) => this._onTitleTap(e.offsetX), { once: true })
    this._canvas.addEventListener('touchend', (e) => { e.preventDefault();
      const r = this._canvas.getBoundingClientRect()
      this._onTitleTap((e.changedTouches[0].clientX - r.left) * (this._canvas.width / r.width))
    }, { once: true, passive: false })
```
constructor に `this._mode = 'beginner'` を初期化として追加。

- [ ] **Step 3: タイマーをモードで分岐**

`js/game.js` の `_startMeasure` 内のタイマー設定を MODES で条件化：
```js
    if (CONFIG.MODES[this._mode].measureTimer) {
      this._timerRemaining = CONFIG.TIMER.MEASURE_SEC
      this._timerInterval = setInterval(() => {
        this._timerRemaining = Math.max(0, this._timerRemaining - 1)
        if (this._timerRemaining === 0) this._submitMeasure(0)
      }, 1000)
    } else {
      this._timerRemaining = null
    }
```

- [ ] **Step 4: メモを発射中に保持して state に渡す**

`_submitMeasure` で `this._measuredValue` は既に保持される。`_buildState` に追加：
```js
      mode: this._mode,
      memo: (CONFIG.MODES[this._mode].showMemo && this._measuredValue != null
             && (this._phase === 'AIM' || this._phase === 'FIRE'))
             ? String(this._measuredValue) : null,
```

- [ ] **Step 5: renderer でメモとモード選択を描画**

タイトル画面（`state.phase === 'TITLE'`）に2択の見出しを追加（「← しょしんしゃ」「じょうきゅう →」）。
発射中のメモ表示（AIM/FIRE で `state.memo` があるとき、画面上部に大きく「ねらえ ○○」）：
```js
    // 発射中のメモ（初心者モードのみ）
    if (state.memo) {
      ctx.font = 'bold 40px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffdd00'
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'
      ctx.lineWidth = 6
      const label = `ねらえ ${state.memo}`
      ctx.strokeText(label, cv.width / 2, 60)
      ctx.fillText(label, cv.width / 2, 60)
    }
```

- [ ] **Step 6: タイマー表示を null 対応に**

`js/renderer.js` のタイマー描画を `if (state.phase === 'MEASURE' && state.timerRemaining != null)` に変更（上級者のみ表示）。

- [ ] **Step 7: ブラウザで両モード確認**

preview 再読込。左タップ＝初心者（タイマーなし・発射中に「ねらえ○○」表示）、右タップ＝上級者（タイマーあり・メモ非表示）を目視。

- [ ] **Step 8: テスト（回帰）**

Run: `npm test`
Expected: PASS。

- [ ] **Step 9: コミット**

```bash
git add js/config.js js/game.js js/renderer.js
git commit -m "feat: beginner/expert modes (memo display + measure timer toggle)"
```

---

### Task 7: 双眼鏡の8の字フレーム（測量フェーズ）

MEASURE中に「覗いている」感を出す。Canvas描画（PNG不使用）。

**Files:**
- Modify: `js/renderer.js`（MEASURE時に8の字ビネットを最前面に描画）

**Interfaces:**
- Consumes: `state.phase === 'MEASURE'`

- [ ] **Step 1: 8の字ビネットを描画**

`js/renderer.js` の `drawFrame` 末尾（タイマー描画の前）に、MEASURE時だけ左右2円の外側を暗くするビネットを追加：
```js
    // 双眼鏡の覗き込みフレーム（MEASURE中）
    if (state.phase === 'MEASURE') {
      const cy = cv.height * 0.46
      const R  = Math.min(cv.width * 0.30, cv.height * 0.62)
      const cxL = cv.width / 2 - R * 0.82
      const cxR = cv.width / 2 + R * 0.82
      ctx.save()
      // 2円の和集合をくり抜いた外側を黒く塗る
      ctx.beginPath()
      ctx.rect(0, 0, cv.width, cv.height)
      ctx.arc(cxL, cy, R, 0, Math.PI * 2)
      ctx.arc(cxR, cy, R, 0, Math.PI * 2)
      ctx.fill('evenodd')   // 円の内側を除いた領域を塗る
      ctx.fillStyle = 'rgba(10,15,20,0.92)'
      ctx.fill('evenodd')
      ctx.restore()
      // 円周の白いにじみ
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.lineWidth = 10
      ctx.beginPath(); ctx.arc(cxL, cy, R, 0, Math.PI * 2); ctx.stroke()
      ctx.beginPath(); ctx.arc(cxR, cy, R, 0, Math.PI * 2); ctx.stroke()
    }
```
注意：`fill('evenodd')` で外側を塗るため、rect→2arc を同一パスに積む。塗り色を `fillStyle` で設定してから `fill('evenodd')` を1回呼ぶ形に整える（上記は手順の意図を示す。実装時は fillStyle 設定→単一 fill('evenodd') に統合する）。

- [ ] **Step 2: ブラウザで確認**

preview 再読込。MEASURE中だけ画面に双眼鏡の8の字の覗き穴（外周が暗い）がかかり、数直線・船・テンキーが穴の中で読めること。AIM以降は外れること。

- [ ] **Step 3: テスト（回帰）**

Run: `npm test`
Expected: PASS。

- [ ] **Step 4: コミット**

```bash
git add js/renderer.js
git commit -m "feat: binocular vignette overlay during measure phase"
```

---

### Task 8: テンキーを safe-area で内側へ

問題②の片割れ。iPhone横向きでノッチ/カメラとテンキーが干渉するのを safe-area-inset で内側に寄せる。

**Files:**
- Modify: `index.html`（#numpad, #display-input の CSS）

- [ ] **Step 1: numpad の right を safe-area 込みに**

`index.html` の `#numpad` の `right: 12px;` を：
```css
      right: calc(12px + env(safe-area-inset-right));
      bottom: calc(110px + env(safe-area-inset-bottom));
```
`#display-input` の `right: 210px;` と `top: 14px;` も safe-area を足す：
```css
      right: calc(210px + env(safe-area-inset-right));
      top: calc(14px + env(safe-area-inset-top));
```

- [ ] **Step 2: 実機（iPhone横向き）で確認**

ホーム画面に追加したPWAを横向きで開き、テンキーがノッチ/カメラに被らないことを確認。被りが残る場合は inset 加算値を増やす。

- [ ] **Step 3: コミット**

```bash
git add index.html
git commit -m "fix: inset numpad/display with safe-area for notch clearance"
```

---

## 仕上げ（全タスク後）

- [ ] 実機（横向きスマホ）で小2を想定したプレイ確認。初心者モードでメモを見ながら目盛りを読んで撃てるか、上級者モードが成立するか。
- [ ] `HIT_MARGIN_VALUE`（現30）・上級者タイマー秒数・霧/双眼鏡の濃さを実機の手応えで微調整。
- [ ] デプロイ（GitHub Pages は main push で自動反映）。

## 自己レビュー結果（spec照合）

- spec §3.1 感覚エイム封じ3点 → Task 4（船を隠す）+ Task 5（正解マーカー無し・着水点数値なし）+ Task 6（メモ＝数字のみ）で充足。
- spec §3.2/§5 物語・フェーズ・双眼鏡 → Task 7（双眼鏡）+ Task 4（霧）。
- spec §4 砲台を島へ → Task 3。
- spec §6 2モード → Task 6。
- spec §7 誤差一本化 → Task 2。
- spec §8 アセット（島・砲弾・船比率） → Task 1 + Task 4 Step1。
- spec §9 触るファイル → 全タスクで網羅。
- spec §10 テスト方針 → Task 2（judgeHit）+ 各タスクの回帰実行。
- 型整合：`judgeHit(landingValue, targetValue, marginValue)` は Task 2 で定義し game.js で同シグネチャ使用。`state.showShip/fog/memo/mode` は Task 4・6 で _buildState に定義し renderer で参照。一致を確認。
