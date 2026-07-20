# ズーム演出の大胆化（敵サイズのカメラ連動） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ズームすると敵が「ちっぽけなシルエット→ぐんと大きく」変化し、目盛りの間にいるのが目で分かるようにする。既存3ランク（特にでんせつ）にも効かせる。

**Architecture:** 現在 `renderer.js` にベタ書きされている `camScale`（敵の描画倍率）の計算を、テスト可能な純関数 `enemyCamScale()` として `js/camera.js` に抜き出す。倍率カーブは全体ビューを今より小さく（FULL_SCALE<1）・最大ズームを今より大きく（MAX_SCALE>1.7）する対数カーブにし、`config.js` の定数で実機調整できるようにする。撃沈アニメの寸法も同じ `camScale` 由来なので、抜き出しだけで自動的に整合する。

**Tech Stack:** バニラJS（ESモジュール）・Canvas 2D・`node --test` によるユニットテスト。ビルドなし。

## Global Constraints

- 既存テスト98本を1本も壊さない（`npm test` が緑のまま）
- 内部の数直線スケールは現行の 0〜1000（`CONFIG.RULER.MIN`/`MAX`）を変更しない
- 既存3ランクの遊びのルール（測量窓・命中判定・スコア）は変えない。変えるのは敵の見た目の大きさだけ
- 調整用の数値は `config.js` の1か所に集約し、コードにマジックナンバーを散らさない
- ファイルは小さく単一責任に保つ（`camera.js` は敵サイズ計算だけを持つ）

---

### Task 1: 敵サイズのカメラ連動を純関数として作る（`js/camera.js`）

現在 `renderer.js:328-332` にある下記のベタ書きを、テスト可能な純関数へ抜き出し、カーブを大胆化する。

```js
// renderer.js の現状（抜き出し元）
const spanRatio = (CFG.RULER.MAX - CFG.RULER.MIN) / (state.zoomMax - state.zoomMin)
const zoomLevel = Math.log10(Math.max(1, spanRatio)) // 全体=0・100窓=1・10窓=2
const camScale = Math.min(1.7, 1 + zoomLevel * 0.35)
```

**Files:**
- Create: `js/camera.js`
- Modify: `js/config.js`（`CONFIG` に `ZOOM_ENEMY` ブロックを追加）
- Test: `tests/camera.test.js`

**Interfaces:**
- Consumes: `CONFIG.RULER.MIN`, `CONFIG.RULER.MAX`（既存）、`CONFIG.ZOOM_ENEMY.{FULL_SCALE, MAX_SCALE, CURVE}`（本タスクで追加）
- Produces: `enemyCamScale(zoomMin, zoomMax, CONFIG) -> number`。renderer が `meta.scale` に掛ける敵の描画倍率。全体ビューで `FULL_SCALE`、ズームが深いほど `MAX_SCALE` に近づく単調増加の値を返す。

- [ ] **Step 1: 失敗するテストを書く**

`tests/camera.test.js` を新規作成：

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enemyCamScale } from '../js/camera.js'

// テスト用の最小 CONFIG（実値に依存しないよう自前で持つ＝config調整で壊れない）
const CFG = {
  RULER: { MIN: 0, MAX: 1000 },
  ZOOM_ENEMY: { FULL_SCALE: 0.45, MAX_SCALE: 2.6, CURVE: 0.6 },
}

test('全体ビュー（0〜1000）では FULL_SCALE を返す', () => {
  assert.equal(enemyCamScale(0, 1000, CFG), 0.45)
})

test('ズームするほど大きくなる（単調増加）', () => {
  const full = enemyCamScale(0, 1000, CFG)   // 全体
  const win100 = enemyCamScale(400, 500, CFG) // 100窓
  const win10 = enemyCamScale(440, 450, CFG)  // 10窓
  assert.ok(win100 > full, '100窓は全体より大きい')
  assert.ok(win10 > win100, '10窓は100窓より大きい')
})

test('全体ビューは MAX_SCALE より小さい（伸びしろが残る）', () => {
  assert.ok(enemyCamScale(0, 1000, CFG) < CFG.ZOOM_ENEMY.MAX_SCALE)
})

test('最大ズームでも MAX_SCALE を超えない（上限で頭打ち）', () => {
  // 極端に狭い窓（1未満）でも上限を破らない
  assert.ok(enemyCamScale(500, 500.5, CFG) <= CFG.ZOOM_ENEMY.MAX_SCALE + 1e-9)
})

