import { useState, useEffect } from 'react';
import './ExerciseImage.css';

const API_URL = 'http://127.0.0.1:8000';

export default function ExerciseImage({ name }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchImage() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/search-exercise?term=${encodeURIComponent(name)}`);
        const data = await res.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
          // Find the first suggestion with an image
          const withImage = data.suggestions.find(s => s.data && s.data.image);
          if (withImage) {
             let img = withImage.data.image;
             if (img.startsWith('/')) {
                 img = `https://wger.de${img}`;
             }
             setImageUrl(img);
          }
        }
      } catch (err) {
        console.error('Error fetching exercise image:', err);
      } finally {
        setLoading(false);
      }
    }

    if (name) {
      fetchImage();
    }
  }, [name]);

  if (loading) {
    return <div className="ex-img-placeholder skeleton-loading"></div>;
  }

  if (!imageUrl) {
    // Return a default icon or nothing if no image is found
    return <div className="ex-img-placeholder">🏋️</div>;
  }

  return (
    <img 
      src={imageUrl} 
      alt={name} 
      className="ex-img" 
      loading="lazy"
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}
