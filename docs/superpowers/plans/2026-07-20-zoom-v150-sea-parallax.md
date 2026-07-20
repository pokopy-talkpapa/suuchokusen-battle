# ズーム演出の詰め v1.50（構え位置・段階倍率・海パララックス） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実機FB2件（10窓で敵が大きく見えない＋数直線を隠す／海が動かずズームに見えない）を、①敵の足元を下寄りに ②段階ごとの倍率直接指定 ③海のパララックス、の3点セットで解消する。

**Architecture:** すべて連続ズームレベル（log10(spanRatio)、全体=0・100窓=1・10窓=2）に対する**レベル別テーブル＋線形補間**で表現する。計算は `js/camera.js` の純関数に集約し、renderer は戻り値を使うだけ。数直線の既存ズーム補間アニメ（game.js の zoomDisp が renderer に補間中の zoomMin/zoomMax を渡す）に乗るため、追加のアニメ機構は作らない。

**Tech Stack:** バニラJS（ESモジュール）・Canvas 2D・`node --test`。ビルドなし。

**Spec:** `docs/superpowers/specs/2026-07-20-zoom-v150-sea-parallax-design.md`

## Global Constraints

- 既存テスト107本を1本も壊さない（`npm test` 緑のまま。camera.test.js の旧パラメータ依存テストの書き換えは Task 1 に含む）
- 内部の数直線スケール 0〜1000（`CONFIG.RULER.MIN/MAX`）を変更しない
- 測量窓・命中判定・スコアのルールは変えない。触るのは見た目だけ
- ズームが起きない場面（FIRE/RESULT・みならいの測量）は倍率1.0・足元0.55H・海等倍＝v1.49と1pxも変わらない
- 調整用の数値は `config.js` の `ZOOM_ENEMY` / `ZOOM_SEA` に集約。マジックナンバーを散らさない
- ブランチは `feat/zoom-v150`（作成済み・設計書コミット済み）。main への push＝公開なので、公開はぽこぴぃさんの実機確認後

## File Structure

- Modify: `js/camera.js` — enemyCamScale の中身を BY_LEVEL 補間に書き換え＋`enemyAnchorFrac`・`seaCamera`・`seaSourceRect` を追加（内部共通部品 `zoomLevelOf`・`lerpByLevel` は非export）
- Modify: `js/config.js` — `ZOOM_ENEMY` の作り替え＋`ZOOM_SEA` 新設
- Modify: `js/renderer.js` — 背景描画（102行目付近）と敵配置（334行目付近）の配線
- Test: `tests/camera.test.js` — 旧パラメータ依存テストの書き換え＋新規テスト

---

### Task 1: enemyCamScale を BY_LEVEL 補間に書き換える

**Files:**
- Modify: `js/camera.js`
- Test: `tests/camera.test.js`

**Interfaces:**
- Produces: `enemyCamScale(zoomMin, zoomMax, CONFIG, zoomable=true) -> number`（シグネチャ不変・中身のみ変更）。CONFIG は `CONFIG.ZOOM_ENEMY.BY_LEVEL`（数値3要素配列 [全体, 100窓, 10窓]）と `STATIC_SCALE` を読む
- Produces（ファイル内部・非export）: `zoomLevelOf(zoomMin, zoomMax, CONFIG) -> number`（0〜2の連続値）、`lerpByLevel(table, level) -> number`（範囲外クランプつき線形補間）。Task 2・3 が同ファイル内で使う

- [ ] **Step 1: テストを書き換える（失敗する状態にする）**

`tests/camera.test.js` の CFG とテスト本体を以下に置き換える（isZoomableScene のテスト3本は既存のまま残す）:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enemyCamScale, isZoomableScene } from '../js/camera.js'

// テスト用の最小 CONFIG（実値に依存しないよう自前で持つ＝config調整で壊れない）
const CFG = {
  RULER: { MIN: 0, MAX: 1000 },
  ZOOM_ENEMY: {
    BY_LEVEL: [0.45, 2.0, 3.4],
    ANCHOR_BY_LEVEL: [0.55, 0.62, 0.70],
    STATIC_SCALE: 1.0,
    STATIC_ANCHOR: 0.55,
    TOP_MARGIN: 16,
  },
  ZOOM_SEA: { SCALE_BY_LEVEL: [1.0, 1.15, 1.3], PAN_FACTOR: 0.15 },
}

