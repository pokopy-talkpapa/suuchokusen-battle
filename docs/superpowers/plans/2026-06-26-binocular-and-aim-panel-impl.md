# 双眼鏡で読む ⇄ 手元の照準で撃つ（案1） 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「測量＝双眼鏡で船の周りを拡大して数を読む／射撃＝手元の照準パネル（別配置の数直線）に読んだ数を置いて撃つ」へ作り替え、画面位置の暗記で撃てる穴をふさぐ。

**Architecture:** ゲームを3フェーズ（測量MEASURE → 射撃AIM → 結果RESULT/FIRE）に再構成する。測量は「敵船の周りだけ」を段階別の倍率で自動枠取りして表示し、0〜1000全体の上に船を置いた絵は中盤以降では一度も見せない（位置記憶の素材を断つ）。射撃は岸の砲台の一人称ビュー＋画面下の木製照準パネルに全体スケールの数直線を描き、針をドラッグして読んだ値に合わせて撃つ。命中判定は「針を置いた値 vs 本当の船位置」の1本（ブレなし）。難易度（序盤=百だけ／中盤=百十・内分／上級=百十一・想像で一の位）は既存の連続命中アンロック（`UnlockState.maxLevel` 1/2/3）にそのまま対応させる。

**Tech Stack:** Vanilla ES Modules + Canvas 2D。テストは `node --test`（標準ライブラリのみ・依存ゼロ）。GitHub Pages 配信（main push で自動）。

## Global Constraints

以下は全タスク共通の絶対制約。タスクごとの要件に暗黙的に含まれる。

- **感覚エイム封じ3点（敵船・正解マーカー・着水点数値を AIM/FIRE 中に出さない）はゲームの芯。絶対崩さない。**
- **誤差は一本化（spec §6）**：着水点＝子どもが針を置いた値そのもの（ブレなし）。命中判定は「置いた値 vs 正解位置」の1本だけ。`applyBlur` は撤廃済を維持し、判定経路に戻さない。`calcMeasurementError` は記録専用で判定に使わない。
- **読む桁 ＞ 打つ桁 の1桁ズレは意図的**（内分の練習）。中盤で射撃目盛りを細かくしない。
- **対象＝小2〜4コア。レンジ 0〜1000・tickStep=1 は最上級の測量窓のみ許可**（射撃パネルの既定は粗くしない＝「だいたい」にしない）。
- **微調整値（`hitMargin` 等）はぽこぴぃ指定**。コードでは config に切り出してデフォルト値を置くだけにする。
- **双眼鏡レンズ内・霧・一人称の前景は Canvas 描画**（PNGロード遅延の罠を避ける）。船・双眼鏡枠・照準パネルは PNG。
- **テンキー：初級のみ（測量で読んだ数の入力＝メモ）。上級はテンキー無し（読んで記憶）。上級にテンキーを戻さない。**
- **push/公開はぽこぴぃの明示指示が出てから**。実機検証はハードリロード必須（古いESモジュールがキャッシュに残る罠）。
- 既存テスト方針：純粋関数は `node --test` で TDD。Canvas/DOM 描画はユニットテスト不可のため、各タスク末尾の「実機確認」で観察可能な期待値を明記して検証する。

---

## File Structure（このプランで触るファイル）

- `js/config.js`（修正）— `STAGES`（段階別パラメータ）、`AIM_PANEL`（照準パネル配置）、`NEEDLE`（針）を追加。旧 `CANNON` のドラッグ系フィールドと `ZOOM` の用途を整理。
- `js/stage.js`（新規）— `UnlockState.maxLevel` から現在段階を導く純粋関数。
- `js/ruler.js`（修正）— 測量の自動枠取り `getMeasureWindow(targetValue, stage, CONFIG)` を追加。既存 `valueToX/xToValue/getTicks` は再利用。旧 `getZoomRange`（タップズーム）は撤去。
- `js/physics.js`（修正）— 演出専用の放物線 `arcPoints(...)` を追加。`dragToShot`/`calcLandingX`/`calcTrajectory`（ドラッグ機構の名残）を撤去。
- `js/aim.js`（新規）— `AimInput`（照準パネル上の針ドラッグ＋発射＋上級ズーム）と純粋ヘルパ `hundredWindow(value)`。`js/cannon.js` を置き換える。
- `js/cannon.js`（削除）／`tests/cannon.test.js`（削除）
- `js/game.js`（修正）— 3フェーズ再配線。測量の自動枠取り・位置記憶リーク撤廃・段階駆動・針発射。
- `js/renderer.js`（修正）— 測量（ズーム窓＋窓内のみ船＋双眼鏡PNG枠）、射撃（一人称前景＋照準パネル＋針＋メモ）、結果（横視点の弧＋沈船）。
- `index.html`（修正なし想定。テンキーは現状維持）
- テスト：`tests/stage.test.js`（新規）、`tests/ruler.test.js`（修正）、`tests/aim.test.js`（新規）、`tests/physics.test.js`（差し替え）、`tests/measurement.test.js`（追記）。

---

## Task 1: 段階モデル（config STAGES ＋ stage.js）

**Files:**
- Modify: `js/config.js`
- Create: `js/stage.js`
- Test: `tests/stage.test.js`

**Interfaces:**
- Produces: `CONFIG.STAGES`（配列・要素は `{ name, measureMode, measureTickStep, targetStep, aim, hitMargin, enemyScale }`）。`stageIndexFromMaxLevel(maxLevel, CONFIG) -> number`、`currentStage(maxLevel, CONFIG) -> stageObj`。
- Consumes: 既存 `UnlockState.maxLevel`（1|2|3）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/stage.test.js` を新規作成：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stageIndexFromMaxLevel, currentStage } from '../js/stage.js'

const CFG = { STAGES: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }

test('maxLevel 1 → 段階0（序盤）', () => {
  assert.equal(stageIndexFromMaxLevel(1, CFG), 0)
})
test('maxLevel 2 → 段階1（中盤）', () => {
  assert.equal(stageIndexFromMaxLevel(2, CFG), 1)
})
test('maxLevel 3 → 段階2（上級）', () => {
  assert.equal(stageIndexFromMaxLevel(3, CFG), 2)
})
test('範囲外の maxLevel はクランプされる', () => {
  assert.equal(stageIndexFromMaxLevel(0, CFG), 0)
  assert.equal(stageIndexFromMaxLevel(9, CFG), 2)
})
test('currentStage は対応する STAGES 要素を返す', () => {
  assert.equal(currentStage(2, CFG).name, 'b')
})
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/stage.test.js`
Expected: FAIL（`Cannot find module '../js/stage.js'`）

