import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import './ExerciseImage.css';

const API_URL = 'http://127.0.0.1:8000';

export default function ExerciseImage({ name }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  // GIF hover states
  const [gifSrc, setGifSrc] = useState(null);
  const [gifLoaded, setGifLoaded] = useState(false);
  const [gifFetched, setGifFetched] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayPos, setOverlayPos] = useState({ top: 0, left: 0 });
  const imgRef = useRef(null);

  // CRITICAL: Reset ALL gif state when exercise name changes (e.g. switching days)
  useEffect(() => {
    setGifSrc(null);
    setGifLoaded(false);
    setGifFetched(false);
    setShowOverlay(false);
  }, [name]);

  // Fetch wger image (existing logic)
  useEffect(() => {
    async function fetchImage() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/search-exercise?term=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (data.suggestions && data.suggestions.length > 0) {
          const withImage = data.suggestions.find(s => s.data && s.data.image);
          if (withImage) {
            let img = withImage.data.image;
            if (img.startsWith('/')) img = `https://wger.de${img}`;
            setImageUrl(img);
          }
        }
      } catch (err) {
        console.error('Error fetching exercise image:', err);
      } finally {
        setLoading(false);
      }
    }
    if (name) fetchImage();
  }, [name]);

  // Fetch GIF on first hover
  async function handleMouseEnter(e) {
    const rect = (imgRef.current || e.currentTarget).getBoundingClientRect();
    setOverlayPos({
      top: rect.top - 10,
      left: rect.left + rect.width / 2,
    });
    setShowOverlay(true);

    if (gifFetched) return;
    setGifFetched(true);

    try {
      const res = await fetch(`${API_URL}/exercise-gif?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (data.exercise_id) {
        setGifSrc(`${API_URL}/exercise-gif-image/${data.exercise_id}`);
      }
    } catch (err) {
      console.error('Error fetching exercise GIF:', err);
    }
  }

  function handleMouseLeave() {
    setShowOverlay(false);
  }

  function handleGifLoad() {
    setGifLoaded(true);
  }

  // Overlay via portal to escape overflow:hidden
  const overlay = showOverlay && gifSrc && gifLoaded
    ? ReactDOM.createPortal(
        <div
          className="gif-overlay"
          style={{ top: overlayPos.top, left: overlayPos.left }}
        >
          <img src={gifSrc} alt={`${name} demo`} />
          <span className="gif-label">{name}</span>
        </div>,
        document.body
      )
    : null;

  const preloader = gifSrc && !gifLoaded
    ? <img src={gifSrc} alt="" className="gif-preloader" onLoad={handleGifLoad} />
    : null;

  if (loading) {
    return <div className="ex-img-placeholder skeleton-loading"></div>;
  }

  if (!imageUrl) {
    return (
      <div
        className="ex-img-placeholder hover-container"
        ref={imgRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        🏋️
        {gifLoaded && <span className="gif-badge">▶</span>}
        {preloader}
        {overlay}
      </div>
    );
  }

  return (
    <div
      className="hover-container"
      ref={imgRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <img
        src={imageUrl}
        alt={name}
        className="ex-img"
        loading="lazy"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      {gifLoaded && <span className="gif-badge">▶</span>}
      {preloader}
      {overlay}
    </div>
  );
}