test('倍率はレベル別テーブルどおり（全体/100窓/10窓）', () => {
  assert.equal(enemyCamScale(0, 1000, CFG), 0.45)   // 全体=level0
  assert.equal(enemyCamScale(400, 500, CFG), 2.0)   // 100窓=level1
  assert.equal(enemyCamScale(440, 450, CFG), 3.4)   // 10窓=level2
})

test('中間の窓では滑らかに補間される（単調増加）', () => {
  const full = enemyCamScale(0, 1000, CFG)
  const mid1 = enemyCamScale(300, 600, CFG)  // 300窓＝全体と100窓の間
  const win100 = enemyCamScale(400, 500, CFG)
  const mid2 = enemyCamScale(420, 450, CFG)  // 30窓＝100窓と10窓の間
  const win10 = enemyCamScale(440, 450, CFG)
  assert.ok(full < mid1 && mid1 < win100, '全体〜100窓が単調増加')
  assert.ok(win100 < mid2 && mid2 < win10, '100窓〜10窓が単調増加')
})

test('10窓より狭い窓ではテーブル末尾でクランプ（それ以上大きくならない）', () => {
  assert.equal(enemyCamScale(500, 500.5, CFG), 3.4)
})

test('全体ビューでの倍率は 1.0 未満（ちっぽけなシルエット）', () => {
  assert.ok(enemyCamScale(0, 1000, CFG) < 1.0)
})

