// js/config.js
export const CONFIG = {
  RULER: {
    MIN: 0,
    MAX: 1000,
    Y_FROM_BOTTOM: 90,   // 画面下端から数直線帯中心までのpx
    HEIGHT: 56,          // 数直線帯の高さpx
    MARGIN_X: 80,        // 数直線の左右マージンpx
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
    X_FROM_LEFT: 100,    // 大砲のCanvas X座標
    Y_FROM_RULER: -80,   // 数直線Y座標から大砲中心のオフセット（上方向が負）
    BLUR_FACTOR: 0.25,   // 誤差率×係数×canvas幅=砲撃ブレ量(px)
    DRAG_MIN_PX: 20,     // これ以下のドラッグは無視
    DRAG_MAX_PX: 160,    // これ以上は最大パワーとして扱う
    DRAG_SCALE: 5,       // ドラッグpxをpx/sに変換する倍率
  },
  TIMER: {
    MEASURE_SEC: 15,     // 測量フェーズの制限時間（秒）
  },
  UNLOCK: {
    BINOCULARS_STREAK: 3, // 双眼鏡（レベル2）解放に必要な連続命中数
    TELESCOPE_STREAK: 6,  // 望遠鏡（レベル3）解放に必要な連続命中数
    HIT_MARGIN_VALUE: 30, // 着弾「命中」の許容誤差（value単位、0〜1000スケール）
  },
  ENEMY: {
    X_RATIO: 0.75,       // 敵船のCanvas X座標比率（0〜1）
    SHIP_WIDTH: 140,
    SHIP_HEIGHT: 100,
  },
}
