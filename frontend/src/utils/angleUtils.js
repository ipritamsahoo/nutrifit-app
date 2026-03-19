/**
 * angleUtils.js
 * =============
 * Utility functions for calculating joint angles and tracking reps
 * for specific exercises (e.g. Squats, Bicep Curls).
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

  // Calculate angle using Math.atan2
  const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);

  // Normalize angle to be =< 180
  if (angle > 180.0) {
    angle = 360 - angle;
  }

  return angle;
}

/**
 * Checks Rep logic for a Squat.
 * Target angle: Hip(23/24) - Knee(25/26) - Ankle(27/28)
 * 
 * @param {number} angle - The calculated knee angle
 * @param {string} currentState - 'up' or 'down'
 * @returns {Object} { newState: string, repCompleted: boolean }
 */
export function checkRepSquat(angle, currentState) {
  let newState = currentState;
  let repCompleted = false;

  // Squat logic boundaries
  const SQUAT_DOWN_THRESHOLD = 100;
  const SQUAT_UP_THRESHOLD = 160;

  if (angle > SQUAT_UP_THRESHOLD) {
    if (currentState === 'down') {
      repCompleted = true; // Completed a full rep!
    }
    newState = 'up';
  } else if (angle < SQUAT_DOWN_THRESHOLD) {
    newState = 'down';
  }

  return { newState, repCompleted };
}

/**
 * Checks Rep logic for a Bicep Curl.
 * Target angle: Shoulder(11/12) - Elbow(13/14) - Wrist(15/16)
 *
 * @param {number} angle - The calculated elbow angle
 * @param {string} currentState - 'up' or 'down'
 * @returns {Object} { newState: string, repCompleted: boolean }
 */
export function checkRepBicepCurl(angle, currentState) {
  let newState = currentState;
  let repCompleted = false;

  // Curl logic boundaries
  const CURL_UP_THRESHOLD = 30;   // Arm fully curled
  const CURL_DOWN_THRESHOLD = 160; // Arm fully relaxed/down

  if (angle > CURL_DOWN_THRESHOLD) {
    newState = 'down';
  } else if (angle < CURL_UP_THRESHOLD) {
    if (currentState === 'down') {
      repCompleted = true; // Completed a curl!
    }
    newState = 'up';
  }

  return { newState, repCompleted };
}