test('ズームの無い場面では STATIC_SCALE を返す（答え合わせ・みならい）', () => {
  assert.equal(enemyCamScale(0, 1000, CFG, false), 1.0)
  assert.equal(enemyCamScale(440, 450, CFG, false), 1.0)
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test 2>&1 | tail -5`
Expected: FAIL（旧実装は 100窓で 2.0 ちょうどを返さない）

- [ ] **Step 3: enemyCamScale を書き換える**

`js/camera.js` の `enemyCamScale` と冒頭コメントを以下に置き換える（isZoomableScene は触らない）:

```js
// js/camera.js
// 敵・海の描画をカメラのズームに連動させる純関数群。今見えている数直線の窓（zoomMin〜zoomMax）
// が狭いほど「敵に近づいた」とみなす。連続ズームレベル（全体=0・100窓=1・10窓=2、中間は連続値）
// に対するレベル別テーブル＋線形補間で、倍率・足元の高さ・海の寄りをすべて表現する。
// game.js のズーム補間アニメが補間中の zoomMin/zoomMax を渡してくるので、ここをテーブル補間に
// するだけで全部が同じアニメに乗って滑らかに動く。調整値は CONFIG.ZOOM_ENEMY / ZOOM_SEA。
//
// ただし「ちっぽけ→ズームで大きく」はズームが起きる場面でしか成立しない。ズームの無い場面
// （答え合わせ＝FIRE/RESULT、ズームを持たないみならいの測量）まで効かせると、一番の見せ場である
// 撃沈アニメが崩れるだけで得が無い。そこで zoomable=false のときは STATIC_* の等倍・定位置を返す。

// 連続ズームレベル: 全体=0・100窓=1・10窓=2。それより狭い窓は呼び出し側のテーブル補間で
// 末尾クランプされる
function zoomLevelOf(zoomMin, zoomMax, CONFIG) {
  const { MIN, MAX } = CONFIG.RULER
  const span = Math.max(1, zoomMax - zoomMin)
  const spanRatio = (MAX - MIN) / span
  return Math.log10(Math.max(1, spanRatio))
}

// レベル別テーブルの線形補間。level はテーブル範囲 [0, table.length-1] にクランプ
function lerpByLevel(table, level) {
  const max = table.length - 1
  const t = Math.min(Math.max(level, 0), max)
  const i = Math.min(Math.floor(t), max - 1)
  return table[i] + (table[i + 1] - table[i]) * (t - i)
}

// 敵の描画倍率。renderer はこの戻り値を meta.scale に掛ける。
// 撃沈アニメの寸法も renderer 側で同じ倍率から導出されるため、ここを直せば演出全体が揃う。
export function enemyCamScale(zoomMin, zoomMax, CONFIG, zoomable = true) {
  if (!zoomable) return CONFIG.ZOOM_ENEMY.STATIC_SCALE
  return lerpByLevel(CONFIG.ZOOM_ENEMY.BY_LEVEL, zoomLevelOf(zoomMin, zoomMax, CONFIG))
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test 2>&1 | tail -5`
Expected: PASS（全テスト緑）

- [ ] **Step 5: Commit**

```bash
git add js/camera.js tests/camera.test.js
git commit -m "feat: 敵の倍率を段階ごとの直接指定（BY_LEVEL）に変更"
```

---

### Task 2: 敵の足元の高さ enemyAnchorFrac を作る

**Files:**
- Modify: `js/camera.js`
- Test: `tests/camera.test.js`

**Interfaces:**
- Consumes: Task 1 の `zoomLevelOf`・`lerpByLevel`（同ファイル内部関数）
- Produces: `enemyAnchorFrac(zoomMin, zoomMax, CONFIG, zoomable=true) -> number`（敵の足元の画面高さ割合。0.55=水平線）。CONFIG は `ZOOM_ENEMY.ANCHOR_BY_LEVEL` と `STATIC_ANCHOR` を読む

- [ ] **Step 1: 失敗するテストを書く**

`tests/camera.test.js` の import に `enemyAnchorFrac` を足し、末尾に追加:

```js
test('足元の高さはレベル別テーブルどおり＋中間は補間', () => {
  assert.equal(enemyAnchorFrac(0, 1000, CFG), 0.55)   // 全体=水平線
  assert.equal(enemyAnchorFrac(400, 500, CFG), 0.62)  // 100窓
  assert.equal(enemyAnchorFrac(440, 450, CFG), 0.70)  // 10窓=手前(下)に構える
  const mid = enemyAnchorFrac(420, 450, CFG)          // 30窓
  assert.ok(mid > 0.62 && mid < 0.70, '中間は補間される')
})

test('足元: ズームの無い場面では STATIC_ANCHOR（水平線）固定', () => {
  assert.equal(enemyAnchorFrac(440, 450, CFG, false), 0.55)
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test 2>&1 | tail -5`
Expected: FAIL with "enemyAnchorFrac is not a function"（または import エラー）

- [ ] **Step 3: 実装**

`js/camera.js` の `enemyCamScale` の直後に追加:

```js
// 敵の足元（接地線）の画面高さ割合。全体ビューでは水平線（0.55）に乗り、近づくほど画面手前
// （下）に構える遠近法で、数直線との間の余白を稼ぐ。renderer はこの割合×画面高さを足元にする。
export function enemyAnchorFrac(zoomMin, zoomMax, CONFIG, zoomable = true) {
  if (!zoomable) return CONFIG.ZOOM_ENEMY.STATIC_ANCHOR
  return lerpByLevel(CONFIG.ZOOM_ENEMY.ANCHOR_BY_LEVEL, zoomLevelOf(zoomMin, zoomMax, CONFIG))
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/camera.js tests/camera.test.js
git commit -m "feat: 敵の足元をズームレベルで下寄りに構える enemyAnchorFrac"
```

---

### Task 3: 海のパララックス seaCamera / seaSourceRect を作る

**Files:**
- Modify: `js/camera.js`
- Test: `tests/camera.test.js`

**Interfaces:**
- Consumes: Task 1 の `zoomLevelOf`・`lerpByLevel`
- Produces: `seaCamera(zoomMin, zoomMax, enemyXFrac, CONFIG, zoomable=true) -> {scale, panFrac}`（enemyXFrac=敵中心Xの画面幅割合0〜1）。CONFIG は `ZOOM_SEA.SCALE_BY_LEVEL` と `PAN_FACTOR` を読む
- Produces: `seaSourceRect(imgW, imgH, scale, panFrac, horizon=0.53, crop=0.96) -> {sx, sy, sw, sh}`（drawImage のソース矩形。水平線を不動点に拡大・横パン・画像端クランプ済み）

- [ ] **Step 1: 失敗するテストを書く**

`tests/camera.test.js` の import に `seaCamera, seaSourceRect` を足し、末尾に追加:

```js
test('海の拡大率はレベル別テーブルどおり', () => {
  assert.equal(seaCamera(0, 1000, 0.5, CFG).scale, 1.0)
  assert.equal(seaCamera(400, 500, 0.5, CFG).scale, 1.15)
  assert.equal(seaCamera(440, 450, 0.5, CFG).scale, 1.3)
})

test('海のパン: 敵が中央なら0・右寄りなら正・左寄りなら負', () => {
  assert.equal(seaCamera(440, 450, 0.5, CFG).panFrac, 0)
  assert.ok(seaCamera(440, 450, 0.8, CFG).panFrac > 0)
  assert.ok(seaCamera(440, 450, 0.2, CFG).panFrac < 0)
})

test('海: ズームの無い場面では等倍・パンなし', () => {
  assert.deepEqual(seaCamera(440, 450, 0.8, CFG, false), { scale: 1, panFrac: 0 })
})

test('seaSourceRect: 等倍・パンなしは現行描画と同一（全幅・上端0・crop 0.96）', () => {
  const r = seaSourceRect(2000, 1000, 1.0, 0)
  assert.equal(r.sx, 0)
  assert.equal(Math.round(r.sy), 0)
  assert.equal(r.sw, 2000)
  assert.equal(r.sh, 960)
})

test('seaSourceRect: 拡大しても水平線(画像53%)がソース矩形内の同じ割合(53/96)に居続ける', () => {
  const r = seaSourceRect(2000, 1000, 1.3, 0)
  const horizonFracInRect = (1000 * 0.53 - r.sy) / r.sh
  assert.ok(Math.abs(horizonFracInRect - 0.53 / 0.96) < 1e-9)
})

test('seaSourceRect: 大きくパンしても画像の端を超えない', () => {
  const r1 = seaSourceRect(2000, 1000, 1.3, 5)   // 極端な右パン
  assert.ok(r1.sx >= 0 && r1.sx + r1.sw <= 2000)
  const r2 = seaSourceRect(2000, 1000, 1.3, -5)  // 極端な左パン
  assert.ok(r2.sx >= 0 && r2.sx + r2.sw <= 2000)
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test 2>&1 | tail -5`
Expected: FAIL（seaCamera 未定義の import エラー）

- [ ] **Step 3: 実装**

`js/camera.js` の `enemyAnchorFrac` の直後に追加:

```js
// 海（背景）のカメラ。ズームが深いほど背景も拡大し、敵の横位置に応じて同方向へ流す
// （パララックス）。ズーム補間中に敵が横へ滑ると海も一緒に流れ「カメラが敵に寄る」ように見える。
export function seaCamera(zoomMin, zoomMax, enemyXFrac, CONFIG, zoomable = true) {
  if (!zoomable) return { scale: 1, panFrac: 0 }
  const level = zoomLevelOf(zoomMin, zoomMax, CONFIG)
  return {
    scale: lerpByLevel(CONFIG.ZOOM_SEA.SCALE_BY_LEVEL, level),
    panFrac: (enemyXFrac - 0.5) * CONFIG.ZOOM_SEA.PAN_FACTOR,
  }
}

// 背景画像から切り出すソース矩形。水平線（画像高さ horizon）を不動点に scale 倍へ拡大し、
// panFrac（画像幅に対する割合）だけ横へずらす。等倍・パンなしなら現行の全面描画
// （0 〜 imgH*crop）と完全一致。矩形は画像の端を超えないようクランプ（黒帯・引き伸ばし防止）。
export function seaSourceRect(imgW, imgH, scale, panFrac, horizon = 0.53, crop = 0.96) {
  const sw = imgW / scale
  const sh = imgH * crop / scale
  // canvas 上の水平線の割合（≈0.552）。ソース矩形内でも水平線がこの割合に来るよう sy を決める
  const canvasHorizon = horizon / crop
  let sy = imgH * horizon - canvasHorizon * sh
  let sx = imgW / 2 + panFrac * imgW - sw / 2
  sx = Math.min(Math.max(sx, 0), imgW - sw)
  sy = Math.min(Math.max(sy, 0), imgH - sh)
  return { sx, sy, sw, sh }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add js/camera.js tests/camera.test.js
git commit -m "feat: 海のパララックス（水平線不動点の拡大＋敵連動パン）seaCamera/seaSourceRect"
```

---

### Task 4: config.js と renderer.js の配線

**Files:**
- Modify: `js/config.js:26-32`（ZOOM_ENEMY の作り替え＋ZOOM_SEA 新設）
- Modify: `js/renderer.js:100-102`（背景）・`js/renderer.js:326-337`（敵配置）・冒頭の import

**Interfaces:**
- Consumes: Task 1〜3 の `enemyCamScale` / `enemyAnchorFrac` / `seaCamera` / `seaSourceRect`（`./camera.js`）

- [ ] **Step 1: config.js を書き換える**

`js/config.js` の `ZOOM_ENEMY` ブロック（26〜32行目）を以下に置き換える:

```js
  ZOOM_ENEMY: {
    BY_LEVEL: [0.45, 2.0, 3.4],          // 敵の倍率: [全体, 100窓, 10窓]。中間は線形補間
    ANCHOR_BY_LEVEL: [0.55, 0.62, 0.70], // 足元の高さ(画面割合): 近づくほど手前(下)に構える
    STATIC_SCALE: 1.0,   // ズームが起きない場面での倍率。答え合わせ（FIRE/RESULT）と
                         // ズームを持たないみならいの測量に使う。1.0＝この演出を入れる前と同じ大きさ
    STATIC_ANCHOR: 0.55, // 同・足元。0.55＝水平線（従来の接地位置）
    TOP_MARGIN: 16,      // 敵の上端と数直線の最低すき間px（数直線を隠さない安全装置）
  },
  ZOOM_SEA: {
    SCALE_BY_LEVEL: [1.0, 1.15, 1.3], // 海の拡大率: [全体, 100窓, 10窓]。水平線を不動点に拡大
    PAN_FACTOR: 0.15,                  // 敵の横ずれ(画面幅割合)に対する海の流れ量
  },
```

- [ ] **Step 2: renderer.js の import と共通変数を整える**

renderer.js 冒頭の camera.js import を以下に変更:

```js
import { enemyCamScale, enemyAnchorFrac, seaCamera, seaSourceRect, isZoomableScene } from './camera.js'
```

`drawFrame` 内、`const rulerY = ...`（84行目付近）の直後に共通変数を足す:

```js
    // ズーム演出（敵の倍率・足元・海の寄り）が効く場面か。背景と敵ブロックの両方で使う
    const stg = CFG.STAGES[state.stageIndex] || {}
    const zoomable = isZoomableScene(state.phase, stg)
```

※敵ブロック（321行目付近）の `const stg = CFG.STAGES[state.stageIndex] || {}` は重複になるので削除する。

- [ ] **Step 3: 背景描画をパララックス対応にする**

renderer.js の seaView 背景描画（100〜102行目付近）:

```js
      if (seaView) {
        // sea-open.pngの水平線は画像高さ約53%。crop=0.96なら canvas上53/96≈55%に来る。
        // ズーム中は水平線を不動点に拡大＋敵の横位置に応じてパン（seaSourceRect が端をクランプ）
        const cam = seaCamera(state.zoomMin, state.zoomMax,
                              (state.enemyX ?? cv.width / 2) / cv.width, CFG, zoomable)
        const r = seaSourceRect(bgImg.width, bgImg.height, cam.scale, cam.panFrac)
        ctx.drawImage(bgImg, r.sx, r.sy, r.sw, r.sh, 0, 0, cv.width, cv.height)
      } else if (state.phase === 'TITLE') {
```

- [ ] **Step 4: 敵配置を足元テーブル＋安全キャップにする**

renderer.js の敵ブロック（変更前の 326〜337行目付近）を以下にする:

```js
      // ズームして見えている幅が狭いほど「敵に近づいた」ように大きく・画面手前（下寄り）に見せる
      // （双眼鏡で寄る感覚）。倍率・足元は CFG.ZOOM_ENEMY のレベル別テーブル（camera.js）。
      const camScale = enemyCamScale(state.zoomMin, state.zoomMax, CFG, zoomable)
      const shipW = meta.w * scale * camScale
      const shipH = meta.h * scale * camScale
      // 海の構図：敵底を anchorFrac（全体=水平線0.55、近づくほど手前=下）に乗せる。
      // 空とぶ敵（air>0）はそこから浮かせる。水平線Y = imgHorizon(53%) / crop(0.96) → 55.2%
      const anchorFrac = enemyAnchorFrac(state.zoomMin, state.zoomMax, CFG, zoomable)
      const airLift = (meta.air || 0) * cv.height
      const baseCenterY = seaView
        ? Math.round(cv.height * anchorFrac - shipH * 0.5)   // 足元基準（浮かせない位置）
        : rulerY - shipH / 2
      let centerY = baseCenterY - airLift            // 静止時：空とぶ敵は水面から浮かせる
      // 安全装置：敵の上端が数直線に食い込むなら、すき間 TOP_MARGIN を保つ位置まで押し下げる。
      // 過去FB「大きい船が目盛りを隠す」の再発防止はこのキャップが担う
      if (seaView) {
        centerY = Math.max(centerY, rulerY + CFG.ZOOM_ENEMY.TOP_MARGIN + shipH / 2)
      }
```

※直後の `sinking` ブロックは `baseCenterY` を使っているが、RESULT は zoomable=false で
anchorFrac=0.55 になるため v1.49 と同一位置。変更不要。

- [ ] **Step 5: テスト全体が緑のままなことを確認**

Run: `npm test 2>&1 | tail -5`
Expected: PASS（全テスト緑）

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/renderer.js
git commit -m "feat: ズーム演出v1.50配線（足元テーブル・安全キャップ・海パララックス）"
```

---

### Task 5: ブラウザ検証

**Files:** なし（検証のみ。数値調整が要る場合は `js/config.js` のみ変更可）

- [ ] **Step 1: プレビュー起動**（kohal の `.claude/launch.json` の `suuchokusen-battle`、ポート3220）
- [ ] **Step 2: コンソールエラー0を確認**
- [ ] **Step 3: でんせつ（10窓あり）で測量→窓切替し、以下を目視確認**
  - 全体ビュー: 敵がちっぽけ（v1.49と同等）・海は等倍
  - 100窓: 敵が大きくなり少し手前に・海が少し寄る
  - 10窓: 敵がさらに大きく（100窓比で明確に伸びる）・足元が下寄り・**数直線に被らない**・海が1.3倍に寄り敵の方向へ流れる
  - 窓切替の瞬間、敵・海が同じアニメで滑らかに動く
- [ ] **Step 4: 発射→着弾（FIRE/RESULT）が v1.49 と同一（等倍・水平線接地・海全面）なこと、撃沈アニメの位置が崩れていないことを確認**
- [ ] **Step 5: みならい（measureMode:full）の測量が従来どおりなことを確認**
- [ ] **Step 6: 夕方（いっちょまえ）・夜（でんせつ）の背景でも水平線のズレ・端の黒帯が出ないことを確認**
- [ ] **Step 7: スクリーンショットを撮ってぽこぴぃさんに報告**

---

### Task 6: 公開（ぽこぴぃさんの実機確認OK後のみ）

- [ ] **Step 1: `VERSION` を v1.50 に上げて commit**
- [ ] **Step 2: main へマージ＋push（=GitHub Pages 自動公開）**
- [ ] **Step 3: 公開URLで動作確認・進捗台帳 `.superpowers/sdd/progress.md` を更新**
