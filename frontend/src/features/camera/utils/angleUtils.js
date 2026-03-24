/**
 * angleUtils.js
 * =============
 * Utility functions for calculating joint angles and tracking reps
 * for specific exercises (e.g. Squats, Bicep Curls).
 *
 * Enhanced with:
 *  - Real-time feedback messages
 *  - Rep progress (0-100%)
 *  - Form correctness flag
 */

/**
 * Calculates the angle (in degrees) between three 2D landmarks.
 * p2 is the vertex of the angle.
 *
 * @param {Object} p1 - First landmark {x, y}
 * @param {Object} p2 - Middle landmark (vertex) {x, y}
 * @param {Object} p3 - Third landmark {x, y}
 * @returns {number} Angle in degrees [0, 180]
 */
export function calculateAngle(p1, p2, p3) {
  if (!p1 || !p2 || !p3) return 0;

  const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);

  if (angle > 180.0) {
    angle = 360 - angle;
  }

  return angle;
}

/* ── Squat thresholds ──────────────────────────────────────────── */
const SQUAT_DOWN_THRESHOLD = 100;  // Below this = full depth
const SQUAT_UP_THRESHOLD   = 160;  // Above this = standing
const SQUAT_START_ANGLE    = 170;  // Starting/standing angle

/**
 * Checks Rep logic for a Squat with enhanced feedback.
 *
 * @param {number} angle - The calculated knee angle
 * @param {string} currentState - 'up' or 'down'
 * @returns {Object} { newState, repCompleted, feedback, progress, isCorrect }
 */
export function checkRepSquat(angle, currentState) {
  let newState = currentState;
  let repCompleted = false;
  let feedback = '';
  let isCorrect = false;

  // Progress: how far into the squat (0 = standing, 100 = full depth)
  const progress = Math.max(0, Math.min(100,
    ((SQUAT_START_ANGLE - angle) / (SQUAT_START_ANGLE - SQUAT_DOWN_THRESHOLD)) * 100
  ));

  if (angle > SQUAT_UP_THRESHOLD) {
    if (currentState === 'down') {
      repCompleted = true;
      feedback = '✅ Rep Complete!';
    } else {
      feedback = 'Ready! Go down slowly.';
    }
    newState = 'up';
  } else if (angle < SQUAT_DOWN_THRESHOLD) {
    feedback = '🔥 Perfect depth! Push up!';
    isCorrect = true;
    newState = 'down';
  } else if (angle >= SQUAT_DOWN_THRESHOLD && angle <= 130) {
    feedback = 'Almost there, go deeper!';
    newState = 'down';
  } else if (angle > 130 && angle <= SQUAT_UP_THRESHOLD) {
    if (currentState === 'up') {
      feedback = 'Going down... keep going!';
    } else {
      feedback = 'Pushing up... good!';
    }
  }

  return { newState, repCompleted, feedback, progress, isCorrect };
}

/* ── Bicep Curl thresholds ─────────────────────────────────────── */
const CURL_UP_THRESHOLD    = 35;   // Below this = fully curled
const CURL_DOWN_THRESHOLD  = 160;  // Above this = arm straight
const CURL_START_ANGLE     = 170;  // Starting/straight angle

/**
 * Checks Rep logic for a Bicep Curl with enhanced feedback.
 *
 * @param {number} angle - The calculated elbow angle
 * @param {string} currentState - 'up' or 'down'
 * @returns {Object} { newState, repCompleted, feedback, progress, isCorrect }
 */
export function checkRepBicepCurl(angle, currentState) {
  let newState = currentState;
  let repCompleted = false;
  let feedback = '';
  let isCorrect = false;

  // Progress: how far into the curl (0 = straight, 100 = fully curled)
  const progress = Math.max(0, Math.min(100,
    ((CURL_START_ANGLE - angle) / (CURL_START_ANGLE - CURL_UP_THRESHOLD)) * 100
  ));

  if (angle > CURL_DOWN_THRESHOLD) {
    feedback = 'Full stretch! Now curl up.';
    newState = 'down';
  } else if (angle < CURL_UP_THRESHOLD) {
    if (currentState === 'down') {
      repCompleted = true;
      feedback = '✅ Rep Complete!';
    } else {
      feedback = '🔥 Great squeeze!';
    }
    isCorrect = true;
    newState = 'up';
  } else if (angle >= CURL_UP_THRESHOLD && angle <= 70) {
    feedback = 'Almost there, squeeze harder!';
  } else if (angle > 70 && angle <= CURL_DOWN_THRESHOLD) {
    if (currentState === 'down') {
      feedback = 'Keep curling...';
    } else {
      feedback = 'Lowering... control the motion.';
    }
  }

  return { newState, repCompleted, feedback, progress, isCorrect };
}
