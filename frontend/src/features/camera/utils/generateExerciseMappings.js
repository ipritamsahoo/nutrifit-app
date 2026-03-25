const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '../../../../../Verified_MuscleWiki_Data.csv');
const outputPath = path.join(__dirname, 'exerciseConfigs.js');

const rawCsv = fs.readFileSync(csvPath, 'utf8');
const lines = rawCsv.split('\n').filter(l => l.trim().length > 0);

// Define our core movement patterns config
// Joints are MediaPipe indices:
// 11 = left shoulder, 12 = right shoulder
// 13 = left elbow, 14 = right elbow
// 15 = left wrist, 16 = right wrist
// 23 = left hip, 24 = right hip
// 25 = left knee, 26 = right knee
// 27 = left ankle, 28 = right ankle
// 31 = left foot index, 32 = right foot index
// Note: We use the left side (odd indices) as default, but in dynamic tracking we'll pick the most visible side.
const MOVEMENT_PATTERNS = {
  // Lower Body Patterns
  squat: { type: 'squat', joints: [23, 25, 27], upThreshold: 160, downThreshold: 100, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'lower_body', isPush: true },
  deadlift: { type: 'deadlift', joints: [11, 23, 25], upThreshold: 170, downThreshold: 120, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'lower_body', isPush: true },
  lunge: { type: 'lunge', joints: [23, 25, 27], upThreshold: 160, downThreshold: 100, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'lower_body', isPush: true },
  calf_raise: { type: 'calf_raise', joints: [25, 27, 31], upThreshold: 120, downThreshold: 90, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'lower_body', isPush: true },

  // Upper Body Pull Patterns
  curl: { type: 'curl', joints: [11, 13, 15], upThreshold: 35, downThreshold: 150, defaultParams: { LERP_SPEED: 0.50, KALMAN_NOISE: 0.05 }, category: 'upper_body', isPush: false },
  row: { type: 'row', joints: [11, 13, 15], upThreshold: 80, downThreshold: 160, defaultParams: { LERP_SPEED: 0.50, KALMAN_NOISE: 0.05 }, category: 'upper_body', isPush: false },
  pullup: { type: 'pullup', joints: [11, 13, 15], upThreshold: 60, downThreshold: 160, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'upper_body', isPush: false },

  // Upper Body Push Patterns
  press: { type: 'press', joints: [11, 13, 15], upThreshold: 160, downThreshold: 90, defaultParams: { LERP_SPEED: 0.50, KALMAN_NOISE: 0.05 }, category: 'upper_body', isPush: true },
  pushup: { type: 'pushup', joints: [11, 13, 15], upThreshold: 160, downThreshold: 90, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'upper_body', isPush: true },
  fly: { type: 'fly', joints: [11, 13, 15], upThreshold: 140, downThreshold: 160, defaultParams: { LERP_SPEED: 0.50, KALMAN_NOISE: 0.05 }, category: 'upper_body', isPush: true },
  raise: { type: 'raise', joints: [23, 11, 13], upThreshold: 90, downThreshold: 20, defaultParams: { LERP_SPEED: 0.50, KALMAN_NOISE: 0.05 }, category: 'upper_body', isPush: true },
  extension: { type: 'extension', joints: [11, 13, 15], upThreshold: 160, downThreshold: 90, defaultParams: { LERP_SPEED: 0.50, KALMAN_NOISE: 0.05 }, category: 'upper_body', isPush: true }, // triceps
  
  // Core / Default
  situp: { type: 'situp', joints: [11, 23, 25], upThreshold: 80, downThreshold: 160, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'core', isPush: false },
  plank: { type: 'plank', joints: [11, 23, 25], upThreshold: 160, downThreshold: 180, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'core', isPush: true },
  
  default: { type: 'default', joints: [11, 13, 15], upThreshold: 45, downThreshold: 160, defaultParams: { LERP_SPEED: 0.40, KALMAN_NOISE: 0.1 }, category: 'mixed', isPush: true }
};

const EXERCISE_MAPPINGS = {};

