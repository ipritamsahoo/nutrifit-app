/**
 * speechUtils.js
 * ==============
 * Browser-native Text-to-Speech helper with debounce logic.
 * Prevents the same message from being spoken repeatedly.
 */

let lastSpoken = '';
let lastSpokeAt = 0;
const MIN_INTERVAL_MS = 2500; // Minimum gap between announcements

/**
 * Speak a message using the browser's SpeechSynthesis API.
 * - Skips if the same message was spoken recently.
 * - Cancels any in-progress speech before starting new one.
 *
 * @param {string} message - The text to speak
 * @param {boolean} muted  - If true, skip speaking
 */
export function speak(message, muted = false) {
  if (muted || !message) return;
  if (!window.speechSynthesis) return;

  const now = Date.now();

  // Don't repeat the same message within the debounce window
  if (message === lastSpoken && (now - lastSpokeAt) < MIN_INTERVAL_MS) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 1.1;   // Slightly faster for workout pace
  utterance.pitch = 1.0;
  utterance.volume = 0.85;

  // Try to pick an English voice
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(v => v.lang.startsWith('en'));
  if (enVoice) utterance.voice = enVoice;

  window.speechSynthesis.speak(utterance);
  lastSpoken = message;
  lastSpokeAt = now;
}

/**
 * Stop any ongoing speech immediately.
 */
export function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  lastSpoken = '';
}
