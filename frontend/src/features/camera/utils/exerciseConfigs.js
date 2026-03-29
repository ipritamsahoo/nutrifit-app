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
/**
 * Gets the individual tracking configuration for a specific exercise.
 * Supports "Smart Lookup" for partial names (e.g. "Overhead Press" -> "Shoulders - Overhead Press")
 */
export const getExerciseConfig = (exerciseName) => {
  if (!exerciseName) return DEFAULT_CONFIG;
  
  // 1. Exact match (fastest)
  let config = EXERCISE_DEFINITIONS[exerciseName];
  if (config) return config;

  // 2. Stripped match: "Muscle - Exercise" -> "Exercise"
  const entries = Object.entries(EXERCISE_DEFINITIONS);
  const strippedMatch = entries.find(([key]) => {
    const parts = key.split(' - ');
    const namePart = parts.length > 1 ? parts[1] : parts[0];
    return namePart.toLowerCase() === exerciseName.toLowerCase();
  });
  if (strippedMatch) return strippedMatch[1];

  // 3. Partial substring match
  const partialMatch = entries.find(([key]) => 
     key.toLowerCase().includes(exerciseName.toLowerCase())
  );
  if (partialMatch) return partialMatch[1];

  return DEFAULT_CONFIG;
};

/**
 * Normalizes an exercise name to the canonical key in EXERCISE_DEFINITIONS.
 */
export const normalizeExerciseName = (name) => {
  if (!name) return null;
  if (EXERCISE_DEFINITIONS[name]) return name;

  const entries = Object.entries(EXERCISE_DEFINITIONS);
  const matched = entries.find(([key]) => {
    const parts = key.split(' - ');
    const namePart = parts.length > 1 ? parts[1] : parts[0];
    return namePart.toLowerCase() === name.toLowerCase() || key.toLowerCase().includes(name.toLowerCase());
  });
  return matched ? matched[0] : null;
};

export const ALL_EXERCISE_NAMES = Object.keys(EXERCISE_DEFINITIONS);
