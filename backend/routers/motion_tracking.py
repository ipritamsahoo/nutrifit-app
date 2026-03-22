from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import httpx
import os

router = APIRouter(tags=["Motion Tracking & Exercises"])


WGER_API_BASE = "https://wger.de/api/v2"
WGER_API_KEY = os.getenv("WGER_API_KEY", "")

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
EXERCISEDB_HOST = "exercisedb.p.rapidapi.com"


@router.get("/exercises")
async def get_exercises(limit: int = 20, offset: int = 0, language: int = 2):
    """
    Fetch exercises from the Wger API.
    language=2 is English.
    """
    try:
        headers = {}
        if WGER_API_KEY:
            headers["Authorization"] = f"Token {WGER_API_KEY}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{WGER_API_BASE}/exercise/",
                params={
                    "format": "json",
                    "limit": limit,
                    "offset": offset,
                    "language": language,
                    "status": 2,  # approved exercises only
                },
                headers=headers,
                timeout=15.0,
            )
            resp.raise_for_status()
            exercises = resp.json()

        return exercises

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Wger API error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch exercises: {e}")


@router.get("/search-exercise")
async def search_exercise(term: str):
    """Search Wger for an exercise by name to get its image/id."""
    try:
        headers = {}
        if WGER_API_KEY:
            headers["Authorization"] = f"Token {WGER_API_KEY}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{WGER_API_BASE}/exercise/search/",
                params={"term": term, "language": "en"},
                headers=headers,
                timeout=15.0,
            )
            resp.raise_for_status()

        return resp.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search exercise: {e}")


@router.get("/exercise-images/{exercise_id}")
async def get_exercise_images(exercise_id: int):
    """Fetch images/animations for a specific exercise from Wger."""
    try:
        headers = {}
        if WGER_API_KEY:
            headers["Authorization"] = f"Token {WGER_API_KEY}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{WGER_API_BASE}/exerciseimage/",
                params={"format": "json", "exercise_base": exercise_id, "limit": 10},
                headers=headers,
                timeout=15.0,
            )
            resp.raise_for_status()

        return resp.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch exercise images: {e}")


@router.get("/exercise-gif")
async def get_exercise_gif(name: str):
    """
    Search ExerciseDB for an exercise by name and return its exercise ID.
    The frontend uses this ID with /exercise-gif-image/{id} to show the GIF.
    """
    if not RAPIDAPI_KEY:
        return {"exercise_id": None, "error": "RAPIDAPI_KEY not configured"}

    try:
        search_name = name.strip().lower().replace("-", " ")
        alt_name = search_name.rstrip("s").strip() if search_name.endswith("s") else None
        words = search_name.split()
        last_word = words[-1].rstrip("s") if words else None

        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": EXERCISEDB_HOST,
        }

        async with httpx.AsyncClient() as client:
            # Attempt 1: Full name
            resp = await client.get(
                f"https://{EXERCISEDB_HOST}/exercises/name/{search_name}",
                headers=headers, timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()

            # Attempt 2: Without trailing 's'
            if (not data or len(data) == 0) and alt_name and alt_name != search_name:
                resp = await client.get(
                    f"https://{EXERCISEDB_HOST}/exercises/name/{alt_name}",
                    headers=headers, timeout=15.0,
                )
                resp.raise_for_status()
                data = resp.json()

            # Attempt 3: Last word only
            if (not data or len(data) == 0) and last_word and last_word != search_name and last_word != alt_name:
                resp = await client.get(
                    f"https://{EXERCISEDB_HOST}/exercises/name/{last_word}",
                    headers=headers, timeout=15.0,
                )
                resp.raise_for_status()
                data = resp.json()

        if data and len(data) > 0:
            return {"exercise_id": data[0].get("id")}

        return {"exercise_id": None}

    except httpx.HTTPStatusError as e:
        print(f"[ExerciseGIF] Search API error: {e.response.status_code}")
        return {"exercise_id": None}
    except Exception as e:
        print(f"[ExerciseGIF] Error: {e}")
        return {"exercise_id": None}


@router.get("/exercise-gif-image/{exercise_id}")
async def get_exercise_gif_image(exercise_id: str):
    """
    Proxy the animated GIF from ExerciseDB so the frontend can use it
    in an <img> tag without needing API keys.
    """
    if not RAPIDAPI_KEY:
        raise HTTPException(status_code=503, detail="RAPIDAPI_KEY not configured")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://{EXERCISEDB_HOST}/image",
                params={"exerciseId": exercise_id, "resolution": "360"},
                headers={
                    "X-RapidAPI-Key": RAPIDAPI_KEY,
                    "X-RapidAPI-Host": EXERCISEDB_HOST,
                },
                timeout=30.0,
            )
            resp.raise_for_status()

        return StreamingResponse(
            iter([resp.content]),
            media_type="image/gif",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    except Exception as e:
        print(f"[ExerciseGIF] Image proxy error: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch exercise GIF")
