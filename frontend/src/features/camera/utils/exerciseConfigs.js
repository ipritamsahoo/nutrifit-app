/**
 * Exercise Configuration Bridge
 * ==============================
 * All exercise tracking logic now lives in exerciseDefinitions.js
 * This file provides the getExerciseConfig() API consumed by CameraView.
 */

import { EXERCISE_DEFINITIONS } from './exerciseDefinitions.js';

const DEFAULT_CONFIG = {
  angles: [
    { joints: [11, 13, 15], name: 'elbow', upAngle: 45, downAngle: 160 }
  ],
  startPosition: 'down',
  category: 'mixed',
  isPush: true,
  lerpSpeed: 0.40,
  kalmanNoise: 0.08
};

/**
 * Gets the individual tracking configuration for a specific exercise.
 * Each exercise has an `angles` array with primary + secondary angles.
 *
 * Returns:
 *   angles[0] = PRIMARY angle (used for rep counting)
 *   angles[1+] = SECONDARY angles (form check + display)
 *   Each angle: { joints, name, upAngle, downAngle }
 */
export const getExerciseConfig = (exerciseName) => {
  const config = EXERCISE_DEFINITIONS[exerciseName];
  if (!config) return DEFAULT_CONFIG;
  return config;
};

export const ALL_EXERCISE_NAMES = Object.keys(EXERCISE_DEFINITIONS);