- [ ] **Step 3: stage.js を実装**

`js/stage.js` を新規作成：

```js
// js/stage.js
// 段階（序盤/中盤/上級）は既存の連続命中アンロック maxLevel(1/2/3) にそのまま対応させる。
// 新しい永続化は持たない（spec §5 の「連続命中ベースの段階＝既存UNLOCK流用」）。
export function stageIndexFromMaxLevel(maxLevel, CONFIG) {
  const last = CONFIG.STAGES.length - 1
  return Math.max(0, Math.min(last, maxLevel - 1))
}

export function currentStage(maxLevel, CONFIG) {
  return CONFIG.STAGES[stageIndexFromMaxLevel(maxLevel, CONFIG)]
}
```

- [ ] **Step 4: config.js に STAGES を追加**

`js/config.js` の `CONFIG` オブジェクト内、`UNLOCK` の直後に以下を追加：

```js
  // 段階別パラメータ（序盤→中盤→上級）。maxLevel 1/2/3 に対応。
  // hitMargin・enemyScale はぽこぴぃ調整前提のデフォルト値。
  STAGES: [
    { // 序盤：百だけ。位置記憶OK（やさしい）。敵=大きい船。
      name: '序盤',
      measureMode: 'full',     // 測量は 0〜1000 全体（百の目盛り）
      measureTickStep: 100,
      targetStep: 100,         // 正解は100の倍数
      aim: { tickStep: 100, zoomable: false, zoomTickStep: null },
      hitMargin: 45,
      enemyScale: 1.25,
    },
    { // 中盤：百十まで読む。射撃は百のまま＝内分。敵=小型船。
      name: '中盤',
      measureMode: 'hundred',  // 測量は target を含む100窓（十の目盛り）
      measureTickStep: 10,
      targetStep: 10,          // 正解は10の倍数
      aim: { tickStep: 100, zoomable: false, zoomTickStep: null },
      hitMargin: 28,
      enemyScale: 0.9,
    },
    { // 上級：百十一まで読む。射撃はズーム後も百十まで（一の位は想像）。敵=ドローン相当。
      name: '上級',
      measureMode: 'ten',      // 測量は target を含む10窓（一の目盛り）
      measureTickStep: 1,
      targetStep: 1,           // 正解は1の倍数
      aim: { tickStep: 100, zoomable: true, zoomTickStep: 10 },
      hitMargin: 14,
      enemyScale: 0.65,
    },
  ],
```

- [ ] **Step 5: テストが通ることを確認**

Run: `node --test tests/stage.test.js`
Expected: PASS（5 tests）

- [ ] **Step 6: 全テストが壊れていないか確認**

Run: `npm test`
Expected: 既存テストはこの時点では全 PASS（config.js への追加は既存に影響しない）

- [ ] **Step 7: コミット**

```bash
git add js/stage.js js/config.js tests/stage.test.js
git commit -m "feat: stage model mapped onto unlock maxLevel (序盤/中盤/上級)"
```

---

## Task 2: 測量の自動枠取り（ruler.js getMeasureWindow）

**Files:**
- Modify: `js/ruler.js`
- Test: `tests/ruler.test.js`

**Interfaces:**
- Produces: `getMeasureWindow(targetValue, stage, CONFIG) -> { min, max, tickStep }`。`stage` は Task 1 の STAGES 要素。
- Consumes: `CONFIG.RULER.MIN`(0), `CONFIG.RULER.MAX`(1000)。
- 撤去：`getZoomRange`（タップでズーム場所を選ぶ旧方式は廃止）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/ruler.test.js` の末尾（`getTicks` テスト群の後）に追記。あわせてファイル先頭の import 行を差し替える：

import 行（1行目付近）を次へ変更：

```js
import { valueToX, xToValue, getMeasureWindow, getTicks } from '../js/ruler.js'
```

`getZoomRange` を使う既存テスト4本（`getZoomRange: ...`）と、その直前の `const CFG = { ZOOM: {...} }` ブロックを削除する。代わりに末尾へ追記：

```js
const SCFG = { RULER: { MIN: 0, MAX: 1000 } }
const full    = { measureMode: 'full',    measureTickStep: 100 }
const hundred = { measureMode: 'hundred', measureTickStep: 10 }
const ten     = { measureMode: 'ten',     measureTickStep: 1 }

