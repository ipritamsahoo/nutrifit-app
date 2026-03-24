// src/features/camera/exerciseCache.js
export const mediaCache = {};
export const muscleWikiCache = {};

const API_URL = ''; // Uses Vite proxy

export async function prefetchMuscleWikiVideo(name) {
  if (!name || muscleWikiCache[name]) return;
  try {
    const res = await fetch(`${API_URL}/musclewiki-video?name=${encodeURIComponent(name)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.found && data.videos) {
        // Derive static image from video proxy URL if needed
        const frontVideo = data.videos.front;
        if (frontVideo && frontVideo.includes('file=')) {
           const fileName = frontVideo.split('file=')[1].split('&')[0];
           const imgFileName = fileName.replace('.mp4', '.jpg');
           data.image = `${API_URL}/proxy-image?file=${imgFileName}`;
        }
        muscleWikiCache[name] = data;
      }
    }
  } catch (err) {
    // Ignore errors
  }
}
