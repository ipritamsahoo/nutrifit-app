import csv
import difflib
from pathlib import Path

_VALID_EXERCISES: list[str] | None = None
_VALID_EXERCISE_SET: set[str] | None = None
_CASEFOLD_LOOKUP: dict[str, str] | None = None
_NORMALIZED_LOOKUP: dict[str, str] | None = None

_ROOT_DIR = Path(__file__).resolve().parent.parent
_TXT_CANDIDATES = (
    _ROOT_DIR / "Verified_MuscleWiki.txt",
    _ROOT_DIR / "Verified_MuscleWiki_Data.txt",
)
_CSV_PATH = _ROOT_DIR / "Verified_MuscleWiki_Data.csv"

_EXERCISE_ALIASES = {
    "push ups": "Push Up",
    "push-up": "Push Up",
    "push-ups": "Push Up",
    "pushup": "Push Up",
    "pushups": "Push Up",
    "bench press": "Machine Chest Press",
    "chest press": "Machine Chest Press",
    "incline press": "Cable Incline Bench Press",
    "decline press": "Cable Decline Bench Chest Fly",
    "chest fly": "Cable Bench Chest Fly",
    "squats": "Bodyweight Squat",
    "squat": "Bodyweight Squat",
    "lunges": "Dumbbell Forward Lunge",
    "lunge": "Dumbbell Forward Lunge",
    "leg press": "Machine Leg Press",
    "leg extension": "Machine Leg Extension",
    "leg curl": "Machine Seated Leg Curl",
    "leg curls": "Machine Seated Leg Curl",
    "calf raise": "Dumbbell Calf Raise",
    "calf raises": "Dumbbell Calf Raise",
    "pull up": "Machine Assisted Pull Up",
    "pull ups": "Machine Assisted Pull Up",
    "pull-up": "Machine Assisted Pull Up",
    "pull-ups": "Machine Assisted Pull Up",
    "pullup": "Machine Assisted Pull Up",
    "pullups": "Machine Assisted Pull Up",
    "chin up": "Machine Assisted Chin Up",
    "chin ups": "Machine Assisted Chin Up",
    "chin-up": "Machine Assisted Chin Up",
    "chin-ups": "Machine Assisted Chin Up",
    "rows": "Dumbbell Row Bilateral",
    "bent over row": "Dumbbell Rear Delt Row",
    "lat pulldown": "Neutral Pulldown",
    "shoulder press": "Dumbbell Overhead Press",
    "overhead press": "Dumbbell Overhead Press",
    "lateral raise": "Dumbbell Lateral Raise",
    "front raise": "Dumbbell Front Raise",
    "bicep curl": "Dumbbell Curl",
    "bicep curls": "Dumbbell Curl",
    "hammer curl": "Dumbbell Hammer Curl",
    "tricep extension": "Dumbbell Overhead Tricep Extension",
    "tricep kickback": "Kickbacks",
    "dips": "Bench Dips",
    "plank": "Long Lever Forearm Plank",
    "crunch": "Band Crunch",
    "crunches": "Band Crunch",
    "sit up": "Frog Sit Up",
    "sit ups": "Frog Sit Up",
    "sit-up": "Frog Sit Up",
    "sit-ups": "Frog Sit Up",
    "burpees": "Cardio Jumping Jacks",
    "jumping jacks": "Cardio Jumping Jacks",
    "mountain climbers": "Jumping Mountain Climber",
}


def _normalize_exercise_name(name: str) -> str:
    name = name.strip().lower().replace("-", " ")
    parts = [part for part in name.split() if part]
    no_strip = {"press", "dips", "abs", "lats", "bis", "tris", "hips", "cross"}
    if parts and parts[-1] not in no_strip and parts[-1].endswith("s") and len(parts[-1]) > 3:
        parts[-1] = parts[-1][:-1]
    return " ".join(parts)


def _build_lookups() -> None:
    global _VALID_EXERCISE_SET, _CASEFOLD_LOOKUP, _NORMALIZED_LOOKUP

    valid_exercises = get_valid_exercises()
    _VALID_EXERCISE_SET = set(valid_exercises)
    _CASEFOLD_LOOKUP = {name.casefold(): name for name in valid_exercises}
    _NORMALIZED_LOOKUP = {}

    for name in valid_exercises:
        _NORMALIZED_LOOKUP.setdefault(_normalize_exercise_name(name), name)