test('getMeasureWindow: full は常に 0〜1000', () => {
  assert.deepEqual(getMeasureWindow(340, full, SCFG), { min: 0, max: 1000, tickStep: 100 })
})
test('getMeasureWindow: hundred・target=340 → 300〜400', () => {
  assert.deepEqual(getMeasureWindow(340, hundred, SCFG), { min: 300, max: 400, tickStep: 10 })
})
test('getMeasureWindow: ten・target=342 → 340〜350', () => {
  assert.deepEqual(getMeasureWindow(342, ten, SCFG), { min: 340, max: 350, tickStep: 1 })
})
test('getMeasureWindow: hundred・target=1000 は上端にクランプ', () => {
  assert.deepEqual(getMeasureWindow(1000, hundred, SCFG), { min: 900, max: 1000, tickStep: 10 })
})
test('getMeasureWindow: ten・target=0 は下端にクランプ', () => {
  assert.deepEqual(getMeasureWindow(0, ten, SCFG), { min: 0, max: 10, tickStep: 1 })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `node --test tests/ruler.test.js`
Expected: FAIL（`getMeasureWindow` 未定義・`getZoomRange` の import も消えている）

- [ ] **Step 3: ruler.js を実装**

`js/ruler.js` の `getZoomRange` 関数（13〜32行付近）を丸ごと削除し、代わりに次を追加：

```js
// 測量フェーズの双眼鏡が映す窓を target と段階から自動で決める。
// 子どもがタップでズーム場所を選ぶ旧方式は廃止（船の周りだけを自動枠取り）。
// measureMode: 'full'=0〜1000 / 'hundred'=targetを含む100窓 / 'ten'=targetを含む10窓
export function getMeasureWindow(targetValue, stage, CONFIG) {
  const GMIN = CONFIG.RULER.MIN
  const GMAX = CONFIG.RULER.MAX
  if (stage.measureMode === 'full') {
    return { min: GMIN, max: GMAX, tickStep: stage.measureTickStep }
  }
  const span = stage.measureMode === 'hundred' ? 100 : 10
  let min = Math.floor(targetValue / span) * span
  let max = min + span
  if (max > GMAX) { max = GMAX; min = max - span }
  if (min < GMIN) { min = GMIN; max = min + span }
  return { min, max, tickStep: stage.measureTickStep }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `node --test tests/ruler.test.js`
Expected: PASS（既存 valueToX/xToValue/getTicks ＋ getMeasureWindow 5本）

- [ ] **Step 5: コミット**

```bash
git add js/ruler.js tests/ruler.test.js
git commit -m "feat: auto-frame measure window from target+stage; drop tap-to-zoom"
```

---

## Task 3: 照準パネルの針ヘルパ（aim.js 純粋部）＋ physics 演出弧

**Files:**
- Create: `js/aim.js`（純粋ヘルパ部のみ。クラスは Task 6 で追加）
- Modify: `js/physics.js`
- Test: `tests/aim.test.js`, `tests/physics.test.js`（差し替え）

**Interfaces:**
- Produces: `hundredWindow(value) -> { min, max }`（value を含む100窓）。`arcPoints(x0, y0, x1, y1, steps=36, lift=160) -> [{x,y}, ...]`（演出専用の放物線・両端固定・中央が lift だけ持ち上がる）。
- 撤去：`physics.js` の `dragToShot`/`calcLandingX`/`calcTrajectory`。`js/cannon.js` と `tests/cannon.test.js`。

- [ ] **Step 1: 失敗するテストを書く（aim 純粋部）**

`tests/aim.test.js` を新規作成：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hundredWindow } from '../js/aim.js'

test('hundredWindow: 342 → 300〜400', () => {
  assert.deepEqual(hundredWindow(342), { min: 300, max: 400 })
})
test('hundredWindow: 700 → 700〜800', () => {
  assert.deepEqual(hundredWindow(700), { min: 700, max: 800 })
})
test('hundredWindow: 995 → 900〜1000', () => {
  assert.deepEqual(hundredWindow(995), { min: 900, max: 1000 })
})
test('hundredWindow: 0 → 0〜100', () => {
  assert.deepEqual(hundredWindow(0), { min: 0, max: 100 })
})
```

- [ ] **Step 2: 失敗するテストを書く（physics 演出弧）— physics.test.js を差し替え**

`tests/physics.test.js` を以下で**全置換**（dragToShot/calcLandingX/calcTrajectory のテストは撤去）：

```js
// tests/physics.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcPoints } from '../js/physics.js'

test('arcPoints: steps+1 個の点を返す', () => {
  assert.equal(arcPoints(0, 0, 100, 0, 20).length, 21)
})
test('arcPoints: 始点と終点は引数に一致', () => {
  const pts = arcPoints(10, 400, 800, 500, 36, 160)
  assert.equal(pts[0].x, 10)
  assert.equal(pts[0].y, 400)
  assert.equal(pts[pts.length - 1].x, 800)
  assert.equal(pts[pts.length - 1].y, 500)
})
test('arcPoints: 中央は直線より lift だけ上（Yが小さい）', () => {
  const pts = arcPoints(0, 100, 200, 100, 2, 160) // steps=2 → 中点が index1
  const straightMidY = 100
  assert.ok(pts[1].y < straightMidY, `中点Yは持ち上がる (got ${pts[1].y})`)
  assert.ok(Math.abs(pts[1].y - (straightMidY - 160)) < 0.001)
})
```

- [ ] **Step 3: 失敗を確認**

Run: `node --test tests/aim.test.js tests/physics.test.js`
Expected: FAIL（`../js/aim.js` 未作成・`arcPoints` 未定義）

- [ ] **Step 4: aim.js（純粋部）を実装**

`js/aim.js` を新規作成（この段階では純粋ヘルパだけ。`AimInput` クラスは Task 6 で追記）：

```js
// js/aim.js
// 照準パネル（手元の数直線）まわり。Task 3 では純粋ヘルパのみ。
// value を含む100窓（上級の射撃ズーム用）
export function hundredWindow(value) {
  const min = Math.floor(value / 100) * 100
  return { min, max: min + 100 }
}
```

- [ ] **Step 5: physics.js を作り替え**

`js/physics.js` を以下で**全置換**（ドラッグ機構の名残を撤去し、演出弧だけ残す）：

```js
// js/physics.js
// 結果フェーズの演出専用の放物線。
// (x0,y0)=砲口、(x1,y1)=着水点。両端を通り、中央が lift px だけ持ち上がる弧。
// ※命中判定には一切使わない（判定は「針を置いた値 vs 正解位置」の1本＝spec §6）。
export function arcPoints(x0, y0, x1, y1, steps = 36, lift = 160) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const base = y0 + (y1 - y0) * t
    const y = base - lift * 4 * t * (1 - t) // t=0.5 で頂点
    pts.push({ x, y })
  }
  return pts
}
```

- [ ] **Step 6: 旧 cannon ファイルを削除**

```bash
git rm js/cannon.js tests/cannon.test.js
```

- [ ] **Step 7: テストが通ることを確認**

Run: `node --test tests/aim.test.js tests/physics.test.js`
Expected: PASS（aim 4本・physics 3本）

- [ ] **Step 8: 全テスト確認（この時点では game/renderer 未改修でも純粋テストは緑）**

Run: `npm test`
Expected: PASS（stage / ruler / aim / physics / measurement / unlock）。
※注意：`game.js`/`renderer.js` はまだ `cannon.js`・旧 physics 関数を import しているが、これらはブラウザ実行時のみ評価されるため `npm test`（純粋モジュールのみ import）には影響しない。次タスクで実コードを直す。

- [ ] **Step 9: コミット**

```bash
git add js/aim.js js/physics.js tests/aim.test.js tests/physics.test.js
git commit -m "feat: aim hundredWindow + cosmetic arcPoints; remove drag physics & cannon.js"
```

---

## Task 4: 段階別 hitMargin の判定配線（measurement）

**Files:**
- Test: `tests/measurement.test.js`（追記）
- （`judgeHit` 自体は既存のまま流用。本タスクは「段階別 margin を渡す」契約をテストで固定する）

**Interfaces:**
- Consumes: 既存 `judgeHit(landingValue, targetValue, marginValue)`。`marginValue` に `currentStage(maxLevel, CONFIG).hitMargin` を渡す（実配線は Task 6）。
- Produces: なし（既存関数の利用契約を明文化）。

- [ ] **Step 1: テストを追記**

`tests/measurement.test.js` の末尾に追記（段階別 margin での挙動を固定）：

```js
import { currentStage } from '../js/stage.js'
import { CONFIG } from '../js/config.js'

test('段階別 hitMargin: 序盤(maxLevel1) は中盤(maxLevel2)より甘い', () => {
  const easy = currentStage(1, CONFIG).hitMargin
  const mid  = currentStage(2, CONFIG).hitMargin
  const hard = currentStage(3, CONFIG).hitMargin
  assert.ok(easy > mid && mid > hard, `序盤>中盤>上級 (${easy},${mid},${hard})`)
})
test('judgeHit: 上級 margin では序盤で当たる差が外れになりうる', () => {
  const target = 340
  const placed = 340 + 20 // 20ズレ
  const easy = currentStage(1, CONFIG).hitMargin // 45
  const hard = currentStage(3, CONFIG).hitMargin // 14
  assert.equal(judgeHit(placed, target, easy), true)
  assert.equal(judgeHit(placed, target, hard), false)
})
```

- [ ] **Step 2: テストが通ることを確認**

Run: `node --test tests/measurement.test.js`
Expected: PASS（Task1 のデフォルト値 45/28/14 で成立）

- [ ] **Step 3: コミット**

```bash
git add tests/measurement.test.js
git commit -m "test: pin per-stage hitMargin contract for judgeHit"
```

---

## Task 5: AimInput クラス（針ドラッグ＋発射＋上級ズーム）

**Files:**
- Modify: `js/aim.js`（クラス追加）
- Modify: `js/config.js`（NEEDLE 設定追加）

**Interfaces:**
- Produces: `class AimInput`。
  - `attach(canvas, CONFIG, panelGeom, onFire)` — `panelGeom = { sx, ex, y }`（パネル数直線の左X・右X・針のY）。`onFire(value:number)` を発射時に呼ぶ。
  - `getState() -> { needleValue:number, panelMin:number, panelMax:number, tickStep:number, zoomed:boolean }`（renderer が描画に使う）。
  - `setStage(stage)` — 段階を渡し `panelMin/Max/tickStep/zoomable` を初期化（既定は 0〜1000）。
  - `toggleZoom()` — 上級のみ。現在の針値を含む100窓へズーム（`hundredWindow` 利用）／全体へ戻す。
  - `detach()`。
- Consumes: `valueToX`,`xToValue`（ruler.js）、`hundredWindow`（aim.js）、`CONFIG.NEEDLE`。

- [ ] **Step 1: config に NEEDLE を追加**

`js/config.js` の `CONFIG` 内に追加（`STAGES` の後など末尾付近）：

```js
  AIM_PANEL: {
    MARGIN_X: 60,        // 照準パネル数直線の左右マージンpx
    HEIGHT: 92,          // パネルPNGの描画高さpx
    Y_FROM_BOTTOM: 70,   // 画面下端からパネル中心までのpx
  },
  NEEDLE: {
    WIDTH: 6,            // 針の太さpx
    HEAD_R: 16,          // 針の頭（つまみ）の半径px
    GRAB_PAD: 40,        // 針をつかめる左右の許容px
  },
```

- [ ] **Step 2: AimInput を実装（aim.js に追記）**

`js/aim.js` の末尾に追記：

```js
import { valueToX, xToValue } from './ruler.js'

export class AimInput {
  constructor() {
    this._canvas    = null
    this._CONFIG    = null
    this._geom      = null   // { sx, ex, y }
    this._onFire    = null
    this._stage     = null
    this._panelMin  = 0
    this._panelMax  = 1000
    this._tickStep  = 100
    this._zoomed    = false
    this._needleVal = 500
    this._dragging  = false
    this._handlers  = {}
  }

  setStage(stage) {
    this._stage    = stage
    this._panelMin = 0
    this._panelMax = 1000
    this._tickStep = stage.aim.tickStep
    this._zoomed   = false
    this._needleVal = 500
  }

  // 上級のみ：針値を含む100窓へズーム／戻す
  toggleZoom() {
    if (!this._stage || !this._stage.aim.zoomable) return
    if (this._zoomed) {
      this._panelMin = 0; this._panelMax = 1000
      this._tickStep = this._stage.aim.tickStep
      this._zoomed = false
    } else {
      const w = hundredWindow(this._needleVal)
      this._panelMin = w.min; this._panelMax = w.max
      this._tickStep = this._stage.aim.zoomTickStep
      this._zoomed = true
    }
  }

  getState() {
    return {
      needleValue: this._needleVal,
      panelMin:    this._panelMin,
      panelMax:    this._panelMax,
      tickStep:    this._tickStep,
      zoomed:      this._zoomed,
    }
  }

  _needleX() {
    return valueToX(this._needleVal, this._panelMin, this._panelMax, this._geom.sx, this._geom.ex)
  }

  attach(canvas, CONFIG, panelGeom, onFire) {
    this._canvas = canvas
    this._CONFIG = CONFIG
    this._geom   = panelGeom
    this._onFire = onFire

    const toX = (clientX) => {
      const rect = canvas.getBoundingClientRect()
      return (clientX - rect.left) * (canvas.width / rect.width)
    }
    const setFromX = (x) => {
      const sx = this._geom.sx, ex = this._geom.ex
      const cx = Math.max(sx, Math.min(ex, x))
      this._needleVal = xToValue(cx, this._panelMin, this._panelMax, sx, ex)
    }

    const onStart = (e) => {
      const pt = e.touches ? e.touches[0] : e
      const x  = toX(pt.clientX)
      // 針付近をつかんだ時だけドラッグ開始（つまみやすさ）。
      // それ以外でも、パネル帯の範囲内なら即その位置へ針を移動して掴む。
      if (Math.abs(x - this._needleX()) <= CONFIG.NEEDLE.GRAB_PAD ||
          (x >= this._geom.sx && x <= this._geom.ex)) {
        this._dragging = true
        setFromX(x)
      }
    }
    const onMove = (e) => {
      if (!this._dragging) return
      e.preventDefault()
      const pt = e.touches ? e.touches[0] : e
      setFromX(toX(pt.clientX))
    }
    const onEnd = () => { this._dragging = false }

    canvas.addEventListener('touchstart', onStart, { passive: true })
    canvas.addEventListener('touchmove',  onMove,  { passive: false })
    canvas.addEventListener('touchend',   onEnd)
    canvas.addEventListener('mousedown',  onStart)
    canvas.addEventListener('mousemove',  onMove)
    canvas.addEventListener('mouseup',    onEnd)
    this._handlers = { onStart, onMove, onEnd }
  }

  detach() {
    if (!this._canvas) return
    const { onStart, onMove, onEnd } = this._handlers
    this._canvas.removeEventListener('touchstart', onStart)
    this._canvas.removeEventListener('touchmove',  onMove)
    this._canvas.removeEventListener('touchend',   onEnd)
    this._canvas.removeEventListener('mousedown',  onStart)
    this._canvas.removeEventListener('mousemove',  onMove)
    this._canvas.removeEventListener('mouseup',    onEnd)
    this._canvas = null
    this._dragging = false
  }
}
```

> 注：`AimInput` は DOM/Canvas 依存のためユニットテスト対象外。純粋部（`hundredWindow`）は Task 3 で、座標変換は `valueToX/xToValue`（既存テスト済）で担保。挙動は Task 7 の実機確認で検証。

- [ ] **Step 3: import 解決だけ確認（構文エラーが無いこと）**

Run: `node --check js/aim.js`
Expected: 出力なし（exit 0）

- [ ] **Step 4: 全テストが緑のまま確認**

Run: `npm test`
Expected: PASS（aim.js への追記は既存純粋テストに影響しない）

- [ ] **Step 5: コミット**

```bash
git add js/aim.js js/config.js
git commit -m "feat: AimInput (needle drag on panel, fire, expert zoom)"
```

---

## Task 6: game.js を3フェーズへ再配線

**Files:**
- Modify: `js/game.js`
- Modify: `js/aim.js`（小掃除のみ＝Task 5 で `AimInput.attach` に残った未使用 `onFire` パラメータと `this._onFire` フィールドを撤去。発射は game.js のボタン当たり判定経由＝下記 `_fireFromButton`/`_fire` で行うため、コールバックは使わない）

**Interfaces:**
- Consumes: `currentStage`(stage.js)、`getMeasureWindow`(ruler.js)、`AimInput`(aim.js)、`arcPoints`(physics.js)、`valueToX`(ruler.js)、`generateTarget`,`judgeHit`(measurement.js)、`UnlockState`。
- Produces: `_buildState()` が renderer に渡す state（下記フィールドを追加）。

> **state 契約（renderer と共有・このタスクで確定）**：
> - `phase`: 'TITLE' | 'MEASURE' | 'AIM' | 'FIRE' | 'RESULT'
> - 測量用：`zoomMin, zoomMax, tickStep, targetValue, enemyX, showShip`
> - `stageIndex`（0/1/2）, `stageName`
> - 射撃用：`aim`（= `AimInput.getState()` か null）, `panelGeom`（{sx,ex,y}）, `memo`（string|null）, `canZoom`（boolean）
> - 結果用：`firedArc`（[{x,y}]|null）, `fireProgress`(0..1|null), `landingX`(number|null), `hitResult`('HIT'|'MISS'|null), `resultProgress`(0..1|null)
> - 共通：`mode`, `fog`(0/1), `timerRemaining`(number|null)

- [ ] **Step 1: import とコンストラクタを差し替え**

`js/game.js` 冒頭の import 群を差し替え：

```js
// js/game.js
import { CONFIG } from './config.js'
import { valueToX, getMeasureWindow } from './ruler.js'
import { arcPoints } from './physics.js'
import { generateTarget, judgeHit } from './measurement.js'
import { UnlockState } from './unlock.js'
import { Numpad } from './numpad.js'
import { AimInput } from './aim.js'
import { Renderer } from './renderer.js'
import { currentStage, stageIndexFromMaxLevel } from './stage.js'
```

コンストラクタのフィールドを差し替え（`_cannonInput` を `_aimInput` に、不要フィールドを整理）：

```js
  constructor() {
    this._canvas   = document.getElementById('game-canvas')
    this._renderer = new Renderer()
    this._numpad   = new Numpad()
    this._aimInput = new AimInput()
    this._unlock   = UnlockState.load(CONFIG)

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
    this._hitResult       = null
    this._fireStart       = null
    this._fireDuration    = 700
    this._resultStart     = null
    this._resultDuration  = 1800
  }
```

- [ ] **Step 2: `_buildState()` を差し替え**

```js
  _buildState() {
    const rsx = CONFIG.RULER.MARGIN_X
    const rex = this._canvas.width - CONFIG.RULER.MARGIN_X
    const enemyX = valueToX(this._targetValue, this._zoomMin, this._zoomMax, rsx, rex)

    const panelGeom = this._panelGeom()
    const aimState  = (this._phase === 'AIM') ? this._aimInput.getState() : null

    return {
      phase:          this._phase,
      zoomMin:        this._zoomMin,
      zoomMax:        this._zoomMax,
      tickStep:       this._tickStep,
      targetValue:    this._targetValue,
      enemyX,
      stageIndex:     this._stageIndex,
      stageName:      this._stage.name,
      // 測量で船を見せるのは「窓の中だけ」。RESULT は横視点で正解位置に船を出す（リール無し＝次は別の的）。
      showShip:       this._phase === 'MEASURE' || this._phase === 'RESULT',
      fog:            (this._phase === 'AIM' || this._phase === 'FIRE') ? 1 : 0,
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
                        ? Math.min(1, (performance.now() - this._resultStart) / this._resultDuration) : null,
      timerRemaining: this._timerRemaining,
    }
  }

  // 照準パネルの数直線ジオメトリ（renderer と AimInput で共有）
  _panelGeom() {
    const sx = CONFIG.AIM_PANEL.MARGIN_X
    const ex = this._canvas.width - CONFIG.AIM_PANEL.MARGIN_X
    const y  = this._canvas.height - CONFIG.AIM_PANEL.Y_FROM_BOTTOM
    return { sx, ex, y }
  }
```

- [ ] **Step 3: タイトル→測量の開始処理を差し替え**

`_onTitleTap` は現状維持（左=初級／右=上級）。`_startMeasure` を差し替え：

```js
  _startMeasure() {
    this._phase = 'MEASURE'
    // 段階＝連続命中アンロック maxLevel に対応
    this._stageIndex = stageIndexFromMaxLevel(this._unlock.maxLevel, CONFIG)
    this._stage      = currentStage(this._unlock.maxLevel, CONFIG)

    this._targetValue = generateTarget(CONFIG.RULER.MIN, CONFIG.RULER.MAX, this._stage.targetStep)
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
```

- [ ] **Step 4: 測量タップ（ズーム廃止・「そらタップで進む」だけ）に差し替え**

旧 `_handleZoomTap` を削除し、`_advanceFromMeasure` を残しつつ `_handleMeasureTap` を新設：

```js
  // 測量中のタップ：上級は「読んだ→射撃へ」進む合図（初級はテンキーのOKで進むので無視）。
  // ※タップでズーム場所を選ぶ旧仕様は廃止（双眼鏡は船の周りを自動枠取り）。
  _handleMeasureTap = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'MEASURE') return
    if (CONFIG.MODES[this._mode].showNumpad) return // 初級はテンキーで進む
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
```

- [ ] **Step 5: 射撃フェーズ（AimInput）に差し替え**

`_startAim` を差し替え。`_fire` は AimInput からの値で着水点を決める：

```js
  _startAim() {
    this._phase = 'AIM'
    this._aimInput.setStage(this._stage)
    // 発射はボタン（_handleAimButtons→_fireFromButton）で行う。AimInput はコールバックを取らない。
    this._aimInput.attach(this._canvas, CONFIG, this._panelGeom())
    // 発射ボタン／ズームボタンのタップを受ける（renderer がボタン矩形を描き、ここで当たり判定）
    this._canvas.addEventListener('click',    this._handleAimButtons)
    this._canvas.addEventListener('touchend', this._handleAimButtons, { passive: false })
  }

  // AIM 中のボタン当たり判定（発射・上級ズーム）。矩形は renderer と同じ計算式を使う。
  _handleAimButtons = (e) => {
    if (e.type === 'touchend') e.preventDefault()
    if (this._phase !== 'AIM') return
    const rect = this._canvas.getBoundingClientRect()
    const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX
    const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY
    const x = (clientX - rect.left) * (this._canvas.width  / rect.width)
    const y = (clientY - rect.top)  * (this._canvas.height / rect.height)

    const b = this._buttonRects()
    if (b.fire && this._inRect(x, y, b.fire)) { this._fireFromButton(); return }
    if (b.zoom && this._inRect(x, y, b.zoom)) { this._aimInput.toggleZoom(); return }
  }

  _fireFromButton() {
    const st = this._aimInput.getState()
    this._fire(st.needleValue)
  }

  _inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h }

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

    const rsx = CONFIG.RULER.MARGIN_X
    const rex = this._canvas.width - CONFIG.RULER.MARGIN_X
    const rulerY  = this._canvas.height - CONFIG.RULER.Y_FROM_BOTTOM
    const cannonX = CONFIG.CANNON.X_FROM_LEFT
    const cannonY = rulerY + CONFIG.CANNON.Y_FROM_RULER

    // 着水点＝置いた値そのもの（ブレなし）。横視点 0〜1000 で x に変換。
    this._landingValue = value
    this._landingX = valueToX(value, CONFIG.RULER.MIN, CONFIG.RULER.MAX, rsx, rex)
    this._firedArc = arcPoints(cannonX, cannonY, this._landingX, rulerY, 36, 180)

    this._fireStart = performance.now()
    setTimeout(() => this._showResult(), this._fireDuration)
  }
```

- [ ] **Step 6: 結果フェーズを差し替え**

```js
  _showResult() {
    this._phase = 'RESULT'
    const isHit = judgeHit(this._landingValue, this._targetValue, this._stage.hitMargin)
    this._hitResult = isHit ? 'HIT' : 'MISS'
    this._unlock.recordHit(isHit)
    this._unlock.save()

    this._fireStart   = null
    this._resultStart = performance.now()
    setTimeout(() => this._startMeasure(), this._resultDuration)
  }
```

- [ ] **Step 7: 構文チェック**

Run: `node --check js/game.js`
Expected: 出力なし（exit 0）

- [ ] **Step 8: 全テスト確認**

Run: `npm test`
Expected: PASS（純粋テストは不変）

- [ ] **Step 9: コミット**

```bash
git add js/game.js
git commit -m "feat: rewire game into 3 phases (measure window / aim panel / result arc)"
```

> この時点では renderer がまだ旧 state 前提なので画面は崩れる。次タスクで renderer を合わせる。実機確認は Task 8〜10 でまとめて行う。

---

## Task 7: renderer — タイトル＆共通の下ごしらえ（旧依存の除去）

**Files:**
- Modify: `js/renderer.js`

**Interfaces:**
- Consumes: 新 state（Task 6 の契約）。`getTicks`,`valueToX`(ruler.js)。`aim-panel`,`binocular-frame`,`ship-enemy`,`ship-sink-1..3`,`island`,`cannon`,`splash`,`cannonball`,`sea-bg`,`ruler-bg` の画像。
- 撤去：`renderer.js` 冒頭の `import { calcTrajectory, calcLandingX } from './physics.js'`（これらは削除済）。AIM のドラッグ着弾プレビュー描画。

- [ ] **Step 1: import とアセット名を更新**

`js/renderer.js` 冒頭を差し替え：

```js
// js/renderer.js
import { valueToX, getTicks } from './ruler.js'

const ASSET_NAMES = ['sea-bg', 'cannon', 'cannonball', 'ship-enemy', 'splash', 'ruler-bg', 'island',
                     'ship-sink-1', 'ship-sink-2', 'ship-sink-3', 'binocular-frame', 'aim-panel']
```

- [ ] **Step 2: 旧 AIM プレビュー（ドラッグ着弾の弧・砲身向き線・ボヤけ着弾円）を削除**

`drawFrame` 内の以下ブロックを削除：
- 「ドラッグ中：砲身の向きを線で表示」（`if (state.cannonPreview) { ... }`）
- 「着弾予測（AIM フェーズ）：放物線の弧 ＋ 着弾点マーカー」（`if (state.phase === 'AIM' && state.cannonPreview ...) { ... }`）
- 「砲弾の飛翔（FIRE フェーズ）」ブロックは Task 10 で `firedArc` ベースに作り替えるため、いったん残置可（次タスクで差し替え）。

- [ ] **Step 3: 構文チェック**

Run: `node --check js/renderer.js`
Expected: 出力なし（exit 0・`cannonPreview`/`calcTrajectory` 参照が消えていること）

- [ ] **Step 4: コミット**

```bash
git add js/renderer.js
git commit -m "refactor: drop drag-aim preview & dead physics import from renderer"
```

---

## Task 8: renderer — 測量フェーズ（ズーム窓＋窓内のみ船＋双眼鏡PNG枠）

**Files:**
- Modify: `js/renderer.js`

**Interfaces:**
- Consumes: `state.phase==='MEASURE'`, `zoomMin/zoomMax/tickStep`, `targetValue`, `enemyX`, `showShip`, `stageName`, `mode`, `timerRemaining`。
- Produces: 測量描画（双眼鏡フレーム PNG ＋ レンズ外マスク ＋ 窓内の船＋数直線）。

> **重要（位置記憶リーク防止）**：MEASURE では `enemyX` は `zoomMin/zoomMax` で射影された「窓内の」位置。中盤以降は窓そのものが画面（0〜1000全体は描かれない）ので、全体上に船を置いた絵は出ない。序盤(full)のみ 0〜1000 に船が出る＝意図どおり（位置記憶OKのやさしい段階）。

- [ ] **Step 1: 双眼鏡フレームを PNG に差し替え**

`drawFrame` 末尾近くの「双眼鏡の覗き込みフレーム（MEASURE中）」ブロック（`if (state.phase === 'MEASURE') { ... }` の Canvas 8の字マスク部）を、次へ差し替え：

```js
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
```

- [ ] **Step 2: 段階ラベルとヒントを更新**

「タイマー＋進め方ヒント（MEASURE フェーズ・上級のみ）」ブロックの直後、または同ブロック内に段階表示を追加。既存ヒント文の `hint` は据え置き。段階名を右上に描く：

```js
    // 段階名（右上・常時）
    if (state.phase === 'MEASURE') {
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(state.stageName ?? '', cv.width - 20, 32)
    }
```

- [ ] **Step 3: 船の窓内描画を確認（既存ロジック流用）**

既存「敵船」描画ブロックは `state.showShip` ＋ `state.enemyX` で動く。MEASURE では `enemyX` が窓内射影なのでそのまま窓内に出る。**変更不要**（RESULT の沈船も既存流用）。ただし MEASURE では沈船コマに入らない条件（`state.phase === 'RESULT'`）になっていることを確認するだけ。

- [ ] **Step 4: 実機確認（測量）**

Run（dev server 起動）: preview_start → ハードリロード。
観察する期待値：
- 初級で開始 → 双眼鏡PNG枠が中央に出て、レンズ内に数直線。**序盤は 0〜1000・目盛り100**、船が見える。右上に「序盤」。
- 連続命中で中盤に上がると（テスト時は localStorage を操作 or 連続命中）、レンズ内が **300〜400 など100窓・目盛り10**、船は窓の中だけ。**0〜1000全体に船が乗った絵は出ない**こと。
- レンズ外は黒く塞がれている。

検証補助（段階を強制する）：ブラウザ devtools で
`localStorage.setItem('suuchokusen_unlock_v1', JSON.stringify({level:1,streak:6,maxLevel:2}))` → ハードリロードで中盤、`maxLevel:3` で上級。

- [ ] **Step 5: コミット**

```bash
git add js/renderer.js
git commit -m "feat: measure phase renders binocular PNG + window-only ship + stage label"
```

---

## Task 9: renderer — 射撃フェーズ（一人称前景＋照準パネル＋針＋ボタン）

**Files:**
- Modify: `js/renderer.js`

**Interfaces:**
- Consumes: `state.phase==='AIM'`, `state.aim`（{needleValue,panelMin,panelMax,tickStep,zoomed}）, `state.panelGeom`（{sx,ex,y}）, `state.memo`, `state.canZoom`。
- Produces: 一人称前景・照準パネル PNG・パネル上の数直線＋目盛り＋針・発射/ズームボタン。
- **ボタン矩形は描かず `state.buttonRects`（game.js `_buttonRects()` 由来＝単一の真実）から読む**。`state.buttonRects.fire`（常時）、`state.buttonRects.zoom`（上級のみ・null あり）。

- [ ] **Step 1: 一人称前景＋照準パネル描画関数を追加**

`drawFrame` 内、霧ブロックの後に AIM 専用描画を追加：

```js
    // ── 射撃フェーズ（一人称・手元の照準パネル） ──
    if (state.phase === 'AIM' && state.aim) {
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
    }
```

- [ ] **Step 2: 構文チェック**

Run: `node --check js/renderer.js`
Expected: 出力なし

- [ ] **Step 3: 実機確認（射撃）**

ハードリロード後：
- 測量から進むと一人称の暗い前景＋中央に砲口＋画面下に木製パネルと数直線。
- 針をドラッグすると左右に動く。**敵船・正解マーカー・着水点数値は出ない**こと（封じ3点）。
- 初級は上部に「ねらえ ◯◯」メモ。上級はメモ無し。
- 上級のみ左下に「ズーム」ボタン → 押すとパネルが100窓・目盛り10、ラベル「もどす」。
- 右下「うつ！」ボタンがある。

- [ ] **Step 4: コミット**

```bash
git add js/renderer.js
git commit -m "feat: aim phase renders first-person foreground + panel number line + needle + buttons"
```

---

## Task 10: renderer — 結果フェーズ（横視点の弧＋命中/沈船）

**Files:**
- Modify: `js/renderer.js`

**Interfaces:**
- Consumes: `state.firedArc`([{x,y}]), `state.fireProgress`(0..1), `state.landingX`, `state.hitResult`, `state.resultProgress`, `state.phase`('FIRE'|'RESULT')。
- Produces: FIRE 中に弧を伸ばしつつ弾を飛ばす／RESULT で命中演出・沈船・はずれ水しぶき・文言。

- [ ] **Step 1: FIRE の弾飛翔を firedArc ベースに差し替え**

「砲弾の飛翔（FIRE フェーズ）」ブロックを次へ差し替え（`state.firedTrajectory` → `state.firedArc`）：

```js
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
```

- [ ] **Step 2: RESULT の着弾演出は既存流用（確認のみ）**

「着弾エフェクト（RESULT）」ブロックは `state.landingX`/`hitResult`/`resultProgress` で動くため**変更不要**。沈船コマ（敵船ブロック内 `sinking`）も既存流用。FIRE 中は霧で船が隠れ、RESULT で横視点（霧 0）になり船＋着弾が見える。

- [ ] **Step 3: 構文チェック ＆ 全テスト**

Run: `node --check js/renderer.js && npm test`
Expected: 構文OK・全テスト PASS

- [ ] **Step 4: 実機確認（結果・1サイクル通し）**

ハードリロード後、1ラウンドを通す：
- 「うつ！」→ 霧の中から弾が弧を描いて飛ぶ → 霧が晴れて横視点 → 針値の位置に着弾。
- 針値が正解±`hitMargin` 以内なら「命中！🎯」＋沈船3コマ＋一瞬フラッシュ＋splash。外れなら「はずれ💦」＋水しぶき。
- 数秒後に次の測量へループ。連続命中で段階が上がる（右上ラベルが 序盤→中盤→上級）。

- [ ] **Step 5: コミット**

```bash
git add js/renderer.js
git commit -m "feat: result phase flies cosmetic arc to needle landing; reuse hit/sink fx"
```

---

## Task 11: 敵サイズの段階差 ＋ 通し統合 ＋ 後始末

**Files:**
- Modify: `js/renderer.js`, `js/game.js`

**Interfaces:**
- Consumes: `state.stageIndex`（敵スケール参照に使用）, `CONFIG.STAGES[i].enemyScale`。

- [ ] **Step 1: 敵船のサイズを段階別スケールに**

`drawFrame` の敵船描画で、`shipW/shipH` に段階スケールを掛ける。敵船ブロック先頭を差し替え：

```js
    if (state.showShip) {
      const scale = (CFG.STAGES[state.stageIndex] && CFG.STAGES[state.stageIndex].enemyScale) || 1
      const shipW = CFG.ENEMY.SHIP_WIDTH  * scale
      const shipH = CFG.ENEMY.SHIP_HEIGHT * scale
```

（以降の `shipW/shipH` 参照はそのまま。沈船コマの `dW/dH` も `shipW/shipH` 由来なので自動でスケールする。）

- [ ] **Step 2: 構文チェック ＆ 全テスト**

Run: `node --check js/renderer.js && node --check js/game.js && npm test`
Expected: 構文OK・全テスト PASS

- [ ] **Step 3: 実機通し確認（3段階）**

localStorage で各段階を強制し、ハードリロードで通す：
- 序盤(maxLevel1)：0〜1000・百・大きい船・メモ「ねらえ ◯00」・百にピタッで命中しやすい。
- 中盤(maxLevel2)：測量は100窓・十／射撃は0〜1000・百のまま＝内分で置く・小型船。
- 上級(maxLevel3)：測量は10窓・一まで読める／射撃は「ズーム」で100窓・十、一の位は想像・最小の敵。
- 封じ3点（敵船・正解マーカー・着水点数値を AIM/FIRE で出さない）が全段階で守られていること。

- [ ] **Step 4: ライセンス/不要物の最終確認**

Run: `grep -rn "cannonPreview\|dragToShot\|calcLandingX\|getZoomRange\|firedTrajectory\|CannonInput" js/`
Expected: 一致なし（旧機構の参照が残っていない）。残っていれば該当箇所を削除。

- [ ] **Step 5: コミット**

```bash
git add js/renderer.js js/game.js
git commit -m "feat: per-stage enemy scale; remove residual drag-mechanic references"
```

---

## 実機検証の総まとめ（ハードリロード必須）

- ES module キャッシュで古い JS が残るため、検証のたびに**ハードリロード**（Cmd+Shift+R）。
- 段階の強制：devtools コンソールで
  `localStorage.setItem('suuchokusen_unlock_v1', JSON.stringify({level:1,streak:0,maxLevel:N}))`（N=1/2/3）→ ハードリロード。
- 検証の芯（spec の穴がふさがったか）：**中盤で「測量で見えた船の画面位置」と「射撃パネルでその数を置く画面位置」が一致しない**こと。一致するなら位置記憶が成立してしまっており失敗。
- 封じ3点の遵守を全段階・全モードで確認。

## デプロイ（ぽこぴぃの明示指示が出てから）

```bash
git push   # main push で GitHub Pages 自動デプロイ
```

公開URL: https://pokopy-talkpapa.github.io/suuchokusen-battle/

---

## 未確定（実機で詰める・微調整値はぽこぴぃ指定）

- `hitMargin`（序盤45/中盤28/上級14＝デフォルト）の手触り。敵サイズ連動で厳しくするかは保留。
- 一人称前景の作り込み（計器類・砲口の見せ方）。本プランは Canvas の機能版。アート差し替えは後フェーズ。
- 上級ズームの操作感（ボタン1つ／針を含む100窓へ）。
- ドローン専用アート（当面は ship-enemy.png の縮小で代替）。
- 沈船イラストの作り込み（ぽこぴぃが言及・別途）。
