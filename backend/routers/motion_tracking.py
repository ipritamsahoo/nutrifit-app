from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse
import httpx
import csv
import re

from pathlib import Path

router = APIRouter(tags=["Motion Tracking & Exercises"])

@router.get("/proxy-image")
async def proxy_image(file: str):

    """
    Proxy image from MuscleWiki to avoid AdBlocker issues and SSL errors.
    """
    import urllib.parse
    decoded_file = urllib.parse.unquote(file)
    target_url = f"https://media.musclewiki.com/media/uploads/images/branded/{decoded_file}"
    
    client = httpx.AsyncClient(verify=False) # Skip SSL verification for media server if needed
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        req = client.build_request("GET", target_url, headers=headers)
        resp = await client.send(req)
        
        if resp.status_code != 200:
            return JSONResponse({"error": "Image not found"}, status_code=404)

        return Response(
            content=resp.content, 
            media_type=resp.headers.get("Content-Type", "image/jpeg"),
            headers={
                "Cache-Control": "public, max-age=31536000, immutable"
            }
        )
    finally:
        await client.aclose()


@router.get("/proxy-video")
async def proxy_video(file: str, request: Request):
    """
    Proxy video from external sources (like MuscleWiki) to the frontend.
    Constructs the URL internally to completely hide the word '/branded/' 
    from AdBlockers.
    """
    import urllib.parse
    decoded_file = urllib.parse.unquote(file)
    target_url = f"https://media.musclewiki.com/media/uploads/videos/branded/{decoded_file}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    if "range" in request.headers:
        headers["Range"] = request.headers["range"]
        
    client = httpx.AsyncClient()
    req = client.build_request("GET", target_url, headers=headers)
    resp = await client.send(req, stream=True)
    
    async def stream_media():
        try:
            async for chunk in resp.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await resp.aclose()
            await client.aclose()
            
    # Copy relevant headers from the original response (like Content-Type, Content-Length)
    response_headers = {
        "Content-Type": resp.headers.get("Content-Type", "video/mp4"),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable", # 1 year cache
    }
    
    if "Content-Length" in resp.headers:
        response_headers["Content-Length"] = resp.headers["Content-Length"]
    if "Content-Range" in resp.headers:
        response_headers["Content-Range"] = resp.headers["Content-Range"]
        return StreamingResponse(stream_media(), status_code=206, headers=response_headers)

    return StreamingResponse(stream_media(), status_code=resp.status_code, headers=response_headers)


# --- MuscleWiki Support ---
MUSCLEWIKI_CSV_PATH = Path(__file__).parent.parent.parent / "Verified_MuscleWiki_Data.csv"
musclewiki_data = []

if MUSCLEWIKI_CSV_PATH.exists():
    try:
        with open(MUSCLEWIKI_CSV_PATH, 'r', encoding='utf-8-sig', errors='replace') as f:
            reader = csv.DictReader(f)
            for row in reader:
                musclewiki_data.append(row)
        print(f"[MuscleWiki] Loaded {len(musclewiki_data)} exercises.")
    except Exception as e:
        print(f"[MuscleWiki] Error loading CSV: {e}")


def construct_musclewiki_video_url(musclewiki_url: str) -> dict | None:
    """
    Given a URL like https://musclewiki.com/dumbbells/male/biceps/dumbbell-curl
    Returns a dict with front and side mp4 URLs.
    """
    if not musclewiki_url or "musclewiki.com" not in musclewiki_url:
        return None
        
    try:
        # Extract path: "dumbbells/male/biceps/dumbbell-curl"
        path = musclewiki_url.split("musclewiki.com/")[1].strip("/")
        parts = path.split("/")
        
        if len(parts) >= 4:
            equipment_slug = parts[0]
            gender = parts[1]

            exercise_slug = parts[-1] 
            
            # Equipment needs Title Case, preserving hyphens (e.g. smith-machine -> Smith-Machine)
            equipment = "-".join([word.capitalize() for word in equipment_slug.split("-")])
            
            # Construct just the filename portion
            base_filename = f"{gender}-{equipment}-{exercise_slug}"
            
            import urllib.parse
            front_encoded = urllib.parse.quote(f"{base_filename}-front.mp4")
            side_encoded = urllib.parse.quote(f"{base_filename}-side.mp4")
            
            # Return relative paths to handle protocol mismatch (HTTPS/HTTP)
            # The frontend will prepend the correct API_BASE
            return {
                "front": f"/proxy-video?file={front_encoded}",
                "side": f"/proxy-video?file={side_encoded}"
            }
    except Exception:

        pass
    
    return None

