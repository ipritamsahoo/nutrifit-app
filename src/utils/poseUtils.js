/**
 * poseUtils.js
 * ============
 * Encapsulates MediaPipe Pose initialisation and frame-sending logic.
 * Keeps all MediaPipe concerns out of the React component.
 */

import { Pose } from '@mediapipe/pose';

/**
 * POSE_CONNECTIONS
 * ----------------
 * Pairs of landmark indices that should be connected by lines to form a
 * skeleton.  Based on the standard MediaPipe Pose topology (33 landmarks).
 */
export const POSE_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7],
  [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],

  // Torso
  [11, 12],
  [11, 23], [12, 24],
  [23, 24],

  // Left arm
  [11, 13], [13, 15],
  [15, 17], [15, 19], [15, 21],
  [17, 19],

  // Right arm
  [12, 14], [14, 16],
  [16, 18], [16, 20], [16, 22],
  [18, 20],

  // Left leg
  [23, 25], [25, 27],
  [27, 29], [27, 31], [29, 31],

  // Right leg
  [24, 26], [26, 28],
  [28, 30], [28, 32], [30, 32],
];

/**
 * createPoseDetector
 * -------------------
 * Factory that creates a configured MediaPipe Pose instance and wires up
 * the onResults callback.
 *
 * @param {Function} onResults  – called with MediaPipe results on every frame
 * @returns {{ pose: Pose, sendFrame: (videoEl: HTMLVideoElement) => Promise<void> }}
 */
export function createPoseDetector(onResults) {
  const pose = new Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
  });

  pose.setOptions({
    modelComplexity: 2, // 2 is heavier but much more accurate for full-body
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  pose.onResults(onResults);

  /**
   * sendFrame – sends a single video frame to the pose model.
   * Returns a promise that resolves when processing is done.
   */
  async function sendFrame(videoElement) {
    if (videoElement && videoElement.readyState >= 2) {
      await pose.send({ image: videoElement });
    }
  }

  return { pose, sendFrame };
}
