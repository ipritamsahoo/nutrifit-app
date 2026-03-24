/**
 * CameraView.jsx
 * ===============
 * MediaPipe AI Trainer component:
 *   1. Opens the webcam via react-webcam
 *   2. Sends frames to MediaPipe Pose for landmark detection
 *   3. Draws a real-time skeleton overlay on a <canvas>
 *   4. Tracks exercise reps, angle, and form quality
 *   5. Provides real-time feedback (visual + voice)
 *   6. Saves workout log to Firestore when session ends
 *
 * Supports: Squats, Bicep Curls (easily extensible)
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { createPoseDetector } from './utils/poseUtils';
import { clearCanvas, drawKeypoints, drawConnections } from './utils/drawUtils';
import { calculateAngle, checkRepSquat, checkRepBicepCurl } from './utils/angleUtils';
import { createLandmarkFilters, filterLandmarks, predictLandmarks, lerpLandmarks } from './utils/cvKalmanFilter';
import { speak, stopSpeaking } from './utils/speechUtils';
import { useAuth } from '../../contexts/AuthContext';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import './CameraView.css';

/* ── Constants ──────────────────────────────────────────────────── */
const REQUESTED_WIDTH = 480;
const REQUESTED_HEIGHT = 360;
const LERP_SPEED = 0.40;  // Balance: smooth but responsive to body movement

const EXERCISES = [
  { id: 'squat', name: 'Squats', icon: '🦵' },
  { id: 'bicepCurl', name: 'Bicep Curls', icon: '💪' },
];

