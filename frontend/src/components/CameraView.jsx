/**
 * CameraView.jsx
 * ===============
 * Main component that:
 *   1. Opens the webcam via react-webcam
 *   2. Sends frames to MediaPipe Pose for landmark detection
 *   3. Draws a real-time skeleton overlay on a <canvas>
 *   4. Shows a status badge ("Pose Detected" / "No Person Detected")
 *   5. Shows an FPS counter
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
import { clearCanvas, drawKeypoints, drawConnections } from '../utils/drawUtils';
import { calculateAngle, checkRepSquat, checkRepBicepCurl } from '../utils/angleUtils';
import './CameraView.css';

/* ── Constants ──────────────────────────────────────────────────── */
// These are the *requested* constraints; actual resolution may differ
// depending on the device camera. The code adapts dynamically.
const REQUESTED_WIDTH  = 1280;
const REQUESTED_HEIGHT = 720;

function CameraView() {
  /* ── Refs (no re-renders) ───────────────────────────────────── */
  const webcamRef    = useRef(null);
  const canvasRef    = useRef(null);
  const landmarksRef = useRef(null);   // latest landmarks snapshot
  const poseRef      = useRef(null);   // { pose, sendFrame }
  const rafIdRef     = useRef(null);   // requestAnimationFrame ID
  const fpsRef       = useRef(0);      // current FPS value
  const frameTimesRef = useRef([]);    // timestamps for FPS calculation
  const workoutStateRef = useRef('up');
  const repsRef         = useRef(0);
  const currentAngleRef = useRef(0);
  const exerciseTypeRef = useRef('squat'); // Change to 'bicepCurl' to track arm curls

  /* ── State (UI badges only – updated infrequently) ──────────── */
  const [poseDetected, setPoseDetected] = useState(false);
  const [cameraError, setCameraError]   = useState(false);
  const [fps, setFps]                   = useState(0);
  const [loading, setLoading]           = useState(true);
  const [videoDims, setVideoDims]       = useState({ width: REQUESTED_WIDTH, height: REQUESTED_HEIGHT });

  // Track whether we've received the first result (to dismiss loading)
  const firstResultRef = useRef(false);

  /* ── MediaPipe onResults callback ──────────────────────────── */
  const handleResults = useCallback((results) => {
    // Dismiss loading spinner on first result (model is now warm)
    if (!firstResultRef.current) {
      firstResultRef.current = true;
      setLoading(false);
      console.log('[PoseDetection] MediaPipe model loaded & first result received');
    }

    const hasLandmarks =
      results.poseLandmarks && results.poseLandmarks.length > 0;

    // Store in ref for the draw loop (no re-render)
    landmarksRef.current = hasLandmarks ? results.poseLandmarks : null;

    // Only update React state when status actually changes
    setPoseDetected((prev) => {
      if (prev !== hasLandmarks) return hasLandmarks;
      return prev;
    });

    // Log landmarks for debugging (throttled to avoid console flood)
    if (hasLandmarks && Math.random() < 0.02) {
      console.log('[PoseDetection] Landmarks:', results.poseLandmarks);
    }
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

      // Update container size to match actual aspect ratio
      setVideoDims({ width: actualW, height: actualH });

      // Match canvas internal resolution to exact video resolution
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

        // Dynamically sync canvas to actual video resolution every frame
        // in case the stream resolution changes (e.g. device rotation)
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw && vh && (canvas.width !== vw || canvas.height !== vh)) {
          canvas.width  = vw;
          canvas.height = vh;
          setVideoDims({ width: vw, height: vh });
          console.log(`[CameraView] Canvas re-synced to ${vw}×${vh}`);
        }

        // Send the current frame to MediaPipe (async)
        try {
          await poseRef.current.sendFrame(video);
        } catch (err) {
          // Silently handle transient frame-send errors
          console.warn('[PoseDetection] Frame send error:', err);
        }

        // Draw on canvas
        clearCanvas(ctx, canvas.width, canvas.height);

        if (landmarksRef.current) {
          drawConnections(ctx, landmarksRef.current, canvas.width, canvas.height);
          drawKeypoints(ctx, landmarksRef.current, canvas.width, canvas.height);

          // === Angle & Rep calculation logic ===
          const landmarks = landmarksRef.current;
          let p1, p2, p3;
          if (exerciseTypeRef.current === 'squat') {
            // Left Hip (23), Left Knee (25), Left Ankle (27)
            p1 = landmarks[23]; p2 = landmarks[25]; p3 = landmarks[27];
          } else {
            // Left Shoulder (11), Left Elbow (13), Left Wrist (15)
            p1 = landmarks[11]; p2 = landmarks[13]; p3 = landmarks[15];
          }

          // Check if we have visible landmarks
          if (p1 && p2 && p3 && p1.visibility > 0.5 && p2.visibility > 0.5 && p3.visibility > 0.5) {
            // Convert normalized coordinates to pixel coordinates
            const px1 = { x: p1.x * canvas.width, y: p1.y * canvas.height };
            const px2 = { x: p2.x * canvas.width, y: p2.y * canvas.height };
            const px3 = { x: p3.x * canvas.width, y: p3.y * canvas.height };

            // Calculate angle
            const angle = calculateAngle(px1, px2, px3);
            currentAngleRef.current = angle;

            // Check if rep was performed
            let res;
            if (exerciseTypeRef.current === 'squat') {
                 res = checkRepSquat(angle, workoutStateRef.current);
            } else {
                 res = checkRepBicepCurl(angle, workoutStateRef.current);
            }
            workoutStateRef.current = res.newState;
            if (res.repCompleted) repsRef.current += 1;

            // Draw Angle near the joint
            ctx.fillStyle = 'white';
            ctx.font = '30px Arial';
            ctx.fillText(Math.round(angle) + '°', px2.x + 20, px2.y);
            
            // Draw Reps UI Box
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(10, 10, 200, 90);
            
            ctx.fillStyle = 'white';
            ctx.font = 'bold 24px Arial';
            ctx.fillText(`Exercise: ${exerciseTypeRef.current}`, 20, 40);
            ctx.fillText(`Reps: ${repsRef.current}`, 20, 70);
            
            ctx.font = '16px Arial';
            ctx.fillStyle = '#4ade80'; // light green
            ctx.fillText(`Stage: ${workoutStateRef.current.toUpperCase()}`, 110, 70);
          }
        }

        // FPS calculation
        const now = performance.now();
        frameTimesRef.current.push(now);
        // Keep only timestamps from the last second
        frameTimesRef.current = frameTimesRef.current.filter((t) => now - t < 1000);
        const currentFps = frameTimesRef.current.length;
        fpsRef.current = currentFps;

        // Update React FPS display at most ~4× per second to avoid churn
        if (Math.random() < 0.15) {
          setFps(currentFps);
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    }

    // Kick off the loop
    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  /* ── Camera error handler ──────────────────────────────────── */
  const handleCameraError = useCallback((err) => {
    console.error('[CameraView] Camera error:', err);
    setCameraError(true);
  }, []);

  /* ── Render ────────────────────────────────────────────────── */

  // Fallback when camera permission is denied
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

  return (
    <div className="camera-view">
      {/* Header */}
      <header className="header">
        <h1 className="header-title">Pose Detection</h1>
        <p className="header-subtitle">Real-time skeleton tracking</p>
      </header>

      {/* Video + Canvas container – sized to actual video resolution */}
      <div
        className="video-container"
        style={{
          width: '100%',
          maxWidth: videoDims.width,
          aspectRatio: `${videoDims.width} / ${videoDims.height}`,
        }}
      >
        {/* Loading overlay */}
        {loading && (
          <div className="loading-overlay">
            <div className="spinner" />
            <p>Loading pose model…</p>
          </div>
        )}

        {/* Webcam (mirrored) */}
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

        {/* Canvas overlay – sits directly on top of the video */}
        <canvas
          ref={canvasRef}
          className="pose-canvas"
        />

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
    </div>
  );
}

export default CameraView;