// Skip header (i=1)
for (let i = 1; i < lines.length; i++) {
  const match = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
  let cols;
  if(match) {
    cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
  } else {
    cols = lines[i].split(',');
  }

  if (cols.length < 2) continue;
  
  let muscleGroup = cols[0].replace(/"/g, '').trim();
  let exerciseName = cols[1].replace(/"/g, '').trim();
  
  if (!exerciseName) continue;
  
  const nameLower = exerciseName.toLowerCase();
  
  let pattern = 'default';
  
  if (nameLower.includes('squat')) pattern = 'squat';
  else if (nameLower.includes('deadlift') || nameLower.includes('hinge') || nameLower.includes('good morning') || nameLower.includes('pullthrough')) pattern = 'deadlift';
  else if (nameLower.includes('lunge') || nameLower.includes('step up')) pattern = 'lunge';
  else if (nameLower.includes('calf raise')) pattern = 'calf_raise';
  else if (nameLower.includes('curl')) pattern = 'curl';
  else if (nameLower.includes('row')) pattern = 'row';
  else if (nameLower.includes('pull up') || nameLower.includes('pullup') || nameLower.includes('chin up') || nameLower.includes('pulldown') || nameLower.includes('muscle up')) pattern = 'pullup';
  else if (nameLower.includes('press')) pattern = 'press';
  else if (nameLower.includes('push up') || nameLower.includes('pushup') || nameLower.includes('dip')) pattern = 'pushup';
  else if (nameLower.includes('fly')) pattern = 'fly';
  else if (nameLower.includes('raise') || nameLower.includes('shrug')) pattern = 'raise';
  else if (nameLower.includes('extension') || nameLower.includes('kickback') || nameLower.includes('tricep') || nameLower.includes('skullcrusher')) pattern = 'extension';
  else if (nameLower.includes('sit up') || nameLower.includes('situp') || nameLower.includes('crunch') || nameLower.includes('twist')) pattern = 'situp';
  else if (nameLower.includes('plank') || nameLower.includes('hold') || nameLower.includes('superman') || nameLower.includes('dog')) pattern = 'plank';
  // Fallbacks based on muscle
  else if (muscleGroup.toLowerCase().includes('bicep')) pattern = 'curl';
  else if (muscleGroup.toLowerCase().includes('tricep')) pattern = 'extension';
  else if (muscleGroup.toLowerCase().includes('leg') || muscleGroup.toLowerCase().includes('quad') || muscleGroup.toLowerCase().includes('glute')) pattern = 'squat';
  else if (muscleGroup.toLowerCase().includes('chest')) pattern = 'press';
  else if (muscleGroup.toLowerCase().includes('back')) pattern = 'row';
  else if (muscleGroup.toLowerCase().includes('shoulder')) pattern = 'raise';
  else if (muscleGroup.toLowerCase().includes('abdominals') || muscleGroup.toLowerCase().includes('core')) pattern = 'situp';
  
  EXERCISE_MAPPINGS[exerciseName] = pattern;
}

const fileContent = `/**
 * AUTO-GENERATED FILE
 * Do not modify the EXERCISE_MAPPINGS manually unless adding a specific override.
 * Modify frontend/src/features/camera/utils/generateExerciseMappings.js to regenerate.
 */

export const MOVEMENT_PATTERNS = ${JSON.stringify(MOVEMENT_PATTERNS, null, 2)};

export const EXERCISE_MAPPINGS = ${JSON.stringify(EXERCISE_MAPPINGS, null, 2)};

export const getExerciseConfig = (exerciseName) => {
  const patternId = EXERCISE_MAPPINGS[exerciseName] || 'default';
  return MOVEMENT_PATTERNS[patternId];
};
`;

const destDir = path.dirname(outputPath);
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.writeFileSync(outputPath, fileContent, 'utf8');
console.log('Successfully generated frontend/src/features/camera/utils/exerciseConfigs.js with ' + Object.keys(EXERCISE_MAPPINGS).length + ' exercises.');
