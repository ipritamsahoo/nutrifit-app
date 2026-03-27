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
import { useNavigate, useSearchParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import { createPoseDetector } from './utils/poseUtils';
import { clearCanvas, drawKeypoints, drawConnections } from './utils/drawUtils';
import { calculateAngle, checkGenericRep, isUserFullyVisible } from './utils/angleUtils';
import { ALL_EXERCISE_NAMES, getExerciseConfig } from './utils/exerciseConfigs';
import { createLandmarkFilters, filterLandmarks, predictLandmarks, lerpLandmarks } from './utils/cvKalmanFilter';
import { speak, stopSpeaking } from './utils/speechUtils';
import { useAuth } from '../../contexts/AuthContext';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import './CameraView.css';

/* ── Constants ──────────────────────────────────────────────────── */
const REQUESTED_WIDTH = 1280;
const REQUESTED_HEIGHT = 720;
const LERP_SPEED = 0.40;  // Balance: smooth but responsive to body movement

const EXERCISES = ALL_EXERCISE_NAMES.map(name => {
  const cfg = getExerciseConfig(name);
  let icon = '🏋️';
  if (cfg.category === 'lower_body') icon = '🦵';
  else if (cfg.category === 'upper_body') icon = '💪';
  else if (cfg.category === 'core') icon = '🔥';


  return { id: name, name: name, icon };
}).sort((a, b) => a.name.localeCompare(b.name));

function CameraView({ embedded = false, exerciseName: exerciseNameProp, onClose, onRepUpdate }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [exerciseType, setExerciseType] = useState(() => {
    // If embedded with specific exercise, use that
    if (exerciseNameProp && EXERCISES.some(e => e.id === exerciseNameProp)) return exerciseNameProp;
    const urlEx = searchParams.get('exercise');
    if (urlEx) {
      // Exact match (full key like "Biceps - Dumbbell Curl")
      const exact = EXERCISES.find(e => e.id === urlEx);
      if (exact) return exact.id;
      // Suffix match (short name like "Dumbbell Curl" → find "Biceps - Dumbbell Curl")
      const suffix = EXERCISES.find(e => e.id.endsWith(' - ' + urlEx));
      if (suffix) return suffix.id;
    }
    return EXERCISES.find(e => e.name.includes('Barbell Forward Lunge'))?.id || EXERCISES[0].id;
  });
  const [repsDisplay, setRepsDisplay] = useState(0);
  const [saving, setSaving] = useState(false);

  // Enhanced feedback state
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [repProgress, setRepProgress] = useState(0);
  const [formStatus, setFormStatus] = useState('idle');  // idle | inProgress | success
  const [isMuted, setIsMuted] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);

  const firstResultRef = useRef(false);
  const lastFeedbackRef = useRef('');
  const isCalibratedRef = useRef(false);

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

          // ── Verify Body Frame Calibration ──
          const userVisible = isUserFullyVisible(drawLandmarks);
          if (isCalibratedRef.current !== userVisible) {
            isCalibratedRef.current = userVisible;
            setIsCalibrated(userVisible);
          }

          if (!userVisible) {
            currentStatus = 'uncalibrated';
          }

          const landmarks = drawLandmarks;
          const config = getExerciseConfig(exerciseType) || getExerciseConfig('default');
          const exerciseAngles = config.angles || [];

          // ── MULTI-JOINT, DUAL-SIDE TRACKING ──
          // For each angle definition, compute left+right side, average them
          const computedAngles = []; // { value, name, pxL, pxR }

          for (const angleDef of exerciseAngles) {
            const [j1, j2, j3] = angleDef.joints;

            // Left side
            const pL1 = landmarks[j1], pL2 = landmarks[j2], pL3 = landmarks[j3];
            const leftVis = pL1 && pL2 && pL3 &&
              pL1.visibility > 0.5 && pL2.visibility > 0.5 && pL3.visibility > 0.5;

            // Right side (left + 1)
            const pR1 = landmarks[j1 + 1], pR2 = landmarks[j2 + 1], pR3 = landmarks[j3 + 1];
            const rightVis = pR1 && pR2 && pR3 &&
              pR1.visibility > 0.5 && pR2.visibility > 0.5 && pR3.visibility > 0.5;

            let leftAngle = null, rightAngle = null;
            let pxL = null, pxR = null;

            if (leftVis) {
              pxL = { x: pL2.x * canvas.width, y: pL2.y * canvas.height };
              leftAngle = calculateAngle(
                { x: pL1.x * canvas.width, y: pL1.y * canvas.height },
                pxL,
                { x: pL3.x * canvas.width, y: pL3.y * canvas.height }
              );
            }
            if (rightVis) {
              pxR = { x: pR2.x * canvas.width, y: pR2.y * canvas.height };
              rightAngle = calculateAngle(
                { x: pR1.x * canvas.width, y: pR1.y * canvas.height },
                pxR,
                { x: pR3.x * canvas.width, y: pR3.y * canvas.height }
              );
            }

            if (leftVis || rightVis) {
              const avgAngle = (leftAngle !== null && rightAngle !== null)
                ? (leftAngle + rightAngle) / 2
                : (leftAngle !== null ? leftAngle : rightAngle);

              computedAngles.push({
                value: avgAngle,
                name: angleDef.name,
                upAngle: angleDef.upAngle,
                downAngle: angleDef.downAngle,
                leftAngle, rightAngle, pxL, pxR
              });
            }
          }

          // Rep tracking uses PRIMARY angle (index 0)
          if (computedAngles.length > 0) {
            const primary = computedAngles[0];
            currentAngleRef.current = primary.value;

            // Build config for checkGenericRep (primary angle only)
            const repConfig = {
              upThreshold: primary.upAngle,
              downThreshold: primary.downAngle,
              startPosition: config.startPosition,
            };

            const res = checkGenericRep(primary.value, workoutStateRef.current, repConfig);
            workoutStateRef.current = res.newState;

            if (res.repCompleted) {
              repsRef.current += 1;
              setRepsDisplay(repsRef.current);
              if (onRepUpdate) onRepUpdate(repsRef.current);
            }

            if (res.isCorrect && res.repCompleted) {
              successRepsRef.current += 1;
            }

            // Form status overrides unless uncalibrated
            if (currentStatus !== 'uncalibrated') {
              if (res.isCorrect) {
                currentStatus = 'success';
              } else if (res.progress > 15) {
                currentStatus = 'inProgress';
              }
            }

            if (res.feedback && res.feedback !== lastFeedbackRef.current) {
              lastFeedbackRef.current = res.feedback;
              setFeedbackMsg(res.feedback);
              setFormStatus(currentStatus);
              speak(res.feedback.replace(/[✅🔥]/g, ''), isMuted);
            }

            if (Math.random() < 0.2) {
              setRepProgress(Math.round(res.progress));
            }

            // Draw ALL angle labels on BOTH sides
            ctx.font = '22px Arial';
            for (const a of computedAngles) {
              const label = a.name ? `${a.name}: ` : '';
              if (a.leftAngle !== null && a.pxL) {
                ctx.fillStyle = currentStatus === 'success' ? '#22c55e' : '#ffffff';
                ctx.fillText(label + Math.round(a.leftAngle) + '°', a.pxL.x + 15, a.pxL.y);
              }
              if (a.rightAngle !== null && a.pxR) {
                ctx.fillStyle = currentStatus === 'success' ? '#22c55e' : '#ffffff';
                const text = label + Math.round(a.rightAngle) + '°';
                ctx.fillText(text, a.pxR.x - ctx.measureText(text).width - 15, a.pxR.y);
              }
            }
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
  const exitView = useCallback(() => {
    if (embedded && onClose) onClose();
    else navigate(-1);
  }, [embedded, onClose, navigate]);

  async function saveWorkoutLog() {
    if (repsRef.current === 0) {
      exitView();
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
        exercise_name: exerciseType,
        reps_count: repsRef.current,
        accuracy: Math.max(formScore, 10), // Minimum 10% to avoid discouragement
        duration_seconds: durationSec,
        date: new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      });

      exitView();
    } catch (err) {
      console.error('Failed to save log:', err);
      alert('Failed to save workout log. Your reps: ' + repsRef.current);
      exitView();
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
      <div className={`camera-view ${embedded ? 'camera-view--embedded' : ''}`}>
        <div className="camera-error">
          <div className="error-icon">🎥</div>
          <h2>Camera Access Required</h2>
          <p>Please allow camera permission in your browser settings and reload the page.</p>
          <button className="btn-back" onClick={exitView}>← Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`camera-view ${embedded ? 'camera-view--embedded' : ''}`}>
      {/* Header — only shown in standalone mode */}
      {!embedded && (
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
      )}

      {/* Exercise Badge + Mute — only shown in standalone mode */}
      {!embedded && (
        <div className="exercise-selector" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div
            className="active-exercise-badge"
            style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {EXERCISES.find(e => e.id === exerciseType)?.icon || '🏋️'} {EXERCISES.find(e => e.id === exerciseType)?.name || exerciseType}
          </div>
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
      )}

      {/* Embedded: Mute toggle floats on the video */}
      {embedded && (
        <button
          className={`cv-embedded-mute ${isMuted ? 'muted' : ''}`}
          onClick={() => {
            setIsMuted(prev => !prev);
            if (!isMuted) stopSpeaking();
          }}
          title={isMuted ? 'Unmute voice' : 'Mute voice'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      )}

      {/* Video + Canvas container */}
      <div
        className="video-container"
        style={embedded ? { width: '100%', height: '100%' } : {
          width: '100%',
          maxWidth: videoDims.width,
          aspectRatio: `${videoDims.width} / ${videoDims.height}`,
        }}
      >
        {loading && (
          <div className={`loading-overlay ${embedded ? 'loading-overlay--embedded' : ''}`}>
            <div className={`spinner ${embedded ? 'spinner--embedded' : ''}`} />
            <p>{embedded ? 'Initializing AI Posture Tracker…' : 'Loading pose model…'}</p>
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

        {/* ── Calibration Overlay ───────────────────────────── */}
        <div className="calibration-overlay">
          <svg className={`calibration-outline-svg ${isCalibrated ? 'calibrated' : ''}`} viewBox="375 50 280 820" preserveAspectRatio="xMidYMid meet">
             {/* Detailed VTracer Human Body Silhouette */}
             <path 
               d="M538.59 65.11C546.204 71.07 551.268 79.431 553 89 553.232 92.983 553.19 96.949 553.125 100.937 553.116 102.003 553.107 103.068 553.098 104.166 553.074 106.777 553.042 109.388 553 112 553.99 112.33 554.98 112.66 556 113 558.37 116.791 558.21 120.251 557.61 124.523 556.298 129.854 553.96 135.151 549.938 138.945 547.605 141.419 547.086 143.276 546.313 146.562 546.082 147.512 545.851 148.462 545.613 149.441 545.411 150.285 545.209 151.13 545 152 544.67 152.99 544.34 153.98 544 155 543.103 167.652 543.103 167.652 548 179 551.362 182.003 554.538 183.869 558.711 185.543 559.791 185.976 560.872 186.41 561.985 186.857 563.103 187.296 564.222 187.735 565.375 188.187 566.486 188.638 567.597 189.088 568.742 189.552 574.178 191.711 579.148 193.57 585 194 585 194.66 585 195.32 585 196 585.571 196.147 586.142 196.294 586.731 196.445 602.831 200.899 619.024 208.644 628.75 222.687 634.527 232.964 635.473 243.118 635.063 254.687 634.853 264.409 635.086 273.848 636.438 283.5 638.227 296.364 638.451 309.169 638.533 322.136 638.636 332.157 639.707 341.208 642 351 642.386 352.877 642.765 354.756 643.133 356.636 643.299 357.474 643.465 358.311 643.636 359.174 647.859 380.867 647.452 401.484 644.862 423.35 640.741 457.611 640.741 457.611 644.317 491.738 646.501 502.16 644.69 511.524 639.422 520.769 632.608 531.006 624.621 536.126 613 540 607.781 540.394 604.418 539.877 600 537 597.37 533.652 597.567 530.117 598 526 599.875 523.062 599.875 523.062 602 521 602.66 521 603.32 521 604 521 603.723 520.264 603.446 519.528 603.16 518.769 602.798 517.793 602.436 516.818 602.063 515.812 601.703 514.849 601.343 513.886 600.973 512.894 600.089 510.263 599.474 507.731 599 505 598.67 505 598.34 505 598 505 598 502.69 598 500.38 598 498 598.33 498 598.66 498 599 498 599.364 496.403 599.364 496.403 599.735 494.773 600.072 493.307 600.411 491.841 600.75 490.375 600.928 489.604 601.105 488.833 601.288 488.038 602.426 483.185 603.758 478.446 605.25 473.687 610.217 456.518 604.79 438.136 600.5 421.312 597.086 407.835 593.879 394.784 593.563 380.812 593.154 368.447 591.635 356.254 590 344 589.01 343.67 588.02 343.34 587 343 586.686 344.541 586.374 346.083 586.063 347.625 585.889 348.483 585.715 349.342 585.535 350.226 581.841 369.374 582.72 390.019 587 409 588.014 413.726 589.008 418.456 590 423.187 590.263 424.432 590.526 425.676 590.796 426.958 592.411 434.736 593.793 442.497 594.813 450.375 594.98 451.663 594.98 451.663 595.151 452.977 595.472 455.649 595.747 458.321 596 461 596.096 462.013 596.192 463.026 596.29 464.07 597.22 475.656 597.152 487.249 597.131 498.866 597.125 502.416 597.131 505.966 597.137 509.515 597.136 511.768 597.135 514.021 597.133 516.273 597.135 517.337 597.137 518.4 597.139 519.495 597.134 520.954 597.134 520.954 597.13 522.443 597.129 523.301 597.128 524.16 597.127 525.044 597 527 597 527 596 529 595.637 531.347 595.33 533.681 595.055 536.039 594.867 537.566 594.679 539.093 594.49 540.621 594.39 541.435 594.29 542.25 594.188 543.089 592.135 559.749 589.513 576.243 586.412 592.738 581.475 619.063 581.994 641.109 586.613 667.504 587.196 672.772 587.225 678.015 587.25 683.312 587.271 684.37 587.291 685.428 587.313 686.517 587.407 706.269 581.703 725.757 577.34 744.88 565.976 786.921 565.976 786.921 571.625 828.187 574.614 832.798 578.224 836.742 582.047 840.675 584.851 844.012 586.029 846.637 585.938 851 584.689 854.995 583.353 856.468 580 859 571.135 862.615 562.025 863.18 552.563 863.187 551.66 863.199 550.757 863.212 549.826 863.224 542.594 863.217 535.878 862.631 529.625 858.625 528.978 858.225 528.331 857.825 527.664 857.414 524.659 854.86 524.062 852.735 523.735 848.828 523.782 837.993 523.782 837.993 525 833.625 526.614 827.773 526.285 822.988 524.938 817.187 523.076 808.477 524.946 800.377 527.281 791.922 530.569 778.558 529.151 765.127 527.068 751.714 526.253 746.398 525.849 741.379 526 736 525.34 735.67 524.68 735.34 524 735 523.656 733.05 523.656 733.05 523.5 730.312 523.238 726.208 522.92 722.134 522.461 718.047 520.53 700.394 520.799 683.767 524.54 666.365 526.878 655.474 527.079 645.957 525.34 634.937 525.062 633.068 525.062 633.068 524.779 631.161 524.381 628.49 523.98 625.819 523.571 623.15 522.494 616.114 521.466 609.07 520.438 602.027 520.281 600.96 520.281 600.96 520.122 599.872 517.966 585.132 516.135 570.362 514.438 555.562 514.31 554.453 514.183 553.344 514.051 552.201 513.356 546.135 512.673 540.068 512 534 511.913 534.754 511.826 535.508 511.737 536.285 510.714 545.157 509.684 554.027 508.649 562.897 508.467 564.461 508.285 566.025 508.103 567.588 505.568 589.345 502.923 611.075 499.728 632.747 497.841 645.724 497.547 657.311 499.938 670.25 503.064 687.792 503.489 703.627 501.034 721.257 500.679 723.811 500.338 726.366 500.002 728.922 499.55 732.352 499.095 735.781 498.637 739.21 495.907 759.705 493.533 778.143 498.363 798.5 499.7 805.847 499.867 813.754 498 821 497.591 827.573 497.956 833.605 499.539 839.984 500.817 845.571 500.239 850.156 497.531 855.136 493.275 860.315 486.423 862.241 480 863 449.837 864.743 449.837 864.743 440 856 437.516 852.274 437.757 850.614 438.35 846.327 439.454 842.375 441.918 839.985 444.75 837.125 455.094 825.925 457.598 815.353 457.134 800.337 456.929 796.759 456.372 793.279 455.746 789.754 455.549 788.605 455.549 788.605 455.347 787.433 453.528 777.049 451.375 766.728 449.253 756.403 448.714 753.772 448.179 751.14 447.645 748.508 447.479 747.71 447.314 746.912 447.143 746.09 446.442 742.63 446 739.546 446 736 445.34 735.67 444.68 735.34 444 735 443.741 733.142 443.494 731.282 443.304 729.416 442.863 725.912 442.034 722.523 441.235 719.085 436.045 696.705 435.281 677.03 439.578 654.386 443.54 633.493 442.089 614.757 438 594 437.724 592.593 437.448 591.187 437.172 589.781 436.57 586.719 435.968 583.658 435.366 580.596 435.213 579.818 435.06 579.04 434.903 578.238 434.593 576.665 434.283 575.092 433.972 573.52 431.517 561.07 429.326 548.628 428 536 427.907 535.191 427.813 534.383 427.717 533.55 426.728 523.798 426.814 514.013 426.815 504.222 426.813 501.166 426.795 498.11 426.776 495.054 426.726 477.95 427.563 460.84 430.75 444 430.915 443.084 431.08 442.169 431.25 441.226 432.516 434.303 433.92 427.407 435.323 420.51 440.589 394.615 446.169 363.599 436 338 433.704 349.415 431.789 360.589 431.563 372.25 431.076 391.645 426.398 410.513 421.412 429.186 416.736 446.95 415.133 463.253 420.88 480.841 424.813 492.926 425.368 502.166 422.692 514.593 421.901 517.91 421.901 517.91 422 521 423.01 521.33 423.98 521.66 425 522 427.761 525.993 428.001 527.951 427.938 531.437 425.571 536.631 422.772 539.228 419 543 417.01 542.67 416.02 542.34 415 542 414.142 541.809 413.283 541.618 412.399 541.422 401.483 538.996 393.017 534.951 386 526 377.735 512.549 377.996 500.081 381.024 484.746 382.068 479.109 382.383 474.663 382.375 468.937 382.376 467.369 382.376 467.369 382.377 465.769 382.212 453.327 380.575 440.051 378.973 427.73 375.796 403.204 374.704 377.24 381.278 353.168 384.564 341.105 385.507 329.651 385.686 317.205 385.82 308.589 386.426 300.173 387.563 291.625 389.121 279.744 389.199 268.074 388.801 256.121 388.404 240.658 391.469 226.783 401.891 214.832 406.123 210.656 410.891 207.807 416.184 205.172 416.879 204.825 417.574 204.479 418.29 204.122 426.325 200.22 434.685 197.326 443.125 194.437 464.225 188.083 464.225 188.083 480.223 174.175 484.062 163.43 480.64 149.914 476 140 474.716 138.295 473.386 136.623 472 135 467.977 129.114 466.782 123.066 468 116 468.504 115.418 469.008 114.837 469.528 114.238 471.869 110.679 471.182 107.084 471 102.937 470.839 95.476 471.21 89.023 474 82 474.279 81.288 474.557 80.577 474.844 79.843 479.403 69.624 487.285 63.319 497.406 58.965 511.426 54.071 526.536 56.84 538.59 65.113Z" 
               fill="none" 
               stroke="rgba(255,255,255,0.8)" 
               strokeWidth="5" 
               strokeLinecap="round" 
               strokeLinejoin="round" 
             />
             {/* Inner detail path (body contour lines) */}
             <path 
               d="M488 76C480.758 85.588 480.771 94.113 481.254 105.726 481.423 113.347 481.423 113.347 479.031 117.039 478.361 117.686 477.691 118.333 477 119 476.237 122.358 476.555 124.212 478.246 127.207 479.267 128.742 480.316 130.259 481.395 131.754 484.681 136.351 486.616 140.466 488.125 145.937 488.624 147.714 488.624 147.714 489.133 149.527 491.924 160.705 491.988 171.65 486.75 182.125 478.758 194.265 460.002 198.247 447.081 202.888 442.246 204.633 437.434 206.434 432.625 208.25 431.801 208.555 430.976 208.859 430.127 209.174 416.559 214.285 406.202 220.096 399.875 233.738 398.136 238.234 397.911 241.958 398.008 246.801 398.028 248.172 398.047 249.544 398.065 250.916 398.075 251.633 398.086 252.35 398.096 253.089 398.248 264.829 397.935 276.151 396.144 287.781 394.242 300.353 393.947 313.102 394.024 325.804 394.046 335.994 391.921 345.598 389.5 355.437 382.562 384.962 385.225 411.3 388.766 440.083 390.563 454.781 392.005 468.677 389.5 483.375 387.277 496.636 385.763 508.37 394 520 398.261 524.828 402.864 528.068 409 530 412.293 530.252 412.293 530.252 415 530 414.278 529.298 413.556 528.597 412.813 527.875 406.539 521.547 401.9 515.912 401.688 506.687 401.708 502.292 401.708 502.292 404 500 404.242 500.58 404.485 501.16 404.735 501.758 406.784 506.535 408.968 510.777 412 515 414.578 511.123 414.384 507.988 414.375 502.5 414.375 501.698 414.375 500.897 414.375 500.071 414.243 493.146 412.626 487.399 410 481 402.23 456.746 409.711 432.118 415.944 408.368 418.921 396.897 420.239 385.76 420.813 374.937 421.738 358.767 424.542 342.13 428.028 326.324 430.473 314.974 429.817 304.599 428.184 293.207 427.97 291.712 427.97 291.712 427.753 290.188 427.463 288.214 427.16 286.242 426.841 284.273 426.704 283.372 426.567 282.471 426.426 281.543 426.296 280.739 426.166 279.934 426.033 279.106 426 277 426 277 428 274 429.65 274.33 431.3 274.66 433 275 435.065 283.585 436.819 292.173 438.313 300.875 439.658 308.603 441.039 316.318 442.586 324.008 446.181 341.896 449.079 359.34 449.25 377.625 449.26 378.399 449.269 379.173 449.279 379.971 449.198 394.591 446.622 408.89 443.601 423.139 438.906 445.375 435.521 467.244 435 490 434.978 490.826 434.956 491.652 434.934 492.503 434.121 527.067 439.404 561.045 446.589 594.738 449.276 607.464 451.761 620.571 450.875 633.625 450.829 634.435 450.782 635.245 450.735 636.079 450.129 644.753 448.563 653.261 446.938 661.793 444.331 675.725 444.285 689.063 446.68 703.011 446.856 704.053 447.033 705.094 447.215 706.167 449.049 716.714 451.344 727.146 453.719 737.583 470.317 810.702 470.317 810.702 459 833 457.002 834.334 456.002 835.668 455 837 455 837.66 455 838.32 455 839 454.34 839 453.68 839 453 839 451.223 840.679 451.223 840.679 449.438 842.812 448.818 843.52 448.198 844.228 447.559 844.957 445.816 847.012 445.816 847.012 445 850 457.039 854.601 472.539 855.571 485 852 487.376 850.841 487.376 850.841 489 849 490.131 843.606 488.924 838.21 487.453 833 485.003 826.6 487.23 821.197 489 815 489.537 808.647 488.473 802.957 487 796.814 482.358 775.311 485.645 753.603 489.09 732.14 493.102 706.837 492.937 684.138 487.459 659.05 486.273 651.168 487.476 643.729 488.652 635.918 489.017 633.409 489.381 630.901 489.744 628.392 489.94 627.045 490.137 625.698 490.333 624.352 494.91 592.882 498.518 561.34 501.8 529.711 502.163 526.215 502.529 522.721 502.895 519.226 503.145 516.822 503.388 514.418 503.631 512.014 505.653 492.346 505.653 492.346 509 489 511.5 489.125 511.5 489.125 514 490 516.392 493.475 516.602 497.418 517.043 501.504 517.132 502.269 517.221 503.033 517.313 503.821 517.507 505.505 517.699 507.189 517.887 508.873 518.195 511.628 518.513 514.381 518.833 517.134 519.306 521.212 519.775 525.289 520.241 529.367 521.6 541.247 522.981 553.124 524.375 565 524.593 566.862 524.593 566.862 524.815 568.761 527.179 588.915 529.856 608.011 532.867 628.078 534.861 642.546 536.136 654.954 533.063 668.375 527.506 693.861 530.501 717.563 534.51 743.071 536.146 753.732 537.317 764.173 537.344 774.972 537.349 776.419 537.349 776.419 537.355 777.895 537.255 785.613 535.794 792.7 533.899 800.148 532.248 807.224 532.571 813.295 534.188 820.312 535.405 826.179 534.162 830.941 532.75 836.683 531.768 841.026 531.565 844.571 532 849 534.703 852.598 537.835 852.925 541.078 853.648 552.111 854.976 562.259 853.316 573 851 573.425 847.063 573.425 847.063 571.278 844.914 570.119 843.781 570.119 843.781 568.938 842.625 558.479 831.44 554.446 818.257 554.759 803.113 554.955 798.79 555.563 794.573 556.258 790.304 556.456 789.071 556.456 789.071 556.659 787.814 558.221 778.338 560.188 768.953 562.188 759.562 562.58 757.697 562.973 755.831 563.365 753.965 565.301 744.79 567.292 735.629 569.367 726.484 569.554 725.658 569.741 724.832 569.933 723.981 570.814 720.091 571.704 716.204 572.612 712.32 572.931 710.928 573.249 709.536 573.567 708.144 573.983 706.355 573.983 706.355 574.409 704.53 574.877 701.738 575.059 699.413 575.027 696.616 575.018 695.422 575.009 694.229 575 693 575.33 692.67 575.66 692.34 576 692 577.016 680.931 575.521 670.503 573.5 659.625 568.871 633.644 571.433 610.065 576.188 584.427 581.22 557.201 585.224 529.709 586 502 586.041 500.707 586.083 499.414 586.125 498.082 586.471 476.173 584.297 454.459 580 433 579.089 428.428 578.179 423.855 577.276 419.281 577.01 417.934 576.743 416.586 576.476 415.239 574.576 405.633 573.118 396.117 572.324 386.359 572.127 383.009 572.127 383.009 571 380 571.166 375.214 571.71 370.451 572.188 365.687 572.291 364.637 572.291 364.637 572.396 363.566 573.523 352.203 575.184 341.033 577.437 329.837 578.512 324.422 579.498 318.991 580.5 313.562 580.711 312.436 580.922 311.31 581.14 310.149 582.188 304.534 583.191 298.916 584.102 293.277 584.275 292.219 584.448 291.16 584.627 290.07 584.951 288.071 585.266 286.071 585.569 284.068 585.714 283.179 585.859 282.291 586.008 281.375 586.128 280.599 586.248 279.823 586.372 279.023 586.619 276.613 587.506 275.528 589.5 274 591.688 274.312 591.688 274.312 593.5 275 594.473 278.82 594.43 281.669 593.723 285.535 593.447 287.121 593.447 287.121 593.166 288.74 592.769 290.928 592.37 293.115 591.971 295.302 589.575 309.116 590.932 320.73 593.875 334.25 597.014 348.85 599.571 363.204 599.875 378.187 600.511 395.304 604.754 411.624 609.038 428.144 614.586 449.63 615.56 467.962 608.145 489.092 605.283 497.563 605.882 507.301 607.5 516 610.795 513.042 612.511 510.307 614.25 506.25 614.678 505.265 615.106 504.28 615.547 503.265 615.862 502.518 616.176 501.77 616.5 501 617.49 501.66 618.48 502.33 619.5 503 619.169 511.068 618.138 517.405 612.235 523.238 610.623 524.664 608.989 526.065 607.328 527.433 606.725 527.95 606.122 528.467 605.5 529 605.5 529.33 605.5 529.66 605.5 530 614.619 529.71 620.471 526.376 626.813 519.875 632.671 512.413 634.125 503.905 633.063 494.683 632.641 491.922 632.204 489.166 631.75 486.41 631.617 485.598 631.485 484.787 631.348 483.951 631.085 482.378 630.809 480.806 630.517 479.238 628.002 464.831 630.271 450.44 631.938 436.062 632.399 432.033 632.855 428.003 633.309 423.972 633.417 423.01 633.525 422.049 633.637 421.058 636.099 398.844 636.778 376.521 630.551 354.809 626.924 342.077 626.858 329.442 626.777 316.294 626.696 305.039 625.819 294.148 624.213 283.007 623.583 278.411 623.408 273.966 623.473 269.316 623.485 267.879 623.498 266.442 623.51 265.006 623.535 262.783 623.563 260.561 623.596 258.338 623.797 244.056 622.766 231.806 612.5 221 611.84 221 611.18 221 610.5 221 610.5 220.34 610.5 219.68 610.5 219 600.847 211.339 587.688 207.472 576.223 203.39 540.043 190.601 540.043 190.601 534.477 179.504 530.651 169.695 530.438 160.072 533.5 150 533.902 148.463 533.902 148.463 534.313 146.894 536.048 140.611 537.858 135.656 542.133 130.683 544.596 127.651 545.457 125.405 545.875 121.5 545.751 120.345 545.628 119.19 545.5 118 544.834 117.476 544.167 116.953 543.481 116.414 540.343 112.589 541.194 108.649 541.438 103.875 541.914 93.956 541.011 84.958 534.5 77 528.757 70.888 522.278 67.509 513.91 66.617 503.112 66.288 493.182 67.952 485.5 76Z" 
               fill="none" 
               stroke="rgba(255,255,255,0.35)" 
               strokeWidth="3" 
               strokeLinecap="round" 
               strokeLinejoin="round" 
             />
          </svg>
          {!isCalibrated && !loading && poseDetected && (
            <div className="calibration-msg-box">
              Move back until your body fits the outline
            </div>
          )}
        </div>

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


      </div>
    </div>
  );
}

export default CameraView;
