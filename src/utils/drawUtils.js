/**
 * drawUtils.js
 * =============
 * Pure canvas-drawing helpers for pose landmarks and skeleton connections.
 * No React dependency – works with any CanvasRenderingContext2D.
 */

import { POSE_CONNECTIONS } from './poseUtils';
import { LANDMARK } from './angleUtils';

/* ── Colour palette ─────────────────────────────────────────────── */
const KEYPOINT_COLOR   = '#00ffaa';          // bright mint
const KEYPOINT_BORDER  = '#006644';
const CONNECTION_COLOR = 'rgba(0, 200, 255, 0.6)';  // cyan glow
const KEYPOINT_RADIUS  = 5;
const LINE_WIDTH       = 3;
const ANGLE_TEXT_COLOR  = '#ffffff';
const ANGLE_BG_COLOR   = 'rgba(0, 0, 0, 0.55)';

/* ── Visibility threshold ───────────────────────────────────────── */
const MIN_VISIBILITY = 0.3;

/**
 * clearCanvas – wipe the canvas for the next frame.
 */
export function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

/**
 * drawKeypoints – draw a small filled circle at each landmark.
 *
 * Each landmark has { x, y, visibility } where x/y are normalised 0-1.
 * We scale by canvas dimensions so the overlay lines up with the video.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks  – array of 33 { x, y, z, visibility } objects
 * @param {number} width     – canvas width in pixels
 * @param {number} height    – canvas height in pixels
 */
export function drawKeypoints(ctx, landmarks, width, height) {
  for (const lm of landmarks) {
    // Skip low-confidence landmarks to avoid drawing at wrong positions
    if (lm.visibility < MIN_VISIBILITY) continue;

    const x = lm.x * width;
    const y = lm.y * height;

    // Use opacity proportional to visibility for extra clarity
    const alpha = Math.max(0.4, lm.visibility);

    ctx.fillStyle   = KEYPOINT_COLOR;
    ctx.strokeStyle = KEYPOINT_BORDER;
    ctx.lineWidth   = 1.5;
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(x, y, KEYPOINT_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  ctx.globalAlpha = 1; // reset
}

/**
 * drawConnections – draw lines between connected joints.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks
 * @param {number} width
 * @param {number} height
 */
export function drawConnections(ctx, landmarks, width, height) {
  ctx.strokeStyle = CONNECTION_COLOR;
  ctx.lineWidth   = LINE_WIDTH;
  ctx.lineCap     = 'round';

  for (const [i, j] of POSE_CONNECTIONS) {
    const a = landmarks[i];
    const b = landmarks[j];

    // Skip connection if either endpoint is low-confidence
    if (a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;

    // Use the lower visibility of the two endpoints for line opacity
    const alpha = Math.max(0.3, Math.min(a.visibility, b.visibility));
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  ctx.globalAlpha = 1; // reset
}

/**
 * drawAngleAtJoint – renders an angle value as a label near a joint.
 *
 * Draws a small rounded-rect background with the angle text on top,
 * positioned near the specified landmark index.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array}  landmarks
 * @param {number} jointIndex – landmark index of the joint (e.g. LEFT_ELBOW)
 * @param {number} angle      – the angle in degrees (will be rounded)
 * @param {number} width      – canvas width
 * @param {number} height     – canvas height
 */
export function drawAngleAtJoint(ctx, landmarks, jointIndex, angle, width, height) {
  if (angle === null || angle === undefined) return;

  const lm = landmarks[jointIndex];
  if (!lm || lm.visibility < MIN_VISIBILITY) return;

  const x = lm.x * width;
  const y = lm.y * height;
  const label = `${Math.round(angle)}°`;

  // Responsive font size based on canvas width
  const fontSize = Math.max(12, Math.round(width / 50));
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;

  const textMetrics = ctx.measureText(label);
  const textW = textMetrics.width;
  const textH = fontSize;
  const padX = 6;
  const padY = 4;
  const offsetX = 12;
  const offsetY = -12;

  // Background pill
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = ANGLE_BG_COLOR;
  const rx = x + offsetX;
  const ry = y + offsetY - textH;
  const rw = textW + padX * 2;
  const rh = textH + padY * 2;
  const radius = 6;

  ctx.beginPath();
  ctx.moveTo(rx + radius, ry);
  ctx.lineTo(rx + rw - radius, ry);
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
  ctx.lineTo(rx + rw, ry + rh - radius);
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
  ctx.lineTo(rx + radius, ry + rh);
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
  ctx.lineTo(rx, ry + radius);
  ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.globalAlpha = 1;
  ctx.fillStyle = ANGLE_TEXT_COLOR;
  ctx.textBaseline = 'top';
  ctx.fillText(label, rx + padX, ry + padY);
}

/**
 * drawAngles – draws angle labels at both elbows (if visible).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array}  landmarks
 * @param {{ leftAngle: number|null, rightAngle: number|null }} angles
 * @param {number} width
 * @param {number} height
 */
export function drawAngles(ctx, landmarks, angles, width, height) {
  if (angles.leftAngle !== null) {
    drawAngleAtJoint(ctx, landmarks, LANDMARK.LEFT_ELBOW, angles.leftAngle, width, height);
  }
  if (angles.rightAngle !== null) {
    drawAngleAtJoint(ctx, landmarks, LANDMARK.RIGHT_ELBOW, angles.rightAngle, width, height);
  }
}
