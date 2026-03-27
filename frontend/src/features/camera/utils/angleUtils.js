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

/* ── Dynamic Generic Rep Tracking ────────────────────────────────┤
 * Generic tracking logic that works for ANY exercise pattern by
 * looking at its configuration (upThreshold, downThreshold, startPosition).
 */

/**
 * Checks Rep logic dynamically for any exercise.
 * 
 * @param {number} angle - The calculated joint angle
 * @param {string} currentState - 'up' or 'down'
 * @param {Object} config - The exercise pattern configuration
 * @returns {Object} { newState, repCompleted, feedback, progress, isCorrect }
 */
export function checkGenericRep(angle, currentState, config) {
  let newState = currentState;
  let repCompleted = false;
  let feedback = '';
  let isCorrect = false;

  const { upThreshold, downThreshold, startPosition } = config;

  // Determine if UP is a smaller angle (e.g., Curl 35 < 150) or larger (Squat 160 > 100)
  const isUpSmaller = upThreshold < downThreshold;

  // Evaluate if current angle meets the logical "up" or "down" criteria
  const isAngleUp = isUpSmaller ? (angle <= upThreshold) : (angle >= upThreshold);
  const isAngleDown = isUpSmaller ? (angle >= downThreshold) : (angle <= downThreshold);

  // Calculate Progress (0 to 100%)
  // If we start UP (e.g., Squat), progress moves towards DOWN.
  // If we start DOWN (e.g., Curl), progress moves towards UP.
  let progress = 0;
  if (startPosition === 'up') {
    progress = ((upThreshold - angle) / (upThreshold - downThreshold)) * 100;
  } else {
    progress = ((downThreshold - angle) / (downThreshold - upThreshold)) * 100;
  }
  progress = Math.max(0, Math.min(100, progress));

  // Determine standard feedback messages
  const msgPerfectWork = '🔥 Great form!';
  const msgRepComplete = '✅ Rep Complete!';

  if (startPosition === 'up') {
    // Cycle: UP(Rest) -> DOWN(Work) -> UP(Complete Rep)
    if (isAngleUp) {
      if (currentState === 'down') {
        repCompleted = true;
        feedback = msgRepComplete;
      } else {
        feedback = 'Ready! Control the negative.';
      }
      newState = 'up';
    } else if (isAngleDown) {
      feedback = msgPerfectWork;
      isCorrect = true;
      newState = 'down';
    } else {
      // In transition
      if (currentState === 'up') feedback = 'Going down... almost there!';
      else feedback = 'Pushing up... keep going!';
    }
  } else {
    // startPosition === 'down'
    // Cycle: DOWN(Rest) -> UP(Work) -> DOWN(Complete Rep)
    // Note: Users often like seeing "Rep Complete" at the peak of contraction.
    // To reward the concentric phase, we will flag completion when hitting UP, 
    // and just reset when hitting DOWN.
    if (isAngleDown) {
      feedback = 'Ready! Contract the muscle.';
      newState = 'down';
    } else if (isAngleUp) {
      if (currentState === 'down') {
        repCompleted = true;
        feedback = msgRepComplete;
      } else {
        feedback = msgPerfectWork;
      }
      isCorrect = true;
      newState = 'up';
    } else {
      // In transition
      if (currentState === 'down') feedback = 'Contracting... squeeze!';
      else feedback = 'Lowering... control it!';
    }
  }

  return { newState, repCompleted, feedback, progress, isCorrect };
}

/**
 * Validates if the user's full body is visible within the 5% margins of the frame,
 * ensuring they fit securely inside a body outline.
 */
export function isUserFullyVisible(landmarks) {
  if (!landmarks || landmarks.length === 0) return false;

  // Required joints: Nose(0), Shoulders(11,12), Hips(23,24), Ankles(27,28)
  const required = [0, 11, 12, 23, 24, 27, 28];
  
  for (let idx of required) {
    const lm = landmarks[idx];
    if (!lm || lm.visibility < 0.6) return false;
    
    // Bounds check with 5% margin to prevent limbs from getting cut off
    if (lm.x < 0.05 || lm.x > 0.95 || lm.y < 0.05 || lm.y > 0.95) return false;
  }

  // Vertical height threshold check (Nose to Ankles)
  const headY = landmarks[0].y;
  const anklesY = (landmarks[27].y + landmarks[28].y) / 2;
  const height = anklesY - headY;
  
  // Must occupy between 45% and 90% of screen height to fit the outline
  if (height < 0.45 || height > 0.90) return false;

  return true;
}