# Common alias mappings: AI-generated name -> BEST EXACT CSV exercise name
EXERCISE_ALIASES = {
    # Chest
    "push ups": "Bodyweight Push Ups",
    "push-ups": "Bodyweight Push Ups",
    "pushups": "Bodyweight Push Ups",
    "chest press": "Dumbbell Bench Press",
    "bench press": "Dumbbell Bench Press",
    "incline press": "Dumbbell Incline Bench Press",
    "decline press": "Dumbbell Decline Bench Press",
    "chest fly": "Dumbbell Chest Fly",
    
    # Legs
    "squats": "Bodyweight Squat",
    "squat": "Bodyweight Squat",
    "lunges": "Dumbbell Forward Lunge",
    "lunge": "Dumbbell Forward Lunge",
    "leg press": "Machine Leg Press",
    "leg extension": "Machine Leg Extension",
    "leg curl": "Machine Seated Leg Curl",
    "calf raise": "Dumbbell Calf Raise",
    "calf raises": "Dumbbell Calf Raise",
    
    # Back
    "pull ups": "Machine Assisted Pull Up",
    "pull-ups": "Machine Assisted Pull Up",
    "pullups": "Machine Assisted Pull Up",
    "chin ups": "Machine Assisted Chin Up",
    "chin-ups": "Machine Assisted Chin Up",
    "rows": "Dumbbell Row Bilateral",
    "bent over row": "Dumbbell Rear Delt Row",
    "lat pulldown": "Neutral Pulldown",
    
    # Shoulders
    "shoulder press": "Dumbbell Overhead Press",
    "overhead press": "Dumbbell Overhead Press",
    "lateral raise": "Dumbbell Lateral Raise",
    "front raise": "Dumbbell Front Raise",
    
    # Arms
    "bicep curl": "Dumbbell Curl",
    "bicep curls": "Dumbbell Curl",
    "hammer curl": "Dumbbell Hammer Curl",
    "tricep extension": "Dumbbell Overhead Tricep Extension",
    "tricep kickback": "Kickbacks",
    "dips": "Bench Dips",
    
    # Core
    "plank": "Long Lever Forearm Plank",
    "crunches": "Band Crunch",
    "sit ups": "Frog Sit Up",
    "sit-ups": "Frog Sit Up",
    "burpees": "Cardio Jumping Jacks", # Fallback for high-intensity
    "jumping jacks": "Cardio Jumping Jacks",
    "mountain climbers": "Jumping Mountain Climber",
}

def normalize_exercise_name(name: str) -> str:
    """Normalize an exercise name for better matching."""
    name = name.strip().lower()
    # Remove common noise words
    name = re.sub(r'\b(exercise|workout|the|a|an)\b', '', name)
    # Normalize hyphens and extra spaces
    name = name.replace("-", " ")
    name = re.sub(r'\s+', ' ', name).strip()
    # Handle trailing 's' for plurals (but not for words like 'press', 'dips')
    no_strip = {'press', 'dips', 'abs', 'lats', 'bis', 'tris', 'hips', 'cross'}
    words: list[str] = name.split()
    if words and words[-1] not in no_strip and words[-1].endswith('s') and len(words[-1]) > 3:
        last_word: str = words[-1]
        words[-1] = last_word.removesuffix('s')

    return ' '.join(words)


def score_match(search: str, candidate: str) -> int:
    """
    Score how well a candidate exercise name matches the search term.
    Higher score = better match. 0 or negative = no match.
    """
    if search == candidate:
        return 1000  # Perfect exact match

    search_norm = normalize_exercise_name(search)
    cand_norm = normalize_exercise_name(candidate)

    if search_norm == cand_norm:
        return 900  # Normalized exact match

    # Check if search is a substring of candidate or vice versa
    if search_norm in cand_norm:
        # Prefer shorter candidate names (closer match)
        return 800 - len(cand_norm)
    if cand_norm in search_norm:
        return 700 - abs(len(search_norm) - len(cand_norm))

    # Token overlap scoring
    search_tokens = set(search_norm.split())
    cand_tokens = set(cand_norm.split())
    
    if not search_tokens:
        return 0

    overlap = search_tokens & cand_tokens
    if not overlap:
        return 0

    overlap_ratio = len(overlap) / len(search_tokens)
    if overlap_ratio < 0.5:
        return 0  # Need at least half the tokens to match

    # Score: more overlap = higher, shorter candidate = higher
    return int(500 * overlap_ratio) - len(cand_norm)


@router.get("/musclewiki-video")
async def get_musclewiki_video(name: str):
    """
    Search MuscleWiki CSV for the exercise by name (smart scored matching).
    Return the direct video URLs.
    """
    if not musclewiki_data:
        return {"error": "MuscleWiki data not loaded"}

    search_name = name.strip().lower()
    
    # Check alias map first
    alias_search = normalize_exercise_name(search_name)
    if alias_search in EXERCISE_ALIASES:
        search_name = EXERCISE_ALIASES[alias_search]
    elif search_name in EXERCISE_ALIASES:
        search_name = EXERCISE_ALIASES[search_name]

    # Score all exercises and pick the best
    best_match = None
    best_score = 0
    seen_exercises = set()  # Avoid scoring duplicates

    for row in musclewiki_data:
        ex_name = row.get("Exercise", "").strip()
        ex_lower = ex_name.lower()
        
        if ex_lower in seen_exercises:
            continue
        seen_exercises.add(ex_lower)

        s = score_match(search_name, ex_lower)
        if s > best_score:
            best_score = s
            best_match = row

    if best_match and best_score > 0:
        male_url = best_match.get("Video Link (Male)")
        if male_url:
            video_urls = construct_musclewiki_video_url(male_url)
            if video_urls:
                # --- SERVER SIDE VALIDATION (DISABLED FOR STABILITY) ---
                # MuscleWiki media server sometimes blocks HEAD requests, causing false negatives.
                # We will trust our CSV mapping and let the frontend handle fallback.
                """
                try:
                    target_filename_quoted = video_urls["front"].split("?file=")[1]
                    check_url = f"https://media.musclewiki.com/media/uploads/videos/branded/{target_filename_quoted}"
                    
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    }
                    
                    async with httpx.AsyncClient() as client:
                        r = await client.head(check_url, headers=headers, timeout=8.0)
                        if r.status_code not in (200, 206):
                            print(f"[MuscleWiki] Warning: Video {check_url} returned status {r.status_code}. Falling back.")
                            return {"found": False}
                except Exception as e:
                    print(f"[MuscleWiki] Warning: Verification failed for {name}. Falling back. Error: {e}")
                    return {"found": False}
                """
                # ----------------------------------------------------
                
                return {
                    "found": True,
                    "exercise_name": best_match.get("Exercise"),
                    "muscle_group": best_match.get("Muscle Group"),
                    "difficulty": best_match.get("Difficulty"),
                    "videos": video_urls,
                    "match_score": best_score
                }

    return {"found": False}

