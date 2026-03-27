/**
 * drawUtils.js
 * =============
 * Exact KinesteX-style custom skeleton tracking renderer.
 * Features hollow 'tapered capsules' for bones (perfectly rounded ends),
 * thin crisp borders, precise gaps at joints, and solid keypoint circles.
 */

/* ── Status colors for skeleton (KinesteX Neon Style) ───────────── */
const STATUS_COLORS = {
  uncalibrated: '#FF3333',  // Neon Red for out-of-bounds/calibration
  idle:        '#39FF14',   // Neon Green
  inProgress:  '#FFD700',   // Vivid Gold/Yellow 
  success:     '#39FF14',   // Neon Green + heavier glow for success
};

const MIN_VISIBILITY = 0.25;

// Defined standard widths (radii) for the custom drawn bones
// Adjusted to be much thinner ('soru') as requested, except chest/waist as per new feedback
const CUSTOM_BONES = [
  // Torso
  { joints: [11, 12], w1: 5,  w2: 5 },  // Shoulders (chest bar - thicker)
  { joints: [23, 24], w1: 5,  w2: 5 },  // Hips (waist bar - thicker)
  { joints: [11, 23], w1: 7,  w2: 4 },  // Left Torso side
  { joints: [12, 24], w1: 7,  w2: 4 },  // Right Torso side
  
  // Arms
  { joints: [11, 13], w1: 7,  w2: 4 },  // Left Upper Arm
  { joints: [13, 15], w1: 4,  w2: 2.5 },// Left Lower Arm
  { joints: [12, 14], w1: 7,  w2: 4 },  // Right Upper Arm
  { joints: [14, 16], w1: 4,  w2: 2.5 },// Right Lower Arm
  
  // Legs
  { joints: [23, 25], w1: 9,  w2: 5 },  // Left Upper Leg
  { joints: [25, 27], w1: 5,  w2: 3 },  // Left Lower Leg
  { joints: [24, 26], w1: 9,  w2: 5 },  // Right Upper Leg
  { joints: [26, 28], w1: 5,  w2: 3 },  // Right Lower Leg

  // Hands (Thin lines/polygons)
  { joints: [15, 17], w1: 1.5, w2: 1.5 },
  { joints: [15, 19], w1: 1.5, w2: 1.5 },
  { joints: [15, 21], w1: 1.5, w2: 1.5 },
  { joints: [16, 18], w1: 1.5, w2: 1.5 },
  { joints: [16, 20], w1: 1.5, w2: 1.5 },
  { joints: [16, 22], w1: 1.5, w2: 1.5 },

  // Feet (Thin lines/polygons)
  { joints: [27, 29], w1: 2, w2: 1.5 },
  { joints: [29, 31], w1: 1.5, w2: 1 },
  { joints: [31, 27], w1: 1.5, w2: 1.5 },
  { joints: [28, 30], w1: 2, w2: 1.5 },
  { joints: [30, 32], w1: 1.5, w2: 1 },
  { joints: [32, 28], w1: 1.5, w2: 1.5 },
];

/**
 * clearCanvas – wipe the canvas for the next frame.
 */
export function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

/**
 * Draw a beautifully rounded "tapered capsule" between two joints
 * This perfectly mimics the pill-like / capsule shapes seen in the reference image.
 */
function drawBone(ctx, p1, p2, w1, w2, width, height, themeColor, isGlow) {
  if (p1.visibility < MIN_VISIBILITY || p2.visibility < MIN_VISIBILITY) return;

  // Scale factor to keep proportions consistent regardless of video feed size
  const scale = Math.max(width, height) / 800; // Baseline 800px

  const x1 = p1.x * width;
  const y1 = p1.y * height;
  const x2 = p2.x * width;
  const y2 = p2.y * height;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  
  const GAP = 15 * scale; // Responsive gap between keypoint center and bone end
  if (len <= GAP * 2) return; // Bone too short to draw realistically

  // Normalized direction vector
  const ux = dx / len;
  const uy = dy / len;

  // New start and end points shifted by the precise GAP
  const startX = x1 + ux * GAP;
  const startY = y1 + uy * GAP;
  const endX = x2 - ux * GAP;
  const endY = y2 - uy * GAP;

  const boneLen = len - 2 * GAP;
  let R = w1 * scale; // Radius of start cap
  let r = w2 * scale; // Radius of end cap

  // Safety net to prevent Math.asin NaN if R - r > boneLen
  if (Math.abs(R - r) >= boneLen) {
    if (R > r) R = r + boneLen - 0.1;
    else r = R + boneLen - 0.1; 
  }

  // Calculate the tangent wrapper (convex hull of two circles)
  const angle = Math.atan2(endY - startY, endX - startX);
  const alpha = Math.asin((R - r) / boneLen);

  const a1 = angle + Math.PI / 2 + alpha;
  const a2 = angle - Math.PI / 2 - alpha;

  ctx.beginPath();
  // We draw the arc around the start point (covers the back)
  // going from a1 to a2 clockwise.
  ctx.arc(startX, startY, R, a1, a2, false);
  // We draw the arc around the end point (covers the front)
  // going from a2 to a1 clockwise.
  ctx.arc(endX, endY, r, a2, a1, false);
  ctx.closePath();

  // Thin, crisp border
  ctx.strokeStyle = themeColor;
  ctx.lineWidth = 2 * scale; // Responsive line width

  if (isGlow) {
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 12 * scale; // Responsive glow
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  const alphaOpacity = Math.max(0.4, Math.min(p1.visibility, p2.visibility));
  ctx.globalAlpha = alphaOpacity;
  
  // Stroke ONLY to make them hollow and sleek
  ctx.stroke();
}

/**
 * drawConnections – draws the custom capsule bones
 */
export function drawConnections(ctx, landmarks, width, height, status = 'idle') {
  const themeColor = STATUS_COLORS[status] || STATUS_COLORS.idle;
  const isSuccess = status === 'success';

  for (const bone of CUSTOM_BONES) {
    const p1 = landmarks[bone.joints[0]];
    const p2 = landmarks[bone.joints[1]];
    if (p1 && p2) {
      drawBone(ctx, p1, p2, bone.w1, bone.w2, width, height, themeColor, isSuccess);
    }
  }

  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/**
 * drawKeypoints – draws solid dots on joints
 */
export function drawKeypoints(ctx, landmarks, width, height, status = 'idle') {
  const themeColor = STATUS_COLORS[status] || STATUS_COLORS.idle;
  const scale = Math.max(width, height) / 800; // Baseline 800px

  ctx.fillStyle = themeColor;

  for (let index = 11; index < landmarks.length; index++) { // Start at 11 to skip face
    const lm = landmarks[index];
    if (lm.visibility < MIN_VISIBILITY) continue;

    const x = lm.x * width;
    const y = lm.y * height;

    // Small precise circles scaled responsively
    let radius = 5 * scale; 
    if ([29, 30, 31, 32, 17, 18, 19, 20, 21, 22].includes(index)) {
      radius = 3 * scale; // hands/feet smaller
    }

    ctx.globalAlpha = Math.max(0.6, lm.visibility);

    if (status === 'success') {
      ctx.shadowColor = themeColor;
      ctx.shadowBlur = 10 * scale; // Glow scaled
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

