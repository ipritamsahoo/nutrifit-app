/**
 * angleUtils.js
 * ==============
 * Geometry helpers for calculating joint angles from pose landmarks.
 * Ported from the Python MediaPipe Pose tutorial (NumPy → vanilla JS).
 */

/**
 * MediaPipe Pose landmark indices (33 total).
 * Only the ones commonly used for exercise tracking are named here.
 */
export const LANDMARK = {
  NOSE:            0,
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
  LEFT_HIP:       23,
  RIGHT_HIP:      24,
  LEFT_KNEE:      25,
  RIGHT_KNEE:     26,
  LEFT_ANKLE:     27,
  RIGHT_ANKLE:    28,
};

/**
 * calculateAngle
 * ---------------
 * Computes the angle (in degrees) at point `b`, formed by the line
 * segments a→b and b→c.
 *
 * Exactly mirrors the Python tutorial:
 *   radians = atan2(c.y - b.y, c.x - b.x) - atan2(a.y - b.y, a.x - b.x)
 *   angle   = |radians| * 180 / π
 *   if angle > 180  →  angle = 360 - angle
 *
 * @param {{ x: number, y: number }} a  – first point  (e.g. shoulder)
 * @param {{ x: number, y: number }} b  – mid / vertex  (e.g. elbow)
 * @param {{ x: number, y: number }} c  – end point    (e.g. wrist)
 * @returns {number} angle in degrees (0–180)
 */
export function calculateAngle(a, b, c) {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) -
    Math.atan2(a.y - b.y, a.x - b.x);

  let angle = Math.abs(radians * (180.0 / Math.PI));

  if (angle > 180.0) {
    angle = 360.0 - angle;
  }

  return angle;
}

/**
 * getLeftArmAngle
 * ----------------
 * Convenience: returns the angle at the LEFT ELBOW given the full
 * landmarks array.  Returns null if any required landmark has
 * visibility below the threshold.
 *
 * @param {Array} landmarks – 33-element MediaPipe pose landmark array
 * @param {number} [minVis=0.5] – minimum visibility to trust
 * @returns {number|null}
 */
export function getLeftArmAngle(landmarks, minVis = 0.5) {
  const shoulder = landmarks[LANDMARK.LEFT_SHOULDER];
  const elbow    = landmarks[LANDMARK.LEFT_ELBOW];
  const wrist    = landmarks[LANDMARK.LEFT_WRIST];

  if (
    shoulder.visibility < minVis ||
    elbow.visibility    < minVis ||
    wrist.visibility    < minVis
  ) {
    return null;
  }

  return calculateAngle(shoulder, elbow, wrist);
}

/**
 * getRightArmAngle
 * -----------------
 * Same as getLeftArmAngle but for the RIGHT arm.
 *
 * @param {Array} landmarks
 * @param {number} [minVis=0.5]
 * @returns {number|null}
 */
export function getRightArmAngle(landmarks, minVis = 0.5) {
  const shoulder = landmarks[LANDMARK.RIGHT_SHOULDER];
  const elbow    = landmarks[LANDMARK.RIGHT_ELBOW];
  const wrist    = landmarks[LANDMARK.RIGHT_WRIST];

  if (
    shoulder.visibility < minVis ||
    elbow.visibility    < minVis ||
    wrist.visibility    < minVis
  ) {
    return null;
  }

  return calculateAngle(shoulder, elbow, wrist);
}

/**
 * processCurlFrame
 * -----------------
 * Given the current elbow angle and the previous curl state, returns
 * the updated state.  This is a pure function (no side-effects) so it
 * works cleanly with React refs or state.
 *
 * Logic (from the tutorial):
 *   angle > 160  →  stage = "down"  (arm extended)
 *   angle < 30   →  if stage was "down", register 1 rep, stage = "up"
 *
 * @param {number|null} angle  – current elbow angle (null = skip)
 * @param {{ reps: number, stage: string|null }} prev – previous state
 * @returns {{ reps: number, stage: string|null }} updated state
 */
export function processCurlFrame(angle, prev) {
  if (angle === null) return prev;

  let { reps, stage } = prev;

  if (angle > 160) {
    stage = 'down';
  }

  if (angle < 30 && stage === 'down') {
    stage = 'up';
    reps += 1;
  }

  return { reps, stage };
}
