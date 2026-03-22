/**
 * cvKalmanFilter.js
 * =================
 * Pure JavaScript ADAPTIVE + VISIBILITY-AWARE 2D Kalman Filter.
 * NO external dependencies.
 *
 * Key features:
 *  1. Adaptive R: measurement noise adjusts based on movement speed
 *  2. Visibility-weighted: low-visibility landmarks → trust prediction more
 *  3. Multi-step prediction for inter-frame extrapolation
 *  4. Visibility smoothing to prevent rapid show/hide flickering
 */

/* ─── Tiny matrix helpers ─────────────────────────────────────── */

function zeros(r, c) {
  return Array.from({ length: r }, () => new Float64Array(c));
}

function identity(n) {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
}

function scaledIdentity(n, s) {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i][i] = s;
  return m;
}

function matMul(A, B) {
  const r = A.length, k = A[0].length, c = B[0].length;
  const C = zeros(r, c);
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++)
      for (let m = 0; m < k; m++)
        C[i][j] += A[i][m] * B[m][j];
  return C;
}

function matT(A) {
  const r = A.length, c = A[0].length;
  const T = zeros(c, r);
  for (let i = 0; i < r; i++)
    for (let j = 0; j < c; j++)
      T[j][i] = A[i][j];
  return T;
}

function matAdd(A, B) {
  return A.map((row, i) => row.map((v, j) => v + B[i][j]));
}

function matSub(A, B) {
  return A.map((row, i) => row.map((v, j) => v - B[i][j]));
}

function inv2x2(M) {
  const [[a, b], [c, d]] = M;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return identity(2);
  const invDet = 1 / det;
  return [
    [d * invDet, -b * invDet],
    [-c * invDet, a * invDet],
  ];
}

/* ─── Adaptive + Visibility-Aware Kalman Filter ───────────────── */

export class LandmarkKalmanFilter {
  constructor(
    processNoise = 5e-2,
    measureNoiseMin = 1e-3,
    measureNoiseMax = 8e-2,
    speedThreshold = 0.02,
  ) {
    this.x = [0, 0, 0, 0]; // [x, y, vx, vy]
    this.F = [
      [1, 0, 1, 0],
      [0, 1, 0, 1],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    this.H = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ];
    this.Q = scaledIdentity(4, processNoise);
    this.P = scaledIdentity(4, 1);

    this.measureNoiseMin = measureNoiseMin;
    this.measureNoiseMax = measureNoiseMax;
    this.speedThreshold = speedThreshold;

    this.prevRawX = 0;
    this.prevRawY = 0;
    this.smoothedVisibility = 0;  // EMA-smoothed visibility
    this.initialised = false;
  }

  /**
   * Feed raw (x, y) + visibility → returns smoothed {x, y, smoothedVisibility}
   * Low visibility → trusts prediction more (high R) → prevents flicker
   */
  update(rawX, rawY, visibility = 1) {
    // Smooth the visibility value itself (EMA, alpha=0.3)
    // This prevents rapid show/hide flickering from side views
    this.smoothedVisibility =
      this.smoothedVisibility * 0.7 + visibility * 0.3;

    if (!this.initialised) {
      this.x = [rawX, rawY, 0, 0];
      this.prevRawX = rawX;
      this.prevRawY = rawY;
      this.smoothedVisibility = visibility;
      this.initialised = true;
      return { x: rawX, y: rawY, smoothedVisibility: visibility };
    }

    // ── Compute movement speed ──
    const dx = rawX - this.prevRawX;
    const dy = rawY - this.prevRawY;
    const speed = Math.sqrt(dx * dx + dy * dy);
    this.prevRawX = rawX;
    this.prevRawY = rawY;

    // ── Adaptive R: combine speed + visibility ──
    // Speed factor: fast → low noise (trust data), slow → high noise (smooth)
    const speedT = Math.min(speed / this.speedThreshold, 1);
    const speedR = this.measureNoiseMax * (1 - speedT) + this.measureNoiseMin * speedT;

    // Visibility factor: low visibility → MUCH higher noise (trust prediction)
    // When visibility < 0.5, multiply R by up to 10x
    const visScale = visibility > 0.5 ? 1 : (1 + (0.5 - visibility) * 18);
    const adaptiveR = speedR * visScale;

    const R = scaledIdentity(2, adaptiveR);

    // ── PREDICT ──
    const xPred = this._mvMul(this.F, this.x);
    const Ft = matT(this.F);
    const PPred = matAdd(matMul(matMul(this.F, this.P), Ft), this.Q);

    // ── UPDATE ──
    const z = [rawX, rawY];
    const Hx = this._mvMul(this.H, xPred);
    const y = [z[0] - Hx[0], z[1] - Hx[1]];
    const Ht = matT(this.H);
    const S = matAdd(matMul(matMul(this.H, PPred), Ht), R);
    const Sinv = inv2x2(S);
    const K = matMul(matMul(PPred, Ht), Sinv);
    const Ky = this._mvMul(K, y);
    this.x = xPred.map((v, i) => v + Ky[i]);
    const KH = matMul(K, this.H);
    this.P = matMul(matSub(identity(4), KH), PPred);

    return {
      x: this.x[0],
      y: this.x[1],
      smoothedVisibility: this.smoothedVisibility,
    };
  }

  /**
   * Predict N steps ahead (no measurement).
   */
  predict(steps = 1) {
    if (!this.initialised) return { x: 0, y: 0, smoothedVisibility: 0 };
    let state = this.x.slice();
    for (let s = 0; s < steps; s++) {
      state = this._mvMul(this.F, state);
    }
    return {
      x: state[0],
      y: state[1],
      smoothedVisibility: this.smoothedVisibility,
    };
  }

  _mvMul(M, v) {
    return M.map((row) => row.reduce((sum, val, j) => sum + val * v[j], 0));
  }

  dispose() {}
}

/* ─── Factory helpers ─────────────────────────────────────────── */

export function createLandmarkFilters(
  count = 33,
  processNoise = 5e-2,
  measureNoiseMin = 1e-3,
  measureNoiseMax = 8e-2,
  speedThreshold = 0.02,
) {
  return Array.from({ length: count }, () =>
    new LandmarkKalmanFilter(processNoise, measureNoiseMin, measureNoiseMax, speedThreshold),
  );
}

/** Correct step: feed raw measurements + visibility, return filtered landmarks. */
export function filterLandmarks(filters, rawLandmarks) {
  return rawLandmarks.map((lm, i) => {
    const result = filters[i].update(lm.x, lm.y, lm.visibility ?? 0);
    return {
      x: result.x,
      y: result.y,
      z: lm.z ?? 0,
      visibility: result.smoothedVisibility,
    };
  });
}

/** Predict step: extrapolate N steps ahead. */
export function predictLandmarks(filters, lastLandmarks, steps = 1) {
  return lastLandmarks.map((lm, i) => {
    const result = filters[i].predict(steps);
    return {
      x: result.x,
      y: result.y,
      z: lm.z ?? 0,
      visibility: result.smoothedVisibility,
    };
  });
}
