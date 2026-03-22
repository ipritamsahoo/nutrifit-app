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
const KEYPOINT_RADIUS  = 6;
const KEYPOINT_BORDER_WIDTH = 2;
const LINE_WIDTH       = 4;

/* ── Visibility threshold ───────────────────────────────────────── */
// Landmarks below this visibility are not drawn.
// This filters out wildly inaccurate guesses while keeping most joints.
const MIN_VISIBILITY = 0.3;

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
  landmarks.forEach((lm, index) => {
    // Skip low-confidence landmarks to avoid drawing at wrong positions
    if (lm.visibility < MIN_VISIBILITY) return;

    const x = lm.x * width;
    const y = lm.y * height;

    // Use opacity proportional to visibility for extra clarity
    const alpha = Math.max(0.4, lm.visibility);

    ctx.fillStyle   = getLandmarkColor(index);
    ctx.strokeStyle = KEYPOINT_BORDER;
    ctx.lineWidth   = KEYPOINT_BORDER_WIDTH;
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(x, y, KEYPOINT_RADIUS, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });

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