function CameraView() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  /* ── Refs (no re-renders) ───────────────────────────────────── */
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarksRef = useRef(null);
  const poseRef = useRef(null);
  const rafIdRef = useRef(null);
  const fpsRef = useRef(0);
  const frameTimesRef = useRef([]);
  const workoutStateRef = useRef('up');
  const repsRef = useRef(0);
  const currentAngleRef = useRef(0);
  const sessionStartRef = useRef(null);
  const kalmanFiltersRef = useRef(createLandmarkFilters(33));
  const hasNewDataRef = useRef(false);
  const framesSinceDataRef = useRef(0);
  const ctxRef = useRef(null);

  // Lerp interpolation refs
  const prevDrawLandmarksRef = useRef(null);

  // Form scoring refs
  const successRepsRef = useRef(0);  // Reps where user hit target depth

  /* ── State ──────────────────────────────────────────────────── */
  const [poseDetected, setPoseDetected] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [fps, setFps] = useState(0);
  const [loading, setLoading] = useState(true);

  const [videoDims, setVideoDims] = useState({ width: REQUESTED_WIDTH, height: REQUESTED_HEIGHT });
  const [exerciseType, setExerciseType] = useState('squat');
  const [repsDisplay, setRepsDisplay] = useState(0);
  const [saving, setSaving] = useState(false);

  // Enhanced feedback state
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [repProgress, setRepProgress] = useState(0);
  const [formStatus, setFormStatus] = useState('idle');  // idle | inProgress | success
  const [isMuted, setIsMuted] = useState(false);

  const firstResultRef = useRef(false);
  const lastFeedbackRef = useRef('');

  /* ── MediaPipe onResults callback ──────────────────────────── */
  const handleResults = useCallback((results) => {
    if (!firstResultRef.current) {
      firstResultRef.current = true;
      setLoading(false);
      sessionStartRef.current = new Date();
    }

    const hasLandmarks = results.poseLandmarks && results.poseLandmarks.length > 0;

    if (hasLandmarks) {
      landmarksRef.current = filterLandmarks(kalmanFiltersRef.current, results.poseLandmarks);
      hasNewDataRef.current = true;
    } else {
      landmarksRef.current = null;
    }

    setPoseDetected((prev) => {
      if (prev !== hasLandmarks) return hasLandmarks;
      return prev;
    });
  }, []);

  /* ── Initialise MediaPipe Pose ─────────────────────────────── */
  useEffect(() => {
    const { pose, sendFrame } = createPoseDetector(handleResults);
    poseRef.current = { pose, sendFrame };
    return () => {
      pose.close();
      stopSpeaking();
    };
  }, [handleResults]);

  /* ── Sync canvas to actual video resolution ────────────────── */
  const handleVideoReady = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video) return;
    const actualW = video.videoWidth;
    const actualH = video.videoHeight;
    if (actualW && actualH) {
      setVideoDims({ width: actualW, height: actualH });
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = actualW;
        canvas.height = actualH;
      }
    }
  }, []);

  /* ── Reset reps when exercise changes ──────────────────────── */
  function handleExerciseChange(exId) {
    setExerciseType(exId);
    repsRef.current = 0;
    successRepsRef.current = 0;
    workoutStateRef.current = 'up';
    setRepsDisplay(0);
    setFeedbackMsg('');
    setRepProgress(0);
    setFormStatus('idle');
    prevDrawLandmarksRef.current = null;
    stopSpeaking();
  }

  /* ── Detection loop (async, independent of rendering) ──────── */
  useEffect(() => {
    let running = true;
    let sending = false;

    async function detectionLoop() {
      while (running) {
        const video = webcamRef.current?.video;
        if (video && poseRef.current && !sending) {
          sending = true;
          try {
            await poseRef.current.sendFrame(video);
          } catch (_) {
            // Silently handle frame-send errors
          }
          sending = false;
        }
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    detectionLoop();
    return () => { running = false; };
  }, []);

  /* ── Render loop (full 60fps, never blocked by detection) ──── */
  useEffect(() => {
    let running = true;

    function renderLoop() {
      if (!running) return;

      const canvas = canvasRef.current;
      const video = webcamRef.current?.video;

      if (canvas && video) {
        if (!ctxRef.current) ctxRef.current = canvas.getContext('2d', { willReadFrequently: false });
        const ctx = ctxRef.current;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh && (canvas.width !== vw || canvas.height !== vh)) {
          canvas.width = vw;
          canvas.height = vh;
          ctxRef.current = canvas.getContext('2d', { willReadFrequently: false });
          setVideoDims({ width: vw, height: vh });
        }

        clearCanvas(ctx, canvas.width, canvas.height);

        if (landmarksRef.current) {
          let rawLandmarks;
          if (hasNewDataRef.current) {
            rawLandmarks = landmarksRef.current;
            hasNewDataRef.current = false;
            framesSinceDataRef.current = 0;
          } else {
            framesSinceDataRef.current += 1;
            const steps = Math.min(framesSinceDataRef.current, 3);
            rawLandmarks = predictLandmarks(kalmanFiltersRef.current, landmarksRef.current, steps);
          }

          // ── Lerp interpolation for butter-smooth rendering ──
          const drawLandmarks = prevDrawLandmarksRef.current
            ? lerpLandmarks(prevDrawLandmarksRef.current, rawLandmarks, LERP_SPEED)
            : rawLandmarks;
          prevDrawLandmarksRef.current = drawLandmarks;

          // ── Determine current form status for skeleton coloring ──
          let currentStatus = 'idle';

          const landmarks = drawLandmarks;
          let p1, p2, p3;
          if (exerciseType === 'squat') {
            p1 = landmarks[23]; p2 = landmarks[25]; p3 = landmarks[27];
          } else {
            p1 = landmarks[11]; p2 = landmarks[13]; p3 = landmarks[15];
          }

          if (p1 && p2 && p3 && p1.visibility > 0.5 && p2.visibility > 0.5 && p3.visibility > 0.5) {
            const px1 = { x: p1.x * canvas.width, y: p1.y * canvas.height };
            const px2 = { x: p2.x * canvas.width, y: p2.y * canvas.height };
            const px3 = { x: p3.x * canvas.width, y: p3.y * canvas.height };

            const angle = calculateAngle(px1, px2, px3);
            currentAngleRef.current = angle;

            let res;
            if (exerciseType === 'squat') {
              res = checkRepSquat(angle, workoutStateRef.current);
            } else {
              res = checkRepBicepCurl(angle, workoutStateRef.current);
            }

            workoutStateRef.current = res.newState;

            if (res.repCompleted) {
              repsRef.current += 1;
              setRepsDisplay(repsRef.current);
            }

            // Track successful reps (where target depth was hit)
            if (res.isCorrect && res.repCompleted) {
              successRepsRef.current += 1;
            }

            // Update form status for skeleton coloring
            if (res.isCorrect) {
              currentStatus = 'success';
            } else if (res.progress > 15) {
              currentStatus = 'inProgress';
            }

            // Update feedback (throttled to avoid re-renders every frame)
            if (res.feedback && res.feedback !== lastFeedbackRef.current) {
              lastFeedbackRef.current = res.feedback;
              setFeedbackMsg(res.feedback);
              setFormStatus(currentStatus);

              // Voice announcement (speaks only when message changes)
              speak(res.feedback.replace(/[✅🔥]/g, ''), isMuted);
            }

            // Update progress (throttled)
            if (Math.random() < 0.2) {
              setRepProgress(Math.round(res.progress));
            }

            // Draw angle near joint
            ctx.fillStyle = 'white';
            ctx.font = '28px Arial';
            ctx.fillText(Math.round(angle) + '°', px2.x + 20, px2.y);
          }

          // Draw skeleton with status color
          drawConnections(ctx, drawLandmarks, canvas.width, canvas.height, currentStatus);
          drawKeypoints(ctx, drawLandmarks, canvas.width, canvas.height, currentStatus);
        }

        // FPS
        const now = performance.now();
        frameTimesRef.current.push(now);
        frameTimesRef.current = frameTimesRef.current.filter((t) => now - t < 1000);
        fpsRef.current = frameTimesRef.current.length;
        if (Math.random() < 0.15) setFps(fpsRef.current);
      }

      rafIdRef.current = requestAnimationFrame(renderLoop);
    }

    rafIdRef.current = requestAnimationFrame(renderLoop);
    return () => {
      running = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [exerciseType, isMuted]);

  /* ── Save workout log to Firestore ─────────────────────────── */
  async function saveWorkoutLog() {
    if (repsRef.current === 0) {
      navigate(-1);
      return;
    }

    setSaving(true);
    stopSpeaking();
    try {
      const sessionEnd = new Date();
      const durationSec = sessionStartRef.current
        ? Math.round((sessionEnd - sessionStartRef.current) / 1000)
        : 0;

      // Calculate real Form Score instead of random
      const formScore = repsRef.current > 0
        ? Math.round((successRepsRef.current / repsRef.current) * 100)
        : 0;

      await addDoc(collection(db, 'logs'), {
        uid: currentUser.uid,
        exercise_name: EXERCISES.find(e => e.id === exerciseType)?.name || exerciseType,
        reps_count: repsRef.current,
        accuracy: Math.max(formScore, 10), // Minimum 10% to avoid discouragement
        duration_seconds: durationSec,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      });

      navigate(-1);
    } catch (err) {
      console.error('Failed to save log:', err);
      alert('Failed to save workout log. Your reps: ' + repsRef.current);
      navigate(-1);
    } finally {
      setSaving(false);
    }
  }

  /* ── Camera error handler ──────────────────────────────────── */
  const handleCameraError = useCallback((err) => {
    console.error('[CameraView] Camera error:', err);
    setCameraError(true);
  }, []);

  /* ── Render ────────────────────────────────────────────────── */
  if (cameraError) {
    return (
      <div className="camera-view">
        <div className="camera-error">
          <div className="error-icon">🎥</div>
          <h2>Camera Access Required</h2>
          <p>Please allow camera permission in your browser settings and reload the page.</p>
          <button className="btn-back" onClick={() => navigate(-1)}>← Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-view">
      {/* Header */}
      <header className="cv-header">
        <button className="btn-back" onClick={saveWorkoutLog} disabled={saving}>
          {saving ? 'Saving…' : '← Save & Exit'}
        </button>
        <h1 className="cv-title">🎥 AI Workout Tracker</h1>
        <div className="cv-stats">
          <div className="cv-reps-badge">
            <span className="reps-num">{repsDisplay}</span>
            <span className="reps-label">REPS</span>
          </div>
        </div>
      </header>

      {/* Exercise Selector + Mute Button */}
      <div className="exercise-selector">
        {EXERCISES.map(ex => (
          <button
            key={ex.id}
            className={`ex-btn ${exerciseType === ex.id ? 'active' : ''}`}
            onClick={() => handleExerciseChange(ex.id)}
          >
            {ex.icon} {ex.name}
          </button>
        ))}
        <button
          className={`ex-btn mute-btn ${isMuted ? 'muted' : ''}`}
          onClick={() => {
            setIsMuted(prev => !prev);
            if (!isMuted) stopSpeaking();
          }}
          title={isMuted ? 'Unmute voice' : 'Mute voice'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Video + Canvas container */}
      <div
        className="video-container"
        style={{
          width: '100%',
          maxWidth: videoDims.width,
          aspectRatio: `${videoDims.width} / ${videoDims.height}`,
        }}
      >
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Loading pose model…</p>
          </div>
        )}

        <Webcam
          ref={webcamRef}
          audio={false}
          mirrored={true}
          width={videoDims.width}
          height={videoDims.height}
          videoConstraints={{
            width: { ideal: REQUESTED_WIDTH },
            height: { ideal: REQUESTED_HEIGHT },
            facingMode: 'user',
          }}
          onUserMediaError={handleCameraError}
          onLoadedData={handleVideoReady}
          className="webcam-video"
        />

        <canvas ref={canvasRef} className="pose-canvas" />

        {/* ── Feedback Overlay ──────────────────────────────── */}
        {feedbackMsg && (
          <div className={`feedback-overlay ${formStatus}`} id="feedback-overlay">
            <span className="feedback-text">{feedbackMsg}</span>
          </div>
        )}

        {/* ── Progress Gauge ───────────────────────────────── */}
        <div className="progress-gauge" id="progress-gauge">
          <div className="progress-gauge-label">DEPTH</div>
          <div className="progress-gauge-track">
            <div
              className={`progress-gauge-fill ${formStatus}`}
              style={{ height: `${repProgress}%` }}
            />
          </div>
          <div className="progress-gauge-value">{repProgress}%</div>
        </div>

        <div className="fps-counter" id="fps-counter">{fps} FPS</div>

        <div className={`status-badge ${poseDetected ? 'detected' : 'not-detected'}`} id="status-badge">
          <span className="status-dot" />
          {poseDetected ? 'Pose Detected' : 'No Person Detected'}
        </div>
      </div>
    </div>
  );
}

export default CameraView;
