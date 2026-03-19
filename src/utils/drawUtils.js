/**
 * drawUtils.js
 * =============
 * Pure canvas-drawing helpers for pose landmarks and skeleton connections.
 * No React dependency – works with any CanvasRenderingContext2D.
 */

import { POSE_CONNECTIONS } from './poseUtils';

/* ── Colour palette ─────────────────────────────────────────────── */
const KEYPOINT_COLOR   = '#00ffaa';          // bright mint
const KEYPOINT_BORDER  = '#006644';
const CONNECTION_COLOR = 'rgba(0, 200, 255, 0.6)';  // cyan glow
const KEYPOINT_RADIUS  = 4;
const LINE_WIDTH       = 2.5;

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
  ctx.fillStyle   = KEYPOINT_COLOR;
  ctx.strokeStyle = KEYPOINT_BORDER;
  ctx.lineWidth   = 1.5;

  for (const lm of landmarks) {
    // Removed visibility check to ensure all 33 landmarks always draw, 
    // even if the model is guessing their location.
    // if (lm.visibility < 0.1) continue;

    const x = lm.x * width;
    const y = lm.y * height;

    ctx.beginPath();
    ctx.arc(x, y, KEYPOINT_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
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

    // Removed visibility check to ensure the full skeleton is always connected
    // if (a.visibility < 0.1 || b.visibility < 0.1) continue;

    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
}
