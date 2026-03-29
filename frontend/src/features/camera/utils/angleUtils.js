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
 * Checks Rep logic dynamically for any exercise using one OR more joints.
 * In multi-joint mode, ALL joints must cross thresholds for state transitions.
 * 
 * @param {Array} joints - [{ value, upThreshold, downThreshold }]
 * @param {string} currentState - 'up' or 'down'
 * @param {string} startPosition - 'up' or 'down'
 * @param {Object} options - { requireFullForm: boolean }
 * @returns {Object} { newState, repCompleted, feedback, progress, isCorrect }
 */
export function checkGenericRep(joints, currentState, startPosition, options = {}) {
  if (!joints || joints.length === 0) {
    return { newState: currentState, repCompleted: false, feedback: '', progress: 0, isCorrect: false };
  }

  // 1. Calculate individual joint progress
  const jointResults = joints.map(j => {
    const up = j.upAngle ?? j.upThreshold;
    const down = j.downAngle ?? j.downThreshold;
    let p = 0;
    if (startPosition === 'up') {
      p = ((up - j.value) / (up - down)) * 100;
    } else {
      p = ((down - j.value) / (down - up)) * 100;
    }
    return Math.max(0, Math.min(100, p));
  });

  // 2. Primary Joint Logic (Fix for user "bara/banchod" anger)
  // We use the FIRST joint as the absolute trigger for rep counting.
  // Secondary joints are ignored for completion to avoid bottlenecking.
  const overallProgress = jointResults[0]; 
  
  // High tolerance (75% to 80% to trigger 'up/down' state)
  const isGoalReached = overallProgress >= 78; 
  const isRestReached = overallProgress <= 22;

  let newState = currentState;
  let repCompleted = false;
  let feedback = '';
  // Form is correct if ALL joints are moving reasonably well
  let isCorrect = jointResults.every(p => p > 65);

  const msgPerfectWork = '';
  const msgRepComplete = '✅ Rep Complete!';

  if (startPosition === 'up') {
    if (isGoalReached) {
      if (currentState === 'down') {
        repCompleted = true;
        feedback = msgRepComplete;
      } else {
        feedback = 'Ready! Negative.';
      }
      newState = 'up';
    } else if (isRestReached) {
      feedback = msgPerfectWork;
      isCorrect = true;
      newState = 'down';
    } else {
      feedback = currentState === 'up' ? 'Down...' : 'Pushing up...';
    }
  } else {
    // startPosition === 'down'
    if (isRestReached) {
      feedback = 'Ready! Contract.';
      newState = 'down';
    } else if (isGoalReached) {
      if (currentState === 'down') {
        repCompleted = true;
        feedback = msgRepComplete;
      } else {
        feedback = msgPerfectWork;
      }
      isCorrect = true;
      newState = 'up';
    } else {
      feedback = currentState === 'down' ? 'Contracting...' : 'Lowering...';
    }
  }

  // ── STRICT MODE GATE ──
  // If the exercise requires full form, we only allow rep completion if isCorrect is true.
  if (repCompleted && options.requireFullForm && !isCorrect) {
    repCompleted = false;
    feedback = options.fullFormErrorMessage || 'Form incorrect. Keep arms straight!';
  }

  return { newState, repCompleted, feedback, progress: overallProgress, isCorrect };
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

/**
 * Advanced Form Validation Engine
 * Runs specific biomechanical checks for an exercise.
 * 
 * @param {Array} landmarks - Current landmarks
 * @param {Array} rules - Configuration-defined rules
 * @returns {string|null} - The correction message if a rule is violated, else null.
 */
export function validateFormRules(landmarks, rules) {
  if (!landmarks || !rules || rules.length === 0) return null;

  for (const rule of rules) {
    const { type, joints, threshold, message, side = 'both' } = rule;
    
    // Evaluate for Left, Right, or Both sides
    const sidesToCheck = side === 'both' ? ['left', 'right'] : [side];
    
    for (const s of sidesToCheck) {
      const jIndices = joints.map(j => {
        // Handle side offset: j is left side (even is usually left shoulder 11? No, 11 is left)
        // MediaPipe indices: 11 = L.Shoulder, 12 = R.Shoulder
        // So offset is +1 if s === 'right'
        return s === 'left' ? j : j + 1;
      });
      
      // Ensure visibility
      if (jIndices.some(idx => !landmarks[idx] || landmarks[idx].visibility < 0.5)) continue;

      const pts = jIndices.map(idx => ({ x: landmarks[idx].x, y: landmarks[idx].y }));

      if (type === 'flare') {
        // [Shoulder, Elbow, Wrist]
        // Check horizontal distance: Elbow should not be significantly outside Wrist
        const elbow = pts[1], wrist = pts[2];
        // Left side (Image Right, high X): Flaring means elbow.x > wrist.x
        // Right side (Image Left, low X): Flaring means elbow.x < wrist.x
        const flareAmount = s === 'left' ? (elbow.x - wrist.x) : (wrist.x - elbow.x);
        if (flareAmount > threshold) return message;
      }

      if (type === 'wrist_neutral') {
        // [Elbow, Wrist, IndexFingerTip (19/20)]
        if (pts.length < 3) continue;
        const angle = calculateAngle(pts[0], pts[1], pts[2]);
        // Bending wrists usually means angle decreases from 180
        if (angle < threshold) return message;
      }

      if (type === 'alignment') {
        // [Joint1, Joint2, Joint3] - Check straightness (deviation from 180)
        if (pts.length < 3) continue;
        const angle = calculateAngle(pts[0], pts[1], pts[2]);
        // Trigger if deviation from straight line (180deg) exceeds threshold (e.g. 25deg)
        if (Math.abs(180 - angle) > threshold) return message;
      }

      if (type === 'forward_drift') {
        // [Wrist/Hand, Shoulder]
        const wrist = pts[0], shoulder = pts[1];
        // Heuristic: Wrist should not move significantly forward/lateral from shoulder plane
        if (Math.abs(wrist.x - shoulder.x) > threshold) return message;
      }

      if (type === 'heel_lift') {
        // [Heel (29/30), FootIndex (31/32)]
        const heel = pts[0], toes = pts[1];
        // Heels should be roughly at the same Y as toes (or lower). 
        // If heel.y is significantly smaller (higher up) than toes.y, return message.
        if (toes.y - heel.y > threshold) return message;
      }

      if (type === 'symmetry') {
        // [LeftJoint, RightJoint]
        const left = pts[0], right = pts[1];
        // Check for vertical imbalance (e.g., one arm higher than the other)
        if (Math.abs(left.y - right.y) > threshold) return message;
      }

      if (type === 'angle_range') {
        const angle = calculateAngle(pts[0], pts[1], pts[2]);
        if (rule.min !== undefined && angle < rule.min) return rule.message;
        if (rule.max !== undefined && angle > rule.max) return rule.message;
      }
    }
  }

  return null;
}
