import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { muscleWikiCache } from './exerciseCache';
import { useNavigate } from 'react-router-dom';
import './VideoModal.css';

export default function VideoModal({ exerciseName, videos, muscleGroup, difficulty, onClose, isLoading, onTrackExercise }) {
  const [frontLoaded, setFrontLoaded] = useState(false);
  const [sideLoaded, setSideLoaded] = useState(false);
  const [frontError, setFrontError] = useState(false);
  const [sideError, setSideError] = useState(false);
  const [showSplitView, setShowSplitView] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loaderConfig, setLoaderConfig] = useState(null);
  const navigate = useNavigate();

  // Helper to ensure URL is correct (using relative paths for Vite proxy)
  const getAbsoluteUrl = (url) => {
    if (!url) return null;
    return url; // Backend now returns relative paths like "/proxy-video?file=..."
  };

  const frontUrl = getAbsoluteUrl(videos?.front);
  const sideUrl = getAbsoluteUrl(videos?.side);

  // Reset loading state when the videos change
  useEffect(() => {
    setFrontLoaded(false);
    setSideLoaded(false);
    setFrontError(false);
    setSideError(false);
    setShowSplitView(false);
    setProgress(0);
    // Generate a new organic config for this specific load
    setLoaderConfig({
      profile: Math.floor(Math.random() * 3), 
      break1: 30 + Math.random() * 20, 
      break2: 65 + Math.random() * 20,
      baseSpeed: 0.8 + Math.random() * 0.6
    });
  }, [exerciseName, videos]); // Reset if videos change too

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Simulated "Fake" Progress Logic
  useEffect(() => {
    if (frontLoaded || sideLoaded || frontError || sideError) {
      setProgress(100);
      return;
    }

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 99 || !loaderConfig) return prev;
        
        let increment = 0;
        const { profile, break1, break2, baseSpeed } = loaderConfig;
        
        // Organic Profiles
        if (profile === 0) { // Profile: Consistent Glide
          if (prev < break1) increment = (Math.random() * 8 + 5) * baseSpeed;
          else if (prev < break2) increment = (Math.random() * 2 + 1) * baseSpeed;
          else increment = Math.random() * 0.4 + 0.1;
        } 
        else if (profile === 1) { // Profile: The "Wave" (Accelerates mid-way)
          if (prev < break1) increment = (Math.random() * 3 + 1) * baseSpeed;
          else if (prev < break2) increment = (Math.random() * 12 + 6) * baseSpeed;
          else increment = Math.random() * 1 + 0.1;
        }
        else { // Profile: The "Hitch" (Stammers then leaps)
          const isStuttering = Math.random() > 0.8;
          if (prev < break1) {
            increment = isStuttering ? 0.2 : (Math.random() * 10 + 3) * baseSpeed;
          } else if (prev < break2) {
            increment = (Math.random() * 4 + 2) * baseSpeed;
          } else {
            increment = Math.random() * 0.2 + 0.05;
          }
        }
        
        return Math.min(prev + increment, 99);
      });
    }, 180);

    return () => clearInterval(interval);
  }, [isLoading, frontLoaded, sideLoaded, frontError, sideError, loaderConfig]);

  const hasLoadedAny = frontLoaded || sideLoaded;
  const hasErrorBoth = frontError && sideError;

  return ReactDOM.createPortal(
    <div className="video-modal-backdrop" onClick={onClose}>
      <div className="video-modal-content" onClick={e => e.stopPropagation()}>
        <div className="video-modal-header">
          <h3>🏋️ {exerciseName}</h3>
          <button className="close-modal-btn" onClick={onClose} aria-label="Close video">
            ✕
          </button>
        </div>
        
        {/* Loading / Error States */}
        {!hasLoadedAny && !hasErrorBoth ? (
          <div className="video-loading fake-downloading" style={{ padding: '100px 20px' }}>
            <div className="download-percentage">{Math.round(progress)}%</div>
            <div className="download-text">
              {isLoading ? "Locating Workout Data..." : "Downloading High-Quality Demonstration..."}
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : hasErrorBoth ? (
          <div className="video-loading" style={{ padding: '80px 20px' }}>
             <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⚠️</div>
             <p>Unable to load video demonstration.</p>
             <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>Please check your connection or try another exercise.</p>
             <button className="btn-ghost" style={{ marginTop: '20px' }} onClick={onClose}>Close</button>
          </div>
        ) : null}

        {videos ? (
            <div 
              className={`video-container ${(frontLoaded && sideLoaded && showSplitView) ? 'is-split' : 'is-single'}`}
              style={{
                display: hasLoadedAny ? 'flex' : 'none',
              }}
            >
              {/* Front Video */}
              <div className={`video-wrapper ${(!showSplitView || !sideLoaded) ? 'full-width' : ''}`} style={{ display: frontLoaded ? 'block' : 'none' }}>
                <video 
                  className="video-player" 
                  src={frontUrl} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                  preload="auto"
                  onLoadedData={() => setFrontLoaded(true)}
                  onCanPlay={() => setFrontLoaded(true)}
                  onError={() => { console.error("Front video fail"); setFrontError(true); }}
                />
                <div className="watermark-cover">NutriFit Pro</div>
              </div>
              
              {/* Side Video */}
              <div className={`video-wrapper ${(!showSplitView || !frontLoaded) ? 'full-width' : ''}`} style={{ display: (sideLoaded && (showSplitView || !frontLoaded)) ? 'block' : 'none' }}>
                <video 
                  className="video-player" 
                  src={sideUrl} 
                  autoPlay 
                  loop 
                  muted 
                  playsInline 
                  preload="auto"
                  onLoadedData={() => setSideLoaded(true)}
                  onCanPlay={() => setSideLoaded(true)}
                  onError={() => { console.error("Side video fail"); setSideError(true); }}
                />
                <div className="watermark-cover">AI Analytics</div>
              </div>

              {/* Toggle Controls */}
              {(frontLoaded && sideLoaded) && (
                <div className="view-controls">
                  <button 
                    className="view-toggle-btn" 
                    onClick={() => setShowSplitView(!showSplitView)}
                  >
                    {showSplitView ? '📺 Single View' : '🔲 Split Screen'}
                  </button>
                </div>
              )}
              
              {/* "Next Ready" Hint if not split but side is ready */}
              {(!showSplitView && frontLoaded && sideLoaded) && (
                <div className="ready-hint">Side View Available! ↑</div>
              )}
            </div>
        ) : !isLoading && (
          <div className="video-loading">
            <p>Video demonstration not available for this exercise.</p>
          </div>
        )}

        {/* Hidden pre-loaders */}
        {videos && (
          <div style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }}>
              {!frontLoaded && !frontError && <video src={frontUrl} muted preload="auto" onLoadedData={() => setFrontLoaded(true)} onError={() => setFrontError(true)} />}
              {!sideLoaded && !sideError && <video src={sideUrl} muted preload="auto" onLoadedData={() => setSideLoaded(true)} onError={() => setSideError(true)} />}
          </div>
        )}

        <div className="video-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="muscle-badge">💪 {muscleGroup || 'Muscle Target'}</span>
            {difficulty && (
              <span className="muscle-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#6ee7b7' }}>
                ⚡ {difficulty}
              </span>
            )}
          </div>
          <button 
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.9rem', borderRadius: '8px' }}
            onClick={() => {
              onClose();
              if (onTrackExercise) {
                onTrackExercise(exerciseName);
              } else {
                navigate(`/workout?exercise=${encodeURIComponent(exerciseName)}`);
              }
            }}
          >
            🎥 Track this Exercise
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
