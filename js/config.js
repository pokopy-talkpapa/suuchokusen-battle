// js/config.js
export const CONFIG = {
  RULER: {
    MIN: 0,
    MAX: 1000,
    Y_FROM_BOTTOM: 90,   // 画面下端から数直線帯中心までのpx
    HEIGHT: 56,          // 数直線帯の高さpx
    MARGIN_X: 150,       // 数直線の左右マージンpx（島の右側へ・旧80）
  },
  ZOOM: {
    // レベル1（肉眼）：0〜1000全体・1目盛り=100
    LEVEL1: { tickStep: 100, rangeWidth: 1000 },
    // レベル2（双眼鏡）：100幅にズーム・1目盛り=10
    LEVEL2: { tickStep: 10,  rangeWidth: 100  },
    // レベル3（望遠鏡）：20幅にズーム・1目盛り=5
    LEVEL3: { tickStep: 5,   rangeWidth: 20   },
  },
  PHYSICS: {
    GRAVITY: 600,        // px/s^2
    MAX_POWER: 800,      // px/s（最大ドラッグ量に対応）
    PREVIEW_ALPHA: 0.25, // 着弾予測点の透明度
    PREVIEW_RADIUS: 18,  // 着弾予測点の円の半径px
  },
  CANNON: {
    X_FROM_LEFT: 78,     // 砲台中心を島の上＝数直線の外へ（旧100）
    Y_FROM_RULER: -80,   // 数直線Y座標から大砲中心のオフセット（上方向が負）
    BLUR_FACTOR: 0.25,   // ※applyBlur撤廃で現在未使用（spec§7で誤差は一本化）。判定に戻さないこと
    DRAG_MIN_PX: 20,     // これ以下のドラッグは無視
    DRAG_MAX_PX: 160,    // これ以上は最大パワーとして扱う
    DRAG_SCALE: 5,       // ドラッグpxをpx/sに変換する倍率
  },
  ISLAND: {
    CENTER_X: 78,        // 島の中心X（砲台と揃える）
    WIDTH: 150,
    HEIGHT: 70,
  },
  TIMER: {
    MEASURE_SEC: 15,     // 測量フェーズの制限時間（秒）
  },
  MODES: {
    // 初級：テンキーで打ち込む・時間制限なし・打った数がメモになる
    beginner: { showMemo: true,  showNumpad: true,  measureTimer: false },
    // 上級：テンキー無し・読んで記憶・時間で自動的に発射フェーズへ
    expert:   { showMemo: false, showNumpad: false, measureTimer: true  },
  },
  UNLOCK: {
    BINOCULARS_STREAK: 3, // 双眼鏡（レベル2）解放に必要な連続命中数
    TELESCOPE_STREAK: 6,  // 望遠鏡（レベル3）解放に必要な連続命中数
    HIT_MARGIN_VALUE: 30, // 着弾「命中」の許容誤差（value単位、0〜1000スケール）
  },
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
  ENEMY: {
    X_RATIO: 0.75,       // 敵船のCanvas X座標比率（0〜1）
    SHIP_WIDTH: 104,     // 高さ113 × 0.92（旧140＝横伸びの原因）
    SHIP_HEIGHT: 113,
  },
}
