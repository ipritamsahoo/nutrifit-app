/**
 * drawUtils.js
 * =============
 * Pure canvas-drawing helpers for pose landmarks and skeleton connections.
 * No React dependency – works with any CanvasRenderingContext2D.
 *
 * Enhanced with:
 *  - Dynamic skeleton color based on form status
 *  - Smoother rendering with alpha blending
 */

import { POSE_CONNECTIONS } from './poseUtils';

/* ── Colour palette ─────────────────────────────────────────────── */
const COLOR_LEFT   = '#ff7f00'; // Orange for person's left side
const COLOR_RIGHT  = '#00d4ff'; // Cyan for person's right side
const COLOR_CENTER = '#ffffff'; // White for center/fallback
const KEYPOINT_BORDER  = '#ffffff';
const KEYPOINT_RADIUS  = 4;
const KEYPOINT_BORDER_WIDTH = 1;
const LINE_WIDTH       = 3;

/* ── Status colors for skeleton ─────────────────────────────────── */
const STATUS_COLORS = {
  idle:        '#ffffff',   // White – neutral
  inProgress:  '#fbbf24',   // Amber/Yellow – working
  success:     '#22c55e',   // Green – target reached
};

/* ── Visibility threshold ───────────────────────────────────────── */
const MIN_VISIBILITY = 0.25;  // Lower to keep side-view landmarks visible

/**
 * Helper to determine landmark color based on its index
 */
function getLandmarkColor(index) {
  if (index === 0) return COLOR_CENTER;
  if ([1, 2, 3, 7, 9].includes(index)) return COLOR_LEFT;
  if ([4, 5, 6, 8, 10].includes(index)) return COLOR_RIGHT;
  if (index >= 11 && index % 2 !== 0) return COLOR_LEFT;
  if (index >= 12 && index % 2 === 0) return COLOR_RIGHT;
  return COLOR_CENTER;
}

/**
 * clearCanvas – wipe the canvas for the next frame.
 */
export function clearCanvas(ctx, width, height) {
  ctx.clearRect(0, 0, width, height);
}

/**
 * drawKeypoints – draw a small filled circle at each landmark.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks  – array of 33 { x, y, z, visibility } objects
 * @param {number} width     – canvas width in pixels
 * @param {number} height    – canvas height in pixels
 * @param {string} status    – 'idle' | 'inProgress' | 'success'
 */
export function drawKeypoints(ctx, landmarks, width, height, status = 'idle') {
  ctx.lineWidth = KEYPOINT_BORDER_WIDTH;
  ctx.strokeStyle = KEYPOINT_BORDER;

  const glowColor = STATUS_COLORS[status] || STATUS_COLORS.idle;

  for (let index = 0; index < landmarks.length; index++) {
    const lm = landmarks[index];
    if (lm.visibility < MIN_VISIBILITY) continue;

    const x = lm.x * width;
    const y = lm.y * height;

    ctx.globalAlpha = Math.max(0.5, lm.visibility);

    // Glow effect for success state
    if (status === 'success') {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = status === 'idle' ? getLandmarkColor(index) : glowColor;

    ctx.beginPath();
    ctx.arc(x, y, KEYPOINT_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/**
 * drawConnections – draw lines between connected joints.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks
 * @param {number} width
 * @param {number} height
 * @param {string} status – 'idle' | 'inProgress' | 'success'
 */
export function drawConnections(ctx, landmarks, width, height, status = 'idle') {
  const connectionColor = STATUS_COLORS[status] || STATUS_COLORS.idle;
  ctx.strokeStyle = connectionColor;
  ctx.lineWidth   = status === 'success' ? LINE_WIDTH + 1 : LINE_WIDTH;
  ctx.lineCap     = 'round';

  // Glow for success
  if (status === 'success') {
    ctx.shadowColor = connectionColor;
    ctx.shadowBlur = 8;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  for (const [i, j] of POSE_CONNECTIONS) {

    const a = landmarks[i];
    const b = landmarks[j];
    if (a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;

    ctx.globalAlpha = Math.max(0.4, Math.min(a.visibility, b.visibility));

    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}
