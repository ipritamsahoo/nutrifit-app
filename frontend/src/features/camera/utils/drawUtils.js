/**
 * drawUtils.js
 * =============
 * Pure canvas-drawing helpers for pose landmarks and skeleton connections.
 * No React dependency – works with any CanvasRenderingContext2D.
 */

import { POSE_CONNECTIONS } from './poseUtils';

/* ── Colour palette ─────────────────────────────────────────────── */
const COLOR_LEFT   = '#ff7f00'; // Orange for person's left side
const COLOR_RIGHT  = '#00d4ff'; // Cyan for person's right side
const COLOR_CENTER = '#ffffff'; // White for center/fallback
const KEYPOINT_BORDER  = '#ffffff';
const CONNECTION_COLOR = '#ffffff';
const KEYPOINT_RADIUS  = 4;
const KEYPOINT_BORDER_WIDTH = 1;
const LINE_WIDTH       = 3;

/* ── Visibility threshold ───────────────────────────────────────── */
// Landmarks below this visibility are not drawn.
// This filters out wildly inaccurate guesses while keeping most joints.
const MIN_VISIBILITY = 0.5;  // Higher = hides unreliable side-view landmarks

/**
 * Helper to determine landmark color based on its index
 */
function getLandmarkColor(index) {
  if (index === 0) return COLOR_CENTER;
  // Left face (Orange)
  if ([1, 2, 3, 7, 9].includes(index)) return COLOR_LEFT;
  // Right face (Cyan)
  if ([4, 5, 6, 8, 10].includes(index)) return COLOR_RIGHT;
  // Body left (Orange) - odd indices >= 11
  if (index >= 11 && index % 2 !== 0) return COLOR_LEFT;
  // Body right (Cyan) - even indices >= 12
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
 * Each landmark has { x, y, visibility } where x/y are normalised 0-1.
 * We scale by canvas dimensions so the overlay lines up with the video.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} landmarks  – array of 33 { x, y, z, visibility } objects
 * @param {number} width     – canvas width in pixels
 * @param {number} height    – canvas height in pixels
 */
export function drawKeypoints(ctx, landmarks, width, height) {
  ctx.lineWidth = KEYPOINT_BORDER_WIDTH;
  ctx.strokeStyle = KEYPOINT_BORDER;

  for (let index = 11; index < landmarks.length; index++) {
    const lm = landmarks[index];
    // Skip low-confidence landmarks
    if (lm.visibility < MIN_VISIBILITY) continue;

    const x = lm.x * width;
    const y = lm.y * height;

    ctx.globalAlpha = Math.max(0.5, lm.visibility);
    ctx.fillStyle = getLandmarkColor(index);

    ctx.beginPath();
    ctx.arc(x, y, KEYPOINT_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
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
    // Skip face connections (both endpoints < 11)
    if (i < 11 && j < 11) continue;

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
}
