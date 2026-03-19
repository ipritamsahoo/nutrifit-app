/**
 * CameraView.jsx
 * ===============
 * Main component that:
 *   1. Opens the webcam via react-webcam
 *   2. Sends frames to MediaPipe Pose for landmark detection
 *   3. Draws a real-time skeleton overlay on a <canvas>
 *   4. Tracks bicep curl reps (left & right arms independently)
 *   5. Shows angle values at the elbows
 *   6. Shows a status badge, FPS counter, and curl counter panel
 *
 * Performance notes:
 *   - Landmarks are stored in a useRef (no re-renders per frame).
 *   - Drawing is done directly on the canvas via requestAnimationFrame.
 *   - React state is only updated when the detection status *changes*.
 *   - Resolution is fully dynamic – adapts to the actual camera stream.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { createPoseDetector } from '../utils/poseUtils';
import { clearCanvas, drawKeypoints, drawConnections, drawAngles } from '../utils/drawUtils';
import { getLeftArmAngle, getRightArmAngle, processCurlFrame } from '../utils/angleUtils';
import './CameraView.css';

/* ── Constants ──────────────────────────────────────────────────── */
const REQUESTED_WIDTH  = 1280;
const REQUESTED_HEIGHT = 720;

function CameraView() {
  /* ── Refs (no re-renders) ───────────────────────────────────── */
  const webcamRef      = useRef(null);
  const canvasRef      = useRef(null);
  const landmarksRef   = useRef(null);   // latest landmarks snapshot
  const poseRef        = useRef(null);   // { pose, sendFrame }
  const rafIdRef       = useRef(null);   // requestAnimationFrame ID
  const fpsRef         = useRef(0);
  const frameTimesRef  = useRef([]);

  // Curl state kept in refs for per-frame updates without re-renders
  const leftCurlRef    = useRef({ reps: 0, stage: null });
  const rightCurlRef   = useRef({ reps: 0, stage: null });
  const anglesRef      = useRef({ leftAngle: null, rightAngle: null });

  /* ── State (UI only – updated infrequently) ─────────────────── */
  const [poseDetected, setPoseDetected] = useState(false);
  const [cameraError, setCameraError]   = useState(false);
  const [fps, setFps]                   = useState(0);
  const [loading, setLoading]           = useState(true);
  const [videoDims, setVideoDims]       = useState({ width: REQUESTED_WIDTH, height: REQUESTED_HEIGHT });

  // Curl counter display state (updated ~4× per second)
  const [curlDisplay, setCurlDisplay] = useState({
    leftReps: 0, rightReps: 0,
    leftStage: null, rightStage: null,
    leftAngle: null, rightAngle: null,
  });

  const firstResultRef = useRef(false);

  /* ── MediaPipe onResults callback ──────────────────────────── */
  const handleResults = useCallback((results) => {
    if (!firstResultRef.current) {
      firstResultRef.current = true;
      setLoading(false);
      console.log('[PoseDetection] MediaPipe model loaded & first result received');
    }

    const hasLandmarks =
      results.poseLandmarks && results.poseLandmarks.length > 0;

    landmarksRef.current = hasLandmarks ? results.poseLandmarks : null;

    if (hasLandmarks) {
      // Calculate angles
      const leftAngle  = getLeftArmAngle(results.poseLandmarks);
      const rightAngle = getRightArmAngle(results.poseLandmarks);
      anglesRef.current = { leftAngle, rightAngle };

      // Process curl state
      leftCurlRef.current  = processCurlFrame(leftAngle,  leftCurlRef.current);
      rightCurlRef.current = processCurlFrame(rightAngle, rightCurlRef.current);
    } else {
      anglesRef.current = { leftAngle: null, rightAngle: null };
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
    console.log('[PoseDetection] Pose detector created, waiting for first frame…');

    return () => {
      pose.close();
    };
  }, [handleResults]);

  /* ── Sync canvas to actual video resolution ────────────────── */
  const handleVideoReady = useCallback(() => {
    const video = webcamRef.current?.video;
    if (!video) return;

    const actualW = video.videoWidth;
    const actualH = video.videoHeight;

    if (actualW && actualH) {
      console.log(`[CameraView] Actual camera resolution: ${actualW}×${actualH}`);
      setVideoDims({ width: actualW, height: actualH });

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width  = actualW;
        canvas.height = actualH;
      }
    }
  }, []);

  /* ── Detection + draw loop ─────────────────────────────────── */
  useEffect(() => {
    let running = true;

    async function loop() {
      if (!running) return;

      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;

      if (video && canvas && poseRef.current) {
        const ctx = canvas.getContext('2d');

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh && (canvas.width !== vw || canvas.height !== vh)) {
          canvas.width  = vw;
          canvas.height = vh;
          setVideoDims({ width: vw, height: vh });
        }

        try {
          await poseRef.current.sendFrame(video);
        } catch (err) {
          console.warn('[PoseDetection] Frame send error:', err);
        }

        // Draw on canvas
        clearCanvas(ctx, canvas.width, canvas.height);

        if (landmarksRef.current) {
          drawConnections(ctx, landmarksRef.current, canvas.width, canvas.height);
          drawKeypoints(ctx, landmarksRef.current, canvas.width, canvas.height);
          drawAngles(ctx, landmarksRef.current, anglesRef.current, canvas.width, canvas.height);
        }

        // FPS calculation
        const now = performance.now();
        frameTimesRef.current.push(now);
        frameTimesRef.current = frameTimesRef.current.filter((t) => now - t < 1000);
        const currentFps = frameTimesRef.current.length;
        fpsRef.current = currentFps;

        // Update React displays ~4× per second
        if (Math.random() < 0.15) {
          setFps(currentFps);
          setCurlDisplay({
            leftReps:   leftCurlRef.current.reps,
            rightReps:  rightCurlRef.current.reps,
            leftStage:  leftCurlRef.current.stage,
            rightStage: rightCurlRef.current.stage,
            leftAngle:  anglesRef.current.leftAngle,
            rightAngle: anglesRef.current.rightAngle,
          });
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    }

    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  /* ── Reset counter ─────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    leftCurlRef.current  = { reps: 0, stage: null };
    rightCurlRef.current = { reps: 0, stage: null };
    setCurlDisplay({
      leftReps: 0, rightReps: 0,
      leftStage: null, rightStage: null,
      leftAngle: null, rightAngle: null,
    });
  }, []);

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
          <p>
            Please allow camera permission in your browser settings and reload
            the page to use pose detection.
          </p>
        </div>
      </div>
    );
  }

  const totalReps = curlDisplay.leftReps + curlDisplay.rightReps;

  return (
    <div className="camera-view">
      {/* Header */}
      <header className="header">
        <h1 className="header-title">NutriFit Pose Tracker</h1>
        <p className="header-subtitle">Real-time skeleton tracking &amp; curl counter</p>
      </header>

      <div className="main-content">
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

          {/* FPS counter */}
          <div className="fps-counter" id="fps-counter">
            {fps} FPS
          </div>

          {/* Pose status badge */}
          <div
            className={`status-badge ${poseDetected ? 'detected' : 'not-detected'}`}
            id="status-badge"
          >
            <span className="status-dot" />
            {poseDetected ? 'Pose Detected' : 'No Person Detected'}
          </div>
        </div>

        {/* ── Curl Counter Panel ────────────────────────────────── */}
        <div className="curl-panel">
          <h2 className="curl-panel-title">Bicep Curls</h2>

          {/* Total reps */}
          <div className="total-reps">
            <span className="total-reps-number">{totalReps}</span>
            <span className="total-reps-label">Total Reps</span>
          </div>

          {/* Left arm */}
          <div className="arm-card">
            <div className="arm-card-header">
              <span className="arm-label">Left Arm</span>
              <span className={`arm-stage ${curlDisplay.leftStage || ''}`}>
                {curlDisplay.leftStage || '—'}
              </span>
            </div>
            <div className="arm-card-body">
              <div className="arm-stat">
                <span className="arm-stat-value">{curlDisplay.leftReps}</span>
                <span className="arm-stat-label">Reps</span>
              </div>
              <div className="arm-stat">
                <span className="arm-stat-value">
                  {curlDisplay.leftAngle !== null ? `${Math.round(curlDisplay.leftAngle)}°` : '—'}
                </span>
                <span className="arm-stat-label">Angle</span>
              </div>
            </div>
          </div>

          {/* Right arm */}
          <div className="arm-card">
            <div className="arm-card-header">
              <span className="arm-label">Right Arm</span>
              <span className={`arm-stage ${curlDisplay.rightStage || ''}`}>
                {curlDisplay.rightStage || '—'}
              </span>
            </div>
            <div className="arm-card-body">
              <div className="arm-stat">
                <span className="arm-stat-value">{curlDisplay.rightReps}</span>
                <span className="arm-stat-label">Reps</span>
              </div>
              <div className="arm-stat">
                <span className="arm-stat-value">
                  {curlDisplay.rightAngle !== null ? `${Math.round(curlDisplay.rightAngle)}°` : '—'}
                </span>
                <span className="arm-stat-label">Angle</span>
              </div>
            </div>
          </div>

          {/* Reset button */}
          <button className="reset-btn" onClick={handleReset} id="reset-btn">
            Reset Counter
          </button>
        </div>
      </div>
    </div>
  );
}

export default CameraView;