test('全体ビューでの倍率は 1.0 未満（ちっぽけなシルエット）', () => {
  assert.ok(enemyCamScale(0, 1000, CFG) < 1.0)
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test`
Expected: FAIL（`enemyCamScale` が未定義 / `camera.js` が存在しない）

- [ ] **Step 3: config に調整ブロックを追加**

`js/config.js` の `CONFIG` オブジェクト内、`ZOOM` ブロックの直後に追加：

```js
  // 敵の描画倍率のカメラ連動（ズーム演出）。全体ビューは小さなシルエット、
  // ズームが深いほど大きく＝「目盛りの間にいる」が目で分かる。renderer が
  // meta.scale に enemyCamScale() の戻り値を掛ける。実機で見ながら調整する定数。
  ZOOM_ENEMY: {
    FULL_SCALE: 0.45,  // 全体ビュー（0〜1000）での倍率。1.0未満＝ちっぽけに始める
    MAX_SCALE: 2.6,    // 最大ズーム時に近づく上限倍率
    CURVE: 0.6,        // ズーム段階に対する伸びの強さ（大きいほど早く大きくなる）
  },
```

- [ ] **Step 4: `js/camera.js` を実装**

```js
// js/camera.js
// 敵の描画倍率をカメラのズームに連動させる。今見えている数直線の窓（zoomMin〜zoomMax）が
// 狭いほど「敵に近づいた」とみなして大きく描く。全体ビュー=FULL_SCALE、ズームが深いほど
// MAX_SCALE へ対数カーブで滑らかに近づく。renderer はこの戻り値を meta.scale に掛ける。
// 撃沈アニメの寸法も renderer 側で同じ倍率から導出されるため、ここを直せば演出全体が揃う。
export function enemyCamScale(zoomMin, zoomMax, CONFIG) {
  const { MIN, MAX } = CONFIG.RULER
  const { FULL_SCALE, MAX_SCALE, CURVE } = CONFIG.ZOOM_ENEMY
  const span = Math.max(1, zoomMax - zoomMin)
  const spanRatio = (MAX - MIN) / span              // 全体=1・100窓=10・10窓=50
  const zoomLevel = Math.log10(Math.max(1, spanRatio)) // 全体=0・100窓=1・10窓≈1.7
  const t = 1 - Math.pow(10, -CURVE * zoomLevel)    // zoomLevel=0で0、深いほど1へ飽和
  return FULL_SCALE + (MAX_SCALE - FULL_SCALE) * t
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test`
Expected: PASS（新規5本を含め全テスト緑）

- [ ] **Step 6: コミット**

```bash
git add js/camera.js js/config.js tests/camera.test.js
git commit -m "feat: 敵サイズのカメラ連動を純関数 enemyCamScale として追加

renderer のベタ書き camScale を抜き出し、全体=小・ズーム深=大の
対数カーブに大胆化。倍率は config.ZOOM_ENEMY で実機調整可能に。"
```

---

### Task 2: renderer を新関数に差し替え、実機で手応えを確認

`renderer.js` の敵描画が新しい `enemyCamScale()` を使うようにし、ベタ書きの旧式を消す。撃沈アニメの寸法（`shipW`/`shipH` 由来）も同じ経路なので自動的に追従する。

**Files:**
- Modify: `js/renderer.js`（先頭の import 追加・`drawFrame` 内の `camScale` 計算差し替え）

**Interfaces:**
- Consumes: Task 1 の `enemyCamScale(zoomMin, zoomMax, CONFIG)`
- Produces: なし（描画のみ。UIの見た目が変わる）

- [ ] **Step 1: import を追加**

`js/renderer.js:2` の import 群の隣に追加：

```js
import { enemyCamScale } from './camera.js'
```

- [ ] **Step 2: ベタ書きの camScale を関数呼び出しに差し替え**

`js/renderer.js` の敵描画ブロック内、下記4行（現 `renderer.js:328-330` 付近）：

```js
    const spanRatio = (CFG.RULER.MAX - CFG.RULER.MIN) / (state.zoomMax - state.zoomMin)
    const zoomLevel = Math.log10(Math.max(1, spanRatio)) // 全体=0・100窓=1・10窓=2
    const camScale = Math.min(1.7, 1 + zoomLevel * 0.35)
```

を、次の1行に置き換える（前後のコメントは残す。`shipW`/`shipH` の計算行はそのまま）：

```js
    const camScale = enemyCamScale(state.zoomMin, state.zoomMax, CFG)
```

- [ ] **Step 3: 既存テストの回帰を確認**

Run: `npm test`
Expected: PASS（98本＋新5本すべて緑。renderer はテスト対象外だが、抜き出しで既存ロジックを壊していないことの確認）

- [ ] **Step 4: 実機（ブラウザ）で見た目を確認**

ローカルで `index.html` を開き、次を目視確認する：
- でんせつ（夜・ドローン）で、全体ビューでは敵が小さなシルエットに見える
- 双眼鏡で窓に寄ると、敵がぐんと大きくなり「目盛りの間にいる」感じが出る
- みならい・いっちょまえでも敵が消えたり巨大化しすぎたりしない
- 命中時の撃沈アニメが極端に大きく/小さくなっていない

- [ ] **Step 5: コミット**

```bash
git add js/renderer.js
git commit -m "feat: renderer の敵サイズを enemyCamScale に差し替え

ベタ書きの camScale を撤去し camera.js に一本化。撃沈アニメの寸法も
同経路のため追従。全体=小・ズーム=大の演出が全ランクに効く。"
```

---

## 実機チューニング（実装後・別作業）

コードが動いたら、`config.js` の `ZOOM_ENEMY`（`FULL_SCALE` / `MAX_SCALE` / `CURVE`）をぽこぴぃさんの目で見ながら数値調整する。ここは正解のない見た目の詰めなので、テストではなく実機の手応えで決める。バージョン番号（`config.js` の `VERSION`）を上げてから公開する。

## このプランでやらないこと

- ランク4（まぼろしの砲手・小数）の追加 → 別プランで（設計書 §2・フェーズ2）
- ミクロの海の素材生成 → Codex（設計書 §4・フェーズ3）
- いっちょまえランクへのズーム演出適用の是非 → 実機の見え方を見てから判断（設計書 §3）
