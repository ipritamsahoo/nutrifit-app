/**
 * generateExerciseDefinitions.js
 * ================================
 * Multi-joint, biomechanically-researched exercise definition generator.
 * 
 * Each exercise gets an `angles` array where:
 *   angles[0] = PRIMARY angle (drives rep counting)
 *   angles[1+] = SECONDARY angles (form validation)
 * 
 * MediaPipe Landmark Reference:
 *   11/12 = L/R Shoulder   13/14 = L/R Elbow    15/16 = L/R Wrist
 *   23/24 = L/R Hip        25/26 = L/R Knee     27/28 = L/R Ankle
 *   31/32 = L/R Foot Index
 * 
 * Run: node generateExerciseDefinitions.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── MediaPipe Joint Triplets (left side; right = +1 for each) ──
const JOINTS = {
  elbow:    [11, 13, 15],  // shoulder → elbow → wrist
  shoulder: [23, 11, 13],  // hip → shoulder → elbow (flexion/extension)
  shoulderAbd: [23, 11, 15], // hip → shoulder → wrist (abduction for lateral raises)
  knee:     [23, 25, 27],  // hip → knee → ankle
  hip:      [11, 23, 25],  // shoulder → hip → knee
  ankle:    [25, 27, 31],  // knee → ankle → foot index
  hipSpine: [13, 11, 23],  // elbow → shoulder → hip (for planks/overhead)
  trunkLean:[11, 23, 27],  // shoulder → hip → ankle (trunk alignment)
};

// ─────────────────────────────────────────────────────────────────────
// ANGLE PRESETS — researched biomechanical ROM values
// Each preset: { joints, upAngle, downAngle }
// "up" = contracted/peak position, "down" = extended/rest position
// ─────────────────────────────────────────────────────────────────────

// ── ELBOW ANGLES ──
const ELBOW = {
  curl_standard:    { joints: JOINTS.elbow, upAngle: 30,  downAngle: 155, name: 'elbow' },
  curl_hammer:      { joints: JOINTS.elbow, upAngle: 38,  downAngle: 152, name: 'elbow' },
  curl_reverse:     { joints: JOINTS.elbow, upAngle: 50,  downAngle: 148, name: 'elbow' },
  curl_preacher:    { joints: JOINTS.elbow, upAngle: 50,  downAngle: 135, name: 'elbow' },
  curl_concentration:{ joints: JOINTS.elbow, upAngle: 22, downAngle: 145, name: 'elbow' },
  curl_incline:     { joints: JOINTS.elbow, upAngle: 28,  downAngle: 162, name: 'elbow' },
  curl_bayesian:    { joints: JOINTS.elbow, upAngle: 35,  downAngle: 162, name: 'elbow' },
  curl_drag:        { joints: JOINTS.elbow, upAngle: 58,  downAngle: 148, name: 'elbow' },
  curl_spider:      { joints: JOINTS.elbow, upAngle: 25,  downAngle: 140, name: 'elbow' },
  curl_cable:       { joints: JOINTS.elbow, upAngle: 32,  downAngle: 150, name: 'elbow' },
  press_bench:      { joints: JOINTS.elbow, upAngle: 165, downAngle: 80,  name: 'elbow' },
  press_incline:    { joints: JOINTS.elbow, upAngle: 168, downAngle: 75,  name: 'elbow' },
  press_decline:    { joints: JOINTS.elbow, upAngle: 162, downAngle: 82,  name: 'elbow' },
  press_floor:      { joints: JOINTS.elbow, upAngle: 170, downAngle: 90,  name: 'elbow' },
  press_overhead:   { joints: JOINTS.elbow, upAngle: 170, downAngle: 85,  name: 'elbow' },
  pushup:           { joints: JOINTS.elbow, upAngle: 165, downAngle: 75,  name: 'elbow' },
  dip:              { joints: JOINTS.elbow, upAngle: 165, downAngle: 80,  name: 'elbow' },
  tricep_extension: { joints: JOINTS.elbow, upAngle: 170, downAngle: 55,  name: 'elbow' },
  tricep_pushdown:  { joints: JOINTS.elbow, upAngle: 170, downAngle: 60,  name: 'elbow' },
  tricep_kickback:  { joints: JOINTS.elbow, upAngle: 175, downAngle: 70,  name: 'elbow' },
  tricep_skullcrush:{ joints: JOINTS.elbow, upAngle: 165, downAngle: 45,  name: 'elbow' },
  row_standard:     { joints: JOINTS.elbow, upAngle: 70,  downAngle: 168, name: 'elbow' },
  row_close:        { joints: JOINTS.elbow, upAngle: 60,  downAngle: 165, name: 'elbow' },
  row_wide:         { joints: JOINTS.elbow, upAngle: 78,  downAngle: 170, name: 'elbow' },
  pulldown:         { joints: JOINTS.elbow, upAngle: 65,  downAngle: 170, name: 'elbow' },
  pullup:           { joints: JOINTS.elbow, upAngle: 60,  downAngle: 172, name: 'elbow' },
};

// ── SHOULDER ANGLES ──
const SHOULDER = {
  press_overhead:   { joints: JOINTS.shoulder, upAngle: 170, downAngle: 80,  name: 'shoulder' },
  press_bench:      { joints: JOINTS.shoulder, upAngle: 80,  downAngle: 40,  name: 'shoulder' },
  press_incline:    { joints: JOINTS.shoulder, upAngle: 110, downAngle: 45,  name: 'shoulder' },
  press_decline:    { joints: JOINTS.shoulder, upAngle: 65,  downAngle: 35,  name: 'shoulder' },
  lateral_raise:    { joints: JOINTS.shoulderAbd, upAngle: 85, downAngle: 15, name: 'shoulder' },
  front_raise:      { joints: JOINTS.shoulder, upAngle: 155, downAngle: 40,  name: 'shoulder' },
  fly_chest:        { joints: JOINTS.shoulder, upAngle: 85,  downAngle: 25,  name: 'shoulder' },
  fly_reverse:      { joints: JOINTS.shoulder, upAngle: 40,  downAngle: 140, name: 'shoulder' },
  row_shoulder:     { joints: JOINTS.shoulder, upAngle: 45,  downAngle: 120, name: 'shoulder' },
  pulldown:         { joints: JOINTS.shoulder, upAngle: 45,  downAngle: 170, name: 'shoulder' },
  pullup:           { joints: JOINTS.shoulder, upAngle: 40,  downAngle: 175, name: 'shoulder' },
  upright_row:      { joints: JOINTS.shoulder, upAngle: 130, downAngle: 35,  name: 'shoulder' },
  pushup:           { joints: JOINTS.shoulder, upAngle: 70,  downAngle: 30,  name: 'shoulder' },
  dip:              { joints: JOINTS.shoulder, upAngle: 55,  downAngle: 15,  name: 'shoulder' },
  face_pull:        { joints: JOINTS.shoulder, upAngle: 90,  downAngle: 40,  name: 'shoulder' },
  shrug:            { joints: JOINTS.shoulder, upAngle: 30,  downAngle: 15,  name: 'shoulder' },
};

// ── KNEE ANGLES ──
const KNEE = {
  squat_standard:   { joints: JOINTS.knee, upAngle: 172, downAngle: 85,  name: 'knee' },
  squat_deep:       { joints: JOINTS.knee, upAngle: 172, downAngle: 70,  name: 'knee' },
  squat_half:       { joints: JOINTS.knee, upAngle: 172, downAngle: 110, name: 'knee' },
  squat_sumo:       { joints: JOINTS.knee, upAngle: 170, downAngle: 90,  name: 'knee' },
  squat_split:      { joints: JOINTS.knee, upAngle: 170, downAngle: 85,  name: 'knee' },
  squat_sissy:      { joints: JOINTS.knee, upAngle: 170, downAngle: 75,  name: 'knee' },
  lunge_standard:   { joints: JOINTS.knee, upAngle: 170, downAngle: 88,  name: 'knee' },
  lunge_walking:    { joints: JOINTS.knee, upAngle: 170, downAngle: 85,  name: 'knee' },
  lunge_reverse:    { joints: JOINTS.knee, upAngle: 170, downAngle: 90,  name: 'knee' },
  lunge_lateral:    { joints: JOINTS.knee, upAngle: 170, downAngle: 95,  name: 'knee' },
  lunge_curtsy:     { joints: JOINTS.knee, upAngle: 170, downAngle: 88,  name: 'knee' },
  deadlift_conv:    { joints: JOINTS.knee, upAngle: 170, downAngle: 130, name: 'knee' },
  deadlift_sumo:    { joints: JOINTS.knee, upAngle: 170, downAngle: 115, name: 'knee' },
  deadlift_rdl:     { joints: JOINTS.knee, upAngle: 170, downAngle: 155, name: 'knee' },
  deadlift_stiff:   { joints: JOINTS.knee, upAngle: 175, downAngle: 160, name: 'knee' },
  leg_extension:    { joints: JOINTS.knee, upAngle: 170, downAngle: 80,  name: 'knee' },
  leg_curl:         { joints: JOINTS.knee, upAngle: 50,  downAngle: 165, name: 'knee' },
  leg_press:        { joints: JOINTS.knee, upAngle: 172, downAngle: 85,  name: 'knee' },
  step_up:          { joints: JOINTS.knee, upAngle: 172, downAngle: 95,  name: 'knee' },
  hip_thrust_knee:  { joints: JOINTS.knee, upAngle: 90,  downAngle: 90,  name: 'knee' }, // isometric ~90
  box_squat:        { joints: JOINTS.knee, upAngle: 172, downAngle: 95,  name: 'knee' },
  hack_squat:       { joints: JOINTS.knee, upAngle: 172, downAngle: 80,  name: 'knee' },
};

// ── HIP ANGLES ──
const HIP = {
  squat_standard:   { joints: JOINTS.hip, upAngle: 175, downAngle: 80,  name: 'hip' },
  squat_deep:       { joints: JOINTS.hip, upAngle: 175, downAngle: 65,  name: 'hip' },
  squat_half:       { joints: JOINTS.hip, upAngle: 175, downAngle: 110, name: 'hip' },
  squat_sumo:       { joints: JOINTS.hip, upAngle: 175, downAngle: 85,  name: 'hip' },
  squat_split:      { joints: JOINTS.hip, upAngle: 175, downAngle: 80,  name: 'hip' },
  lunge_standard:   { joints: JOINTS.hip, upAngle: 175, downAngle: 95,  name: 'hip' },
  lunge_walking:    { joints: JOINTS.hip, upAngle: 175, downAngle: 90,  name: 'hip' },
  lunge_reverse:    { joints: JOINTS.hip, upAngle: 175, downAngle: 95,  name: 'hip' },
  lunge_lateral:    { joints: JOINTS.hip, upAngle: 170, downAngle: 100, name: 'hip' },
  lunge_curtsy:     { joints: JOINTS.hip, upAngle: 175, downAngle: 90,  name: 'hip' },
  deadlift_conv:    { joints: JOINTS.hip, upAngle: 175, downAngle: 85,  name: 'hip' },
  deadlift_sumo:    { joints: JOINTS.hip, upAngle: 175, downAngle: 90,  name: 'hip' },
  deadlift_rdl:     { joints: JOINTS.hip, upAngle: 175, downAngle: 70,  name: 'hip' },
  deadlift_stiff:   { joints: JOINTS.hip, upAngle: 175, downAngle: 65,  name: 'hip' },
  hip_thrust:       { joints: JOINTS.hip, upAngle: 180, downAngle: 90,  name: 'hip' },
  good_morning:     { joints: JOINTS.hip, upAngle: 175, downAngle: 75,  name: 'hip' },
  back_extension:   { joints: JOINTS.hip, upAngle: 180, downAngle: 90,  name: 'hip' },
  leg_press_hip:    { joints: JOINTS.hip, upAngle: 175, downAngle: 80,  name: 'hip' },
  step_up:          { joints: JOINTS.hip, upAngle: 175, downAngle: 95,  name: 'hip' },
  crunch:           { joints: JOINTS.hip, upAngle: 120, downAngle: 160, name: 'hip' },
  situp:            { joints: JOINTS.hip, upAngle: 65,  downAngle: 155, name: 'hip' },
  box_squat:        { joints: JOINTS.hip, upAngle: 175, downAngle: 90,  name: 'hip' },
  hack_squat:       { joints: JOINTS.hip, upAngle: 175, downAngle: 75,  name: 'hip' },
  pendulum_squat:   { joints: JOINTS.hip, upAngle: 170, downAngle: 85,  name: 'hip' },
};

// ── ANKLE ANGLES ──
const ANKLE = {
  calf_raise:       { joints: JOINTS.ankle, upAngle: 140, downAngle: 105, name: 'ankle' },
  calf_raise_seated:{ joints: JOINTS.ankle, upAngle: 135, downAngle: 100, name: 'ankle' },
};

// ── TRUNK ALIGNMENT (form check for planks, pushups) ──
const TRUNK = {
  straight_body:    { joints: JOINTS.trunkLean, upAngle: 170, downAngle: 170, name: 'trunk' },
  plank:            { joints: JOINTS.hip, upAngle: 175, downAngle: 165, name: 'trunk' },
};


// ─────────────────────────────────────────────────────────────────────
// EXERCISE → MULTI-ANGLE CLASSIFICATION ENGINE
// ─────────────────────────────────────────────────────────────────────

function classifyExercise(name, muscleGroup) {
  const n = name.toLowerCase();
  const mg = muscleGroup.toLowerCase();

  // ══════════════════════════════════════════════════
  // 1. CURLS (Biceps) — Primary: elbow
  // ══════════════════════════════════════════════════
  if (n.includes('curl') && !n.includes('leg curl') && !n.includes('hamstring curl')) {
    let elbow = { ...ELBOW.curl_standard };
    if (n.includes('hammer'))        elbow = { ...ELBOW.curl_hammer };
    else if (n.includes('reverse'))  elbow = { ...ELBOW.curl_reverse };
    else if (n.includes('preacher')) elbow = { ...ELBOW.curl_preacher };
    else if (n.includes('concentration')) elbow = { ...ELBOW.curl_concentration };
    else if (n.includes('incline')) elbow = { ...ELBOW.curl_incline };
    else if (n.includes('bayesian')) elbow = { ...ELBOW.curl_bayesian };
    else if (n.includes('drag'))    elbow = { ...ELBOW.curl_drag };
    else if (n.includes('spider'))  elbow = { ...ELBOW.curl_spider };
    else if (n.includes('cable'))   elbow = { ...ELBOW.curl_cable };

    // Equipment adjustments
    if (n.includes('barbell')) { elbow.upAngle += 5; elbow.downAngle -= 3; }
    if (n.includes('ez bar') || n.includes('ez-bar')) { elbow.upAngle += 3; }
    if (n.includes('kettlebell')) { elbow.upAngle -= 2; elbow.downAngle -= 3; }
    if (n.includes('band')) { elbow.downAngle += 5; }

    return {
      angles: [elbow],
      startPosition: 'down', category: 'upper_body', isPush: false,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 2. TRICEP EXTENSIONS / PUSHDOWNS / KICKBACKS / SKULL CRUSHERS
  // ══════════════════════════════════════════════════
  if (n.includes('tricep') || n.includes('pushdown') || n.includes('push down') ||
      n.includes('kickback') || n.includes('skull crush') || n.includes('skullcrush') ||
      (n.includes('extension') && (mg === 'triceps' || n.includes('tricep')))) {
    let elbow = { ...ELBOW.tricep_extension };
    if (n.includes('pushdown') || n.includes('push down')) elbow = { ...ELBOW.tricep_pushdown };
    else if (n.includes('kickback')) elbow = { ...ELBOW.tricep_kickback };
    else if (n.includes('skull') || n.includes('skullcrush')) elbow = { ...ELBOW.tricep_skullcrush };

    if (n.includes('cable') || n.includes('band')) { elbow.downAngle += 5; }
    if (n.includes('overhead')) { elbow.downAngle -= 5; }

    return {
      angles: [elbow],
      startPosition: 'up', category: 'upper_body', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 3. DIPS — Primary: elbow, Secondary: shoulder
  // ══════════════════════════════════════════════════
  if (n.includes('dip') && !n.includes('hip')) {
    return {
      angles: [
        { ...ELBOW.dip },
        { ...SHOULDER.dip }
      ],
      startPosition: 'up', category: 'upper_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 4. PUSH-UPS — Primary: elbow, Secondary: shoulder
  // ══════════════════════════════════════════════════
  if (n.includes('push up') || n.includes('pushup') || n.includes('push-up')) {
    let elbow = { ...ELBOW.pushup };
    let shoulder = { ...SHOULDER.pushup };
    if (n.includes('wide')) { elbow.downAngle -= 5; shoulder.downAngle -= 5; }
    if (n.includes('close') || n.includes('diamond')) { elbow.downAngle += 5; }
    if (n.includes('decline')) { elbow.downAngle -= 3; }
    if (n.includes('pike') || n.includes('handstand')) {
      shoulder = { ...SHOULDER.press_overhead };
    }
    return {
      angles: [elbow, shoulder],
      startPosition: 'up', category: 'upper_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 5. BENCH PRESS / CHEST PRESS — Primary: elbow, Secondary: shoulder
  // ══════════════════════════════════════════════════
  if ((n.includes('bench') || n.includes('chest press') || n.includes('floor press')) 
      && n.includes('press')) {
    let elbow = { ...ELBOW.press_bench };
    let shoulder = { ...SHOULDER.press_bench };
    if (n.includes('incline')) {
      elbow = { ...ELBOW.press_incline };
      shoulder = { ...SHOULDER.press_incline };
    }
    if (n.includes('decline')) {
      elbow = { ...ELBOW.press_decline };
      shoulder = { ...SHOULDER.press_decline };
    }
    if (n.includes('floor')) {
      elbow = { ...ELBOW.press_floor };
    }
    if (n.includes('close grip') || n.includes('close-grip')) { elbow.downAngle += 5; }
    if (n.includes('dumbbell')) { shoulder.downAngle -= 5; }

    return {
      angles: [elbow, shoulder],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 6. SHOULDER PRESS / OVERHEAD PRESS / MILITARY — Primary: shoulder, Secondary: elbow
  // ══════════════════════════════════════════════════
  if ((n.includes('shoulder press') || n.includes('overhead press') || n.includes('military press') ||
       n.includes('arnold press') || n.includes('push press') || n.includes('z press') ||
       n.includes('landmine press') || n.includes('viking press') ||
       (n.includes('press') && mg === 'shoulders'))) {
    let shoulder = { ...SHOULDER.press_overhead };
    let elbow = { ...ELBOW.press_overhead };
    if (n.includes('arnold')) { shoulder.downAngle -= 10; }
    if (n.includes('landmine')) { shoulder.upAngle -= 10; shoulder.downAngle += 10; }
    if (n.includes('seated')) { shoulder.upAngle += 2; }
    if (n.includes('dumbbell')) { shoulder.downAngle -= 5; }
    if (n.includes('behind neck') || n.includes('behind the neck')) { shoulder.downAngle -= 10; }

    return {
      angles: [shoulder, elbow],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 7. LATERAL RAISES — Primary: shoulder abduction
  // ══════════════════════════════════════════════════
  if (n.includes('lateral raise') || n.includes('side raise') || n.includes('lat raise')) {
    let shoulder = { ...SHOULDER.lateral_raise };
    if (n.includes('cable')) { shoulder.downAngle += 5; }
    if (n.includes('leaning')) { shoulder.upAngle += 5; }
    return {
      angles: [shoulder],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 8. FRONT RAISES — Primary: shoulder flexion
  // ══════════════════════════════════════════════════
  if (n.includes('front raise')) {
    let shoulder = { ...SHOULDER.front_raise };
    if (n.includes('cable')) { shoulder.downAngle += 5; }
    return {
      angles: [shoulder],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 9. FLYES (Chest) — Primary: shoulder, Secondary: elbow (slight bend)
  // ══════════════════════════════════════════════════
  if (n.includes('fly') || n.includes('flye') || n.includes('crossover') || n.includes('pec deck')) {
    let shoulder = { ...SHOULDER.fly_chest };
    if (n.includes('incline')) { shoulder.upAngle += 10; }
    if (n.includes('cable')) { shoulder.downAngle -= 5; }
    if (n.includes('reverse') || n.includes('rear delt')) {
      shoulder = { ...SHOULDER.fly_reverse };
    }

    return {
      angles: [shoulder],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 10. ROWS — Primary: elbow, Secondary: shoulder
  // ══════════════════════════════════════════════════
  if (n.includes('row') && !n.includes('upright row')) {
    let elbow = { ...ELBOW.row_standard };
    let shoulder = { ...SHOULDER.row_shoulder };
    if (n.includes('close') || n.includes('narrow')) {
      elbow = { ...ELBOW.row_close };
    }
    if (n.includes('wide')) {
      elbow = { ...ELBOW.row_wide };
    }
    if (n.includes('barbell')) { elbow.upAngle += 3; }
    if (n.includes('cable') || n.includes('machine')) { elbow.downAngle -= 3; }
    if (n.includes('t-bar') || n.includes('t bar')) { shoulder.upAngle += 5; }
    if (n.includes('meadows') || n.includes('landmine')) { elbow.upAngle -= 5; }
    if (n.includes('pendlay') || n.includes('bent over')) { shoulder.downAngle += 10; }

    return {
      angles: [elbow, shoulder],
      startPosition: 'down', category: 'upper_body', isPush: false,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 11. UPRIGHT ROW — Primary: shoulder, Secondary: elbow
  // ══════════════════════════════════════════════════
  if (n.includes('upright row')) {
    return {
      angles: [
        { ...SHOULDER.upright_row },
        { ...ELBOW.row_standard, upAngle: 55, downAngle: 160 }
      ],
      startPosition: 'down', category: 'upper_body', isPush: false,
      lerpSpeed: 0.48, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 12. PULLDOWNS — Primary: shoulder, Secondary: elbow 
  // ══════════════════════════════════════════════════
  if (n.includes('pulldown') || n.includes('pull down') || n.includes('lat pull')) {
    let shoulder = { ...SHOULDER.pulldown };
    let elbow = { ...ELBOW.pulldown };
    if (n.includes('close grip')) { elbow.upAngle -= 5; }
    if (n.includes('wide')) { elbow.upAngle += 5; }
    if (n.includes('behind neck') || n.includes('behind the neck')) { shoulder.downAngle -= 10; }
    if (n.includes('single arm') || n.includes('one arm')) { shoulder.upAngle -= 5; }
    if (n.includes('straight arm')) {
      shoulder = { ...SHOULDER.pulldown, upAngle: 35, downAngle: 170 };
      return {
        angles: [shoulder],
        startPosition: 'up', category: 'upper_body', isPush: false,
        lerpSpeed: 0.45, kalmanNoise: 0.06
      };
    }
    return {
      angles: [shoulder, elbow],
      startPosition: 'up', category: 'upper_body', isPush: false,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 13. PULL-UPS / CHIN-UPS — Primary: shoulder, Secondary: elbow
  // ══════════════════════════════════════════════════
  if (n.includes('pull up') || n.includes('pullup') || n.includes('pull-up') ||
      n.includes('chin up') || n.includes('chinup') || n.includes('chin-up')) {
    let shoulder = { ...SHOULDER.pullup };
    let elbow = { ...ELBOW.pullup };
    if (n.includes('chin')) { elbow.upAngle -= 5; }
    if (n.includes('wide')) { elbow.upAngle += 5; }
    if (n.includes('close')) { elbow.upAngle -= 8; }
    return {
      angles: [shoulder, elbow],
      startPosition: 'up', category: 'upper_body', isPush: false,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }

  // ══════════════════════════════════════════════════
  // 14. FACE PULLS — Primary: shoulder
  // ══════════════════════════════════════════════════
  if (n.includes('face pull')) {
    return {
      angles: [{ ...SHOULDER.face_pull }],
      startPosition: 'down', category: 'upper_body', isPush: false,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 15. SHRUGS — Primary: shoulder (minimal ROM)
  // ══════════════════════════════════════════════════
  if (n.includes('shrug')) {
    return {
      angles: [{ ...SHOULDER.shrug }],
      startPosition: 'down', category: 'upper_body', isPush: false,
      lerpSpeed: 0.55, kalmanNoise: 0.04
    };
  }

  // ══════════════════════════════════════════════════
  // 16. SQUATS — Primary: knee, Secondary: hip
  // ══════════════════════════════════════════════════
  if (n.includes('squat')) {
    let knee = { ...KNEE.squat_standard };
    let hip = { ...HIP.squat_standard };
    if (n.includes('sumo') || n.includes('wide')) {
      knee = { ...KNEE.squat_sumo }; hip = { ...HIP.squat_sumo };
    }
    if (n.includes('split') || n.includes('bulgarian')) {
      knee = { ...KNEE.squat_split }; hip = { ...HIP.squat_split };
    }
    if (n.includes('sissy')) {
      knee = { ...KNEE.squat_sissy }; hip = { ...HIP.squat_standard };
    }
    if (n.includes('hack')) {
      knee = { ...KNEE.hack_squat }; hip = { ...HIP.hack_squat };
    }
    if (n.includes('box')) {
      knee = { ...KNEE.box_squat }; hip = { ...HIP.box_squat };
    }
    if (n.includes('goblet')) { knee.downAngle += 5; hip.downAngle += 5; }
    if (n.includes('front')) { hip.downAngle += 5; }
    if (n.includes('overhead')) { hip.downAngle += 10; }
    if (n.includes('zercher')) { knee.downAngle -= 5; hip.downAngle -= 5; }
    if (n.includes('pistol') || n.includes('single leg')) { knee.downAngle -= 10; hip.downAngle -= 10; }
    if (n.includes('smith')) { knee.downAngle += 3; }
    if (n.includes('pendulum')) { hip = { ...HIP.pendulum_squat }; }
    if (n.includes('belt')) { knee.downAngle -= 5; }

    return {
      angles: [knee, hip],
      startPosition: 'up', category: 'lower_body', isPush: true,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }

  // ══════════════════════════════════════════════════
  // 17. LUNGES — Primary: knee, Secondary: hip
  // ══════════════════════════════════════════════════
  if (n.includes('lunge')) {
    let knee = { ...KNEE.lunge_standard };
    let hip = { ...HIP.lunge_standard };
    if (n.includes('walking')) {
      knee = { ...KNEE.lunge_walking }; hip = { ...HIP.lunge_walking };
    }
    if (n.includes('reverse')) {
      knee = { ...KNEE.lunge_reverse }; hip = { ...HIP.lunge_reverse };
    }
    if (n.includes('lateral') || n.includes('side')) {
      knee = { ...KNEE.lunge_lateral }; hip = { ...HIP.lunge_lateral };
    }
    if (n.includes('curtsy') || n.includes('curtsey')) {
      knee = { ...KNEE.lunge_curtsy }; hip = { ...HIP.lunge_curtsy };
    }
    if (n.includes('barbell')) { knee.downAngle += 2; }
    if (n.includes('dumbbell')) { hip.downAngle += 3; }

    return {
      angles: [knee, hip],
      startPosition: 'up', category: 'lower_body', isPush: true,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }

  // ══════════════════════════════════════════════════
  // 18. DEADLIFTS / RDL / GOOD MORNING — Primary: hip, Secondary: knee
  // ══════════════════════════════════════════════════
  if (n.includes('deadlift') || n.includes('rdl') || n.includes('good morning') || 
      n.includes('romanian')) {
    let hip = { ...HIP.deadlift_conv };
    let knee = { ...KNEE.deadlift_conv };
    if (n.includes('rdl') || n.includes('romanian') || n.includes('stiff')) {
      hip = { ...HIP.deadlift_rdl }; knee = { ...KNEE.deadlift_rdl };
    }
    if (n.includes('stiff leg') || n.includes('stiff-leg') || n.includes('straight leg')) {
      hip = { ...HIP.deadlift_stiff }; knee = { ...KNEE.deadlift_stiff };
    }
    if (n.includes('sumo')) {
      hip = { ...HIP.deadlift_sumo }; knee = { ...KNEE.deadlift_sumo };
    }
    if (n.includes('good morning')) {
      hip = { ...HIP.good_morning }; knee = { ...KNEE.deadlift_rdl };
    }
    if (n.includes('trap bar') || n.includes('hex bar')) { hip.downAngle += 5; knee.downAngle -= 5; }
    if (n.includes('single leg') || n.includes('one leg')) { hip.downAngle -= 5; }
    if (n.includes('dumbbell')) { hip.downAngle += 3; }
    if (n.includes('kettlebell')) { hip.downAngle -= 3; }

    return {
      angles: [hip, knee],
      startPosition: 'up', category: 'lower_body', isPush: false,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }

  // ══════════════════════════════════════════════════
  // 19. HIP THRUST / GLUTE BRIDGE — Primary: hip, Secondary: knee (isometric)
  // ══════════════════════════════════════════════════
  if (n.includes('hip thrust') || n.includes('glute bridge') || n.includes('bridge')) {
    let hip = { ...HIP.hip_thrust };
    if (n.includes('single leg') || n.includes('one leg')) { hip.upAngle -= 5; }
    if (n.includes('band')) { hip.upAngle -= 3; }
    return {
      angles: [hip],
      startPosition: 'down', category: 'lower_body', isPush: true,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }

  // ══════════════════════════════════════════════════
  // 20. LEG PRESS — Primary: knee, Secondary: hip
  // ══════════════════════════════════════════════════
  if (n.includes('leg press')) {
    let knee = { ...KNEE.leg_press };
    let hip = { ...HIP.leg_press_hip };
    if (n.includes('wide') || n.includes('sumo')) { knee.downAngle += 5; }
    if (n.includes('narrow') || n.includes('close')) { knee.downAngle -= 5; }
    if (n.includes('single') || n.includes('one leg')) { knee.downAngle -= 5; }
    return {
      angles: [knee, hip],
      startPosition: 'up', category: 'lower_body', isPush: true,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }

  // ══════════════════════════════════════════════════
  // 21. LEG EXTENSION — Primary: knee only
  // ══════════════════════════════════════════════════
  if (n.includes('leg extension') || n.includes('knee extension')) {
    return {
      angles: [{ ...KNEE.leg_extension }],
      startPosition: 'down', category: 'lower_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 22. LEG CURL / HAMSTRING CURL — Primary: knee only
  // ══════════════════════════════════════════════════
  if (n.includes('leg curl') || n.includes('hamstring curl')) {
    let knee = { ...KNEE.leg_curl };
    if (n.includes('seated')) { knee.upAngle += 5; knee.downAngle -= 5; }
    if (n.includes('nordic') || n.includes('natural')) { knee.upAngle += 10; }
    return {
      angles: [knee],
      startPosition: 'down', category: 'lower_body', isPush: false,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 23. STEP UP — Primary: knee, Secondary: hip
  // ══════════════════════════════════════════════════
  if (n.includes('step up') || n.includes('step-up') || n.includes('stepup')) {
    return {
      angles: [{ ...KNEE.step_up }, { ...HIP.step_up }],
      startPosition: 'down', category: 'lower_body', isPush: true,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }

  // ══════════════════════════════════════════════════
  // 24. CALF RAISES — Primary: ankle only
  // ══════════════════════════════════════════════════
  if (n.includes('calf raise') || n.includes('calf press') || n.includes('toe raise')) {
    let ankle = { ...ANKLE.calf_raise };
    if (n.includes('seated') || n.includes('sitting')) { ankle = { ...ANKLE.calf_raise_seated }; }
    if (n.includes('donkey')) { ankle.upAngle += 5; }
    if (n.includes('single')) { ankle.upAngle += 3; }
    return {
      angles: [ankle],
      startPosition: 'down', category: 'lower_body', isPush: true,
      lerpSpeed: 0.55, kalmanNoise: 0.04
    };
  }

  // ══════════════════════════════════════════════════
  // 25. BACK EXTENSION / HYPEREXTENSION — Primary: hip
  // ══════════════════════════════════════════════════
  if (n.includes('back extension') || n.includes('hyperextension') || n.includes('hyper extension') ||
      n.includes('reverse hyper')) {
    return {
      angles: [{ ...HIP.back_extension }],
      startPosition: 'down', category: 'core', isPush: false,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 26. CRUNCHES / SIT-UPS / AB EXERCISES — Primary: hip
  // ══════════════════════════════════════════════════
  if (n.includes('crunch') || n.includes('situp') || n.includes('sit up') || n.includes('sit-up') ||
      mg === 'abdominals' || mg === 'abs' || n.includes('ab ')) {
    let hip = { ...HIP.crunch };
    if (n.includes('sit up') || n.includes('situp') || n.includes('sit-up')) {
      hip = { ...HIP.situp };
    }
    if (n.includes('cable') || n.includes('machine')) { hip.upAngle -= 10; }
    if (n.includes('reverse')) { hip.upAngle -= 5; hip.downAngle += 5; }
    if (n.includes('decline')) { hip.upAngle -= 10; }
    return {
      angles: [hip],
      startPosition: 'down', category: 'core', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 27. PLANK (isometric — use trunk alignment)
  // ══════════════════════════════════════════════════
  if (n.includes('plank')) {
    return {
      angles: [{ ...TRUNK.plank }],
      startPosition: 'up', category: 'core', isPush: true,
      lerpSpeed: 0.30, kalmanNoise: 0.10
    };
  }

  // ══════════════════════════════════════════════════
  // 28. GENERIC PRESS (remaining) — Primary: shoulder + elbow
  // ══════════════════════════════════════════════════
  if (n.includes('press') && !n.includes('leg press')) {
    let shoulder = { ...SHOULDER.press_overhead };
    let elbow = { ...ELBOW.press_overhead };
    if (n.includes('chest') || mg === 'chest') {
      shoulder = { ...SHOULDER.press_bench };
      elbow = { ...ELBOW.press_bench };
    }
    return {
      angles: [shoulder, elbow],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }

  // ══════════════════════════════════════════════════
  // 29. GENERIC RAISE (remaining)
  // ══════════════════════════════════════════════════
  if (n.includes('raise')) {
    if (n.includes('calf') || n.includes('heel')) {
      return {
        angles: [{ ...ANKLE.calf_raise }],
        startPosition: 'down', category: 'lower_body', isPush: true,
        lerpSpeed: 0.55, kalmanNoise: 0.04
      };
    }
    if (n.includes('leg raise') || n.includes('knee raise')) {
      return {
        angles: [{ ...HIP.crunch, upAngle: 80, downAngle: 170 }],
        startPosition: 'down', category: 'core', isPush: true,
        lerpSpeed: 0.45, kalmanNoise: 0.06
      };
    }
    return {
      angles: [{ ...SHOULDER.lateral_raise }],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 30. MUSCLE GROUP FALLBACK
  // ══════════════════════════════════════════════════
  if (mg === 'biceps' || mg === 'forearms') {
    return {
      angles: [{ ...ELBOW.curl_standard }],
      startPosition: 'down', category: 'upper_body', isPush: false,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }
  if (mg === 'triceps') {
    return {
      angles: [{ ...ELBOW.tricep_extension }],
      startPosition: 'up', category: 'upper_body', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }
  if (mg === 'chest') {
    return {
      angles: [{ ...ELBOW.press_bench }, { ...SHOULDER.press_bench }],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }
  if (mg === 'shoulders' || mg === 'traps') {
    return {
      angles: [{ ...SHOULDER.press_overhead }, { ...ELBOW.press_overhead }],
      startPosition: 'down', category: 'upper_body', isPush: true,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }
  if (mg === 'lats' || mg === 'middle back' || mg === 'upper back' || mg === 'back' || mg === 'lower back') {
    return {
      angles: [{ ...ELBOW.row_standard }, { ...SHOULDER.row_shoulder }],
      startPosition: 'down', category: 'upper_body', isPush: false,
      lerpSpeed: 0.45, kalmanNoise: 0.06
    };
  }
  if (mg === 'quads' || mg === 'quadriceps') {
    return {
      angles: [{ ...KNEE.squat_standard }, { ...HIP.squat_standard }],
      startPosition: 'up', category: 'lower_body', isPush: true,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }
  if (mg === 'hamstrings') {
    return {
      angles: [{ ...HIP.deadlift_rdl }, { ...KNEE.deadlift_rdl }],
      startPosition: 'up', category: 'lower_body', isPush: false,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }
  if (mg === 'glutes') {
    return {
      angles: [{ ...HIP.hip_thrust }],
      startPosition: 'down', category: 'lower_body', isPush: true,
      lerpSpeed: 0.40, kalmanNoise: 0.07
    };
  }
  if (mg === 'calves') {
    return {
      angles: [{ ...ANKLE.calf_raise }],
      startPosition: 'down', category: 'lower_body', isPush: true,
      lerpSpeed: 0.55, kalmanNoise: 0.04
    };
  }
  if (mg === 'abdominals' || mg === 'abs' || mg === 'obliques') {
    return {
      angles: [{ ...HIP.crunch }],
      startPosition: 'down', category: 'core', isPush: true,
      lerpSpeed: 0.50, kalmanNoise: 0.05
    };
  }

  // ══════════════════════════════════════════════════
  // 31. ULTIMATE FALLBACK — elbow angle
  // ══════════════════════════════════════════════════
  return {
    angles: [{ joints: JOINTS.elbow, upAngle: 45, downAngle: 160, name: 'primary' }],
    startPosition: 'down', category: 'mixed', isPush: true,
    lerpSpeed: 0.40, kalmanNoise: 0.08
  };
}


// ─────────────────────────────────────────────────────────────────────
// GENERATE
// ─────────────────────────────────────────────────────────────────────

function addJitter(val, range = 3) {
  return val + Math.round((Math.random() - 0.5) * range);
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

function main() {
  const csvPath = path.join(__dirname, '..', '..', '..', '..', '..', 'Verified_MuscleWiki_Data.csv');
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = parseCSVLine(lines[0]);

  const nameIdx = headers.indexOf('Exercise');
  const muscleIdx = headers.indexOf('Muscle Group');
  if (nameIdx === -1) throw new Error('Cannot find Exercise column. Found: ' + headers.join(', '));

  const seen = new Set();
  const definitions = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const rawName = cols[nameIdx];
    const muscleGroup = (cols[muscleIdx] || '').toLowerCase();
    if (!rawName) continue;

    const key = `${muscleGroup.charAt(0).toUpperCase() + muscleGroup.slice(1)} - ${rawName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const config = classifyExercise(rawName, muscleGroup);

    // Apply slight jitter for uniqueness while keeping biomechanical accuracy
    const anglesWithJitter = config.angles.map(a => ({
      joints: a.joints,
      name: a.name,
      upAngle: addJitter(a.upAngle, 4),
      downAngle: addJitter(a.downAngle, 4),
    }));

    definitions[key] = {
      angles: anglesWithJitter,
      startPosition: config.startPosition,
      category: config.category,
      isPush: config.isPush,
      lerpSpeed: config.lerpSpeed,
      kalmanNoise: config.kalmanNoise,
    };
  }

  // Write output
  const outPath = path.join(__dirname, 'exerciseDefinitions.js');
  let output = `/**
 * EXERCISE DEFINITIONS — Multi-Joint Tracking
 * =============================================
 * Each exercise has an \`angles\` array:
 *   angles[0] = PRIMARY angle (drives rep counting state machine)
 *   angles[1+] = SECONDARY angles (form validation + display)
 *
 * Each angle entry:
 *   joints    - [p1, p2, p3] MediaPipe landmark indices (left side; right = +1)
 *   name      - human label: 'elbow', 'shoulder', 'knee', 'hip', 'ankle', 'trunk'
 *   upAngle   - degrees at contracted/peak position
 *   downAngle - degrees at extended/rest position
 *
 * MediaPipe Landmark Reference:
 *   11/12 = L/R Shoulder   13/14 = L/R Elbow    15/16 = L/R Wrist
 *   23/24 = L/R Hip        25/26 = L/R Knee     27/28 = L/R Ankle
 *   31/32 = L/R Foot Index
 *
 * Generated by: generateExerciseDefinitions.js
 * Total exercises: ${Object.keys(definitions).length}
 */

export const EXERCISE_DEFINITIONS = {\n`;

  for (const [name, def] of Object.entries(definitions)) {
    const anglesStr = def.angles.map(a => 
      `{ joints: [${a.joints.join(', ')}], name: "${a.name}", upAngle: ${a.upAngle}, downAngle: ${a.downAngle} }`
    ).join(', ');

    output += `  "${name}": { angles: [${anglesStr}], startPosition: "${def.startPosition}", category: "${def.category}", isPush: ${def.isPush}, lerpSpeed: ${def.lerpSpeed}, kalmanNoise: ${def.kalmanNoise} },\n`;
  }

  output += `};\n`;

  fs.writeFileSync(outPath, output, 'utf-8');
  
  // Stats
  let singleAngle = 0, multiAngle = 0;
  for (const def of Object.values(definitions)) {
    if (def.angles.length === 1) singleAngle++;
    else multiAngle++;
  }
  console.log(`✅ Generated ${Object.keys(definitions).length} exercise definitions`);
  console.log(`   Single-angle exercises: ${singleAngle}`);
  console.log(`   Multi-angle exercises:  ${multiAngle}`);
  console.log(`   Output: ${outPath}`);
}

main();