def _load_text_exercises(path: Path) -> list[str]:
    exercises = {
        line.strip()
        for line in path.read_text(encoding="utf-8-sig", errors="replace").splitlines()
        if line.strip()
    }
    return sorted(exercises)

def get_valid_exercises() -> list[str]:
    """
    Reads verified MuscleWiki exercise names and caches them in memory.
    """
    global _VALID_EXERCISES
    if _VALID_EXERCISES is not None:
        return _VALID_EXERCISES

    try:
        for txt_path in _TXT_CANDIDATES:
            if txt_path.exists():
                _VALID_EXERCISES = _load_text_exercises(txt_path)
                break

        if _VALID_EXERCISES is None:
            exercises = set()
            with _CSV_PATH.open("r", encoding="utf-8-sig", errors="replace") as handle:
                reader = csv.DictReader(handle)
                for row in reader:
                    name = row.get("Exercise", "").strip()
                    if name:
                        exercises.add(name)

            _VALID_EXERCISES = sorted(exercises)
    except Exception as e:
        print(f"Error loading valid exercises: {e}")
        _VALID_EXERCISES = [
            "Push Up", "Bodyweight Squat", "Forearm Plank", "Dumbbell Bench Press", 
            "Dumbbell Curl", "Barbell Deadlift", "Pull Up", "Neutral Pulldown",
            "Dumbbell Lunge", "Crunch", "Dumbbell Overhead Press"
        ]

    _build_lookups()
    return _VALID_EXERCISES


def coerce_valid_exercise_name(name: str) -> str | None:
    """Map a model-produced exercise name to the closest verified MuscleWiki name."""
    if not isinstance(name, str):
        return None

    if _VALID_EXERCISE_SET is None or _CASEFOLD_LOOKUP is None or _NORMALIZED_LOOKUP is None:
        _build_lookups()

    assert _VALID_EXERCISE_SET is not None
    assert _CASEFOLD_LOOKUP is not None
    assert _NORMALIZED_LOOKUP is not None

    candidate = name.strip()
    if not candidate:
        return None

    if candidate in _VALID_EXERCISE_SET:
        return candidate

    casefold_match = _CASEFOLD_LOOKUP.get(candidate.casefold())
    if casefold_match:
        return casefold_match

    normalized_candidate = _normalize_exercise_name(candidate)
    alias_match = _EXERCISE_ALIASES.get(normalized_candidate)
    if alias_match:
        return alias_match

    normalized_match = _NORMALIZED_LOOKUP.get(normalized_candidate)
    if normalized_match:
        return normalized_match

    close_name_matches = difflib.get_close_matches(candidate, get_valid_exercises(), n=1, cutoff=0.92)
    if close_name_matches:
        return close_name_matches[0]

    close_norm_matches = difflib.get_close_matches(
        normalized_candidate,
        list(_NORMALIZED_LOOKUP.keys()),
        n=1,
        cutoff=0.92,
    )
    if close_norm_matches:
        return _NORMALIZED_LOOKUP[close_norm_matches[0]]

    return None


def sanitize_plan_workouts(plan: dict) -> dict:
    """
    Ensure AI-generated workout names come only from the verified MuscleWiki list.
    Invalid exercises are dropped if they cannot be mapped safely.
    """
    workout_plan = plan.get("workout_plan")
    if not isinstance(workout_plan, dict):
        return plan

    for day_data in workout_plan.values():
        if not isinstance(day_data, dict):
            continue

        exercises = day_data.get("exercises")
        if not isinstance(exercises, list):
            continue

        sanitized_exercises = []
        for exercise in exercises:
            if not isinstance(exercise, dict):
                continue

            canonical_name = coerce_valid_exercise_name(exercise.get("name", ""))
            if not canonical_name:
                continue

            exercise["name"] = canonical_name
            sanitized_exercises.append(exercise)

        day_data["exercises"] = sanitized_exercises

    return plan

def get_exercises_prompt_string() -> str:
    """Returns a comma-separated string of valid exercises for AI prompts."""
    return ", ".join(get_valid_exercises())
