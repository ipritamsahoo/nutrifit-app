"""
chat_service.py
================
Two-Stage Conversational AI service for the Virtual Coach chatbot.
Stage 1: Lightweight chat to collect user info (Goal, Equipment, Focus).
Stage 2: Plan generation using Smart Routing from structured exercise folders.
"""

import os
import json
import re
import random
import time
import threading
import hashlib
from typing import List, Optional, Any, Dict
from openai import OpenAI
from dotenv import load_dotenv
from exercise_utils import sanitize_plan_workouts  # type: ignore
from ai_service import _build_fallback_plan, generate_compact_plan
from diet_engine import build_7_day_diet         # type: ignore
from plan_assembler import expand_workout_plan     # type: ignore

load_dotenv()

# Split models: Use stepfun for chat, but a blazing fast model for heavy JSON plan gen
_CHAT_MODEL = "stepfun/step-3.5-flash:free"
_PLAN_MODEL = "google/gemini-2.0-flash-lite-preview-02-05:free"

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_EXERCISES_DIR = os.path.join(_BASE_DIR, "exercises")

_api_key = os.getenv("OPENROUTER_API_KEY")
if not _api_key:
    print("[Chat] WARNING: OPENROUTER_API_KEY not found in environment!")
    _api_key = "sk-missing"

_api_key_2 = os.getenv("OPENROUTER_API_KEY_2")
if not _api_key_2:
    print("[Chat] WARNING: OPENROUTER_API_KEY_2 not found! Plan gen will share Key 1.")
    _api_key_2 = _api_key  # Fallback to same key if second key is missing

# Client 1: For chat (Stage 1 - lightweight conversation)
client = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=_api_key,
  timeout=60.0,
  default_headers={
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "HonFit Virtual Coach",
  }
)

# Client 2: For plan generation (Stage 2 - heavy JSON generation)
client_plan = OpenAI(
  base_url="https://openrouter.ai/api/v1",
  api_key=_api_key_2,
  timeout=90.0,
  default_headers={
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "HonFit Plan Generator",
  }
)

# Simple memory cache for background tasks during a user's session
_session_store = {}

_QUESTION_FLOW = [
    "Great! Let's begin with some basics.\n\n1. What's your age?",
    "2. What's your height in cm?",
    "3. What's your weight in kg?",
    "4. What's your main goal? Choose one: BUILD_MUSCLE, LOSE_WEIGHT, STAY_FIT, or FLEXIBILITY.",
    "5. What type of equipment do you have? Choose one: NO_EQUIPMENT or WITH_EQUIPMENT.",
    "6. Do you have any medical problems, pain, or injuries? If none, just say 'none'.",
    "7. Which specific body parts or areas would you like to focus on? For example: Chest, Back, Legs, Core, or Full Body.",
    "8. What's your food preference? Veg or Non-Veg?",
    "How much water do you usually drink in a day?",
    "How many hours of sleep do you usually get?",
    "Do you have a mostly sitting desk job or are you active during the day?",
    "Last one: how are your stress levels lately?",
]


def _new_session_state() -> dict:
    return {
        "filtered_exercises": "Push Up, Bodyweight Squat, Glute Bridge, Dead Bug",
        "plan_json": None,
        "filtering_done": False,
        "filtering_started": False,
        "plan_done": False,
        "plan_started": False,
        "plan_delivered": False,
        "profile": None,
    }


def _ensure_session(session_id: str, reset: bool = False) -> dict:
    if reset or session_id not in _session_store:
        print(f"[Chat] Initializing session for {session_id}")
        _session_store[session_id] = _new_session_state()
    return _session_store[session_id]


def _looks_like_json_object(text: str | None) -> bool:
    return bool(isinstance(text, str) and text.strip().startswith("{") and text.strip().endswith("}"))


def _get_next_prompt(answer_count: int) -> str:
    if answer_count < 0:
        answer_count = 0
    if answer_count >= len(_QUESTION_FLOW):
        return _QUESTION_FLOW[-1]
    return _QUESTION_FLOW[answer_count]


def _build_plan_ready_response(plan_json: Optional[str]) -> str:
    """Safely build a response string containing the JSON plan."""
    content = plan_json if plan_json else "{}"
    return f"Your personalized plan is completely ready! Here it is:\n\n```json\n{content}\n```"


def _finalize_plan_for_chat(session_id: str, profile: dict) -> str:
    session = _ensure_session(session_id)
    cached_plan = session.get("plan_json")

    if _looks_like_json_object(cached_plan):
        session["plan_delivered"] = True
        return _build_plan_ready_response(str(cached_plan))

    if not session.get("plan_started"):
        _start_plan_generation_background(session_id, profile)

    print(f"[Chat] Finalizing plan for {session_id}...")
    for _ in range(12):
        time.sleep(0.5)
        cached_plan = session.get("plan_json")
        if session.get("plan_done") and _looks_like_json_object(cached_plan):
            session["plan_delivered"] = True
            return _build_plan_ready_response(str(cached_plan))

    print(f"[Chat] Plan not ready in time for {session_id}. Using fallback compact plan.")
    fallback_plan = _build_fallback_plan(
        age=profile["age"],
        weight=profile["weight"],
        height=profile["height"],
        goal=profile["goal"],
        medical_conditions=profile["medical_conditions"],
        diet_preference=profile.get("diet_preference", ""),
    )
    fallback_json = json.dumps(fallback_plan, ensure_ascii=False)
    session["plan_json"] = fallback_json
    session["plan_done"] = True
    session["plan_delivered"] = True
    return _build_plan_ready_response(fallback_json)


def _extract_user_answers(messages: list[dict]) -> list[str]:
    answers: list[str] = []
    for msg in messages:
        if msg.get("role") != "user":
            continue
        parts = msg.get("parts") or []
        if not parts:
            continue
        text = str(parts[0]).strip()
        if text:
            answers.append(text)
    return answers


def _extract_number(text: str, default: float) -> float:
    match = re.search(r"(\d+(?:\.\d+)?)", text or "")
    return float(match.group(1)) if match else float(default)


def _normalize_goal(goal: str) -> str:
    value = (goal or "").strip().upper().replace(" ", "_")
    if "FLEX" in value:
        return "FLEXIBILITY"
    if "MUSCLE" in value or "BULK" in value or "GAIN" in value:
        return "BUILD_MUSCLE"
    if "LOSE" in value or "WEIGHT" in value or "FAT" in value:
        return "LOSE_WEIGHT"
    if value == "STAY_FIT":
        return value
    return "STAY_FIT"


def _normalize_equipment(equipment: str) -> str:
    value = (equipment or "").strip().upper().replace(" ", "_")
    if "WITH" in value or "DUMBBELL" in value or "MACHINE" in value or "BARBELL" in value:
        return "WITH_EQUIPMENT"
    if "NO" in value or "BODYWEIGHT" in value:
        return "NO_EQUIPMENT"
    return "NO_EQUIPMENT"


def _extract_targets(text: str) -> list[str]:
    raw_parts = re.split(r",| and | & ", text or "", flags=re.IGNORECASE)
    targets = [part.strip() for part in raw_parts if part.strip()]
    return targets or ["Full Body"]


def _extract_profile_from_messages(messages: list[dict]) -> dict | None:
    answers = _extract_user_answers(messages)
    if len(answers) < 7:
        return None

    return {
        "answer_count": len(answers),
        "age": int(round(_extract_number(answers[0], 25))),
        "height": _extract_number(answers[1], 170),
        "weight": _extract_number(answers[2], 70),
        "goal": _normalize_goal(answers[3] if len(answers) > 3 else "STAY_FIT"),
        "equipment": _normalize_equipment(answers[4] if len(answers) > 4 else "NO_EQUIPMENT"),
        "medical_conditions": answers[5] if len(answers) > 5 else "",
        "targets": _extract_targets(answers[6] if len(answers) > 6 else "Full Body"),
        "diet_preference": answers[7] if len(answers) > 7 else "",
    }


def _start_filtering_background(session_id: str, profile: dict) -> None:
    session = _session_store[session_id]
    if session.get("filtering_started"):
        return

    session["filtering_started"] = True

    def filter_task():
        print(f"[Filter] Starting task for {session_id} targets: {profile['targets']}")
        try:
            session["filtered_exercises"] = _get_filtered_exercises(
                profile["goal"],
                profile["equipment"],
                profile["targets"],
            )
        except Exception as exc:
            print(f"[Filter] Task failed for {session_id}: {exc}")
            session["filtered_exercises"] = "Push Up, Bodyweight Squat, Glute Bridge, Dead Bug"
        finally:
            session["filtering_done"] = True
            print(f"[Filter] Task COMPLETE for {session_id}. Data ready.")

    threading.Thread(target=filter_task, daemon=True).start()


def _start_plan_generation_background(session_id: str, profile: dict) -> None:
    session = _session_store[session_id]
    if session.get("plan_started"):
        return

    session["plan_started"] = True

    def generate_task():
        print(f"[Generator] Compact plan task started for {session_id}...")
        try:
            result = generate_compact_plan(
                age=profile["age"],
                weight=profile["weight"],
                height=profile["height"],
                goal=profile["goal"],
                medical_conditions=profile["medical_conditions"],
                diet_preference=profile.get("diet_preference", ""),
            )
            session["plan_json"] = json.dumps(result["plan"], ensure_ascii=False)
        except Exception as exc:
            print(f"[Generator] Compact plan task failed for {session_id}: {exc}")
            result = generate_compact_plan(
                age=25,
                weight=70,
                height=170,
                goal="STAY_FIT",
                medical_conditions="",
                diet_preference=profile.get("diet_preference", ""),
            )
            session["plan_json"] = json.dumps(result["plan"], ensure_ascii=False)
        finally:
            session["plan_done"] = True
            print(f"[Generator] Task COMPLETE for {session_id}. Plan ready.")

    threading.Thread(target=generate_task, daemon=True).start()

def get_chat_system_prompt() -> str:
    """Lightweight prompt for the conversational stage."""
    return """You are HonFit Virtual Coach — a friendly, professional AI fitness and nutrition coach.
Your job is to have a natural conversation with the user to understand their needs. You MUST progress through the 3 phases strictly.

## PHASE 1: CORE QUESTIONS
Greet the user and ask these questions STRICTLY ONE AT A TIME in this exact order. 
1. Age
2. Height
3. Weight
4. Goal (Present these exact options naturally without underscores: Build Muscle, Lose Weight, Stay Fit, or Flexibility)
5. Equipment (Present these exact options naturally without underscores: No Equipment or With Equipment)
6. Medical problems or injuries
7. Focus Areas / Specific body parts (e.g., Chest, Biceps, Abs, Quads, Full Body)
8. Food preference (Veg or Non-Veg)

Wait for the user to answer the current question before asking the next. Do not repeat questions already answered.

**CRITICAL VALIDATION RULE**: You MUST validate the user's answer using your intelligence. 
- If you ask for 'Age' and the user replies with a height (e.g., "5 ft 8"), a name, or nonsense, politely alert them that they entered the wrong information and RE-ASK for their Age. 
- Do NOT move to the next question until you have successfully obtained a valid answer for the current one.
- Apply this sanity/validation check to ALL 8 questions!

## PHASE 2: SECRET TRIGGERS & FILLER QUESTIONS (BUYING TIME)
- When the user successfully answers #7 (Focus Areas), your next reply MUST start with:
[START_FILTERING] Goal: <goal>, Equipment: <equipment>, Targets: Target1, Target2, Target3
(ALWAYS use commas between targets. Smoothly ask question #8 Food preference after.)

- When the user answers #8 (Food preference), your next reply MUST start with:
[START_PLAN_GEN] Summary: <summarize the user's profile>
(Then seamlessly transition into asking the first Filler Question below)

Now ask these 4 lifestyle questions STRICTLY ONE AT A TIME:
- Filler 1: How much water do you usually drink in a day?
- Filler 2: How many hours of sleep do you usually get?
- Filler 3: Do you have a mostly sitting desk job or are you active during the day?
- Filler 4: How are your stress levels lately?

## PHASE 3: FINAL DELIVERY
Once the user answers Filler 4, YOU MUST STOP ASKING QUESTIONS. 
Respond with EXACTLY and ONLY this tag:
[PLAN_READY]

## PLAN MODIFICATION (IF THE USER WANTS TO CHANGE THE PLAN)
If the user asks to "modify this plan" or "adjust it" AFTER you have already output [PLAN_READY]:
1. DO NOT instantly output [PLAN_READY] again! This is a critical error.
2. Politely ask the user in plain text: "Sure, let's adjust it! What exactly would you like to change? (e.g., your goal, target muscles, equipment, or food preference?)"
3. Wait for their answer.
4. Once they tell you what to change, output [START_FILTERING] with the updated variables to restart plan generation in the background.

CRITICAL RULES:
- NEVER loop back to ask about Goal, Age, or Weight once you are in Phase 2.
- After the user answers Filler 4, DO NOT ask anything else. Output ONLY [PLAN_READY].
"""

def get_generation_system_prompt(valid_exercises: str) -> str:
    """Ultra-restricted prompt for Stage 2 plan generation."""
    return f"""### ROLE: EXPERT FITNESS JSON GENERATOR
### CORE DIRECTIVE: Output ONLY a valid 7-day JSON object. EXACTLY as specified.
### ABSOLUTE CONSTRAINTS (STRICT OBEDIENCE REQUIRED):
1. **EXERCISES**: 
   - USE ONLY NAMES FROM THIS LIST: {valid_exercises}
   - DO NOT hallucinate, invent, or suggest ANY exercise not on the list.
   - EXACTLY 4 exercises per workout day.
2. **FORMAT**: 
   - OUTPUT 100% VALID JSON ONLY. No markdown triple backticks. No conversational text. No intro/outro.
3. **CONTENT**: 
   - STRICT MINIMALISM: Keep all text extremely short to save tokens and speed up generation.
   - Meal names MUST be 2-3 words max (e.g., "Oatmeal", "Chicken Rice").
   - NO notes, NO descriptions. Keep it incredibly brief and fast.

### JSON STRUCTURE TEMPLATE:
{{
  "diet_plan": {{ 
    "day_1": {{ 
      "breakfast": {{"meal": "...", "calories": 0}}, 
      "lunch": {{"meal": "...", "calories": 0}}, 
      "dinner": {{"meal": "...", "calories": 0}}, 
      "snacks": {{"meal": "...", "calories": 0}} 
    }}, ... 
  }},
  "workout_plan": {{ 
    "day_1": {{ 
      "exercises": [
        {{"name": "...", "sets": 3, "reps": 12, "target_muscle": "..."}}, ...
      ], 
      "duration_minutes": 45 
    }}, ... 
  }},
  "daily_calories_target": 2000, 
  "daily_water_liters": 2.5, 
  "notes": "..."
}}"""

def _get_filtered_exercises(goal: str, equipment: str, targets: list[str]) -> str:
    """Read JSON files from the structured folders and return a combined list of names."""
    # Normalize inputs to match folder names: "Build Muscle" -> "BUILD_MUSCLE"
    goal_norm = goal.strip().upper().replace(" ", "_")
    equip_norm = equipment.strip().upper().replace(" ", "_")
    
    goal_dir = os.path.join(_EXERCISES_DIR, goal_norm)
    equip_dir = os.path.join(goal_dir, equip_norm)
    
    if not os.path.exists(equip_dir):
        print(f"[Chat] Warning: Folder {equip_dir} not found. Falling back to STAY_FIT/NO_EQUIPMENT")
        equip_dir = os.path.join(_EXERCISES_DIR, "STAY_FIT", "NO_EQUIPMENT")
        goal_norm, equip_norm = "STAY_FIT", "NO_EQUIPMENT" # For logging below
 
    # Common synonyms for muscles to improve matching
    SYNONYMS = {
        "abs": ["abdominals", "lower abdominals", "upper abdominals", "obliques"],
        "hand": ["forearms", "biceps", "triceps", "wrists"],
        "hands": ["forearms", "biceps", "triceps", "wrists"],
        "glutes": ["gluteus maximus", "gluteus medius", "glutes"],
        "quads": ["quads", "inner quadriceps", "outer quadricep", "rectus femoris"],
        "back": ["lower back", "lats", "traps", "traps (mid-back)"],
        "shoulders": ["shoulders", "anterior deltoid", "lateral deltoid", "posterior deltoid", "front shoulders", "rear shoulders"],
        "shoulder": ["shoulders", "anterior deltoid", "lateral deltoid", "posterior deltoid", "front shoulders", "rear shoulders"],
        "neck": ["traps", "upper traps"],
        "legs": ["quads", "hamstrings", "calves", "glutes", "inner thigh"],
        "leg": ["quads", "hamstrings", "calves", "glutes", "inner thigh"],
        "core": ["abdominals", "obliques", "lower back", "lower abdominals", "upper abdominals"],
        "chest": ["chest", "mid and lower chest", "upper chest"],
        "arms": ["biceps", "triceps", "forearms", "lateral head triceps", "medial head triceps"],
        "arm": ["biceps", "triceps", "forearms"],
        "bicep": ["biceps"],
        "tricep": ["triceps", "lateral head triceps", "medial head triceps"],
        "calf": ["calves", "gastrocnemius", "tibialis"],
    }

    all_names = []
    
    # Process targets: split by 'and', '&', ',', and even SPACES if they look like multiple words
    processed_targets = []
    for t in targets:
        # 1. First split by standard delimiters
        parts = re.split(r",| and | & ", t, flags=re.IGNORECASE)
        for part in parts:
            p = part.strip()
            if not p: continue
            # 2. If a part looks like multiple words (e.g. "Chest Biceps Triceps"), split by space
            # but only if the whole string isn't an exact filename match already
            sub_parts = p.split(" ")
            if len(sub_parts) > 1:
                processed_targets.extend([sp.strip() for sp in sub_parts if sp.strip()])
                processed_targets.append(p) # Keep the original too just in case it's "Anterior Deltoid"
            else:
                processed_targets.append(p)

    # If "Full Body" is mentioned, grab a few from every file in that folder
    if "full body" in [t.lower() for t in processed_targets]:
        if os.path.exists(equip_dir):
            for file in os.listdir(equip_dir):
                if file.endswith(".json"):
                    with open(os.path.join(equip_dir, file), "r", encoding="utf-8") as f:
                        names = json.load(f)
                        all_names.extend(random.sample(names, min(4, len(names))))
    else:
        # Load specific target files (Case-insensitive matching)
        if os.path.exists(equip_dir):
            available_files = {f.lower(): f for f in os.listdir(equip_dir) if f.endswith(".json")}
            for target in processed_targets:
                t_lower = target.strip().lower()
                # Check directly or via synonyms
                search_terms = {t_lower}
                if t_lower in SYNONYMS:
                    search_terms.update(SYNONYMS[t_lower])
                
                found_for_target = False
                for term in search_terms:
                    filename = f"{term}.json"
                    if filename in available_files:
                        filepath = os.path.join(equip_dir, available_files[filename])
                        with open(filepath, "r", encoding="utf-8") as f:
                            names = json.load(f)
                            all_names.extend(names)
                        found_for_target = True
                
                if not found_for_target:
                    print(f"[Chat] Warning: No match found for target '{target}' (searched: {search_terms})")

    unique_names = list(set(all_names))
    
    # FINAL SAFETY: If we found NOTHING (typo, missing file), fall back to Full Body
    if not unique_names:
        print(f"[Filter] EMERGENCY FALLBACK: No exercises found for {goal_norm}. Grabbing Full Body.")
        full_body_dir = os.path.join(_EXERCISES_DIR, goal_norm, "NO_EQUIPMENT")
        if os.path.exists(full_body_dir):
            for file in os.listdir(full_body_dir):
                if file.endswith(".json"):
                    with open(os.path.join(full_body_dir, file), "r", encoding="utf-8") as f:
                        all_names.extend(json.load(f))
            unique_names = list(set(all_names))

    if len(unique_names) > 30:
        unique_names = random.sample(unique_names, 30)
        
    print(f"[Filter] Final unique list for {goal_norm}/{equip_norm}: {len(unique_names)} exercises found.")
    res = ", ".join(unique_names)
    if not res:
        print(f"[Filter] WARNING: Result is EMPTY for targets {processed_targets}")
    return res

def _generate_plan(user_summary: str, valid_exercises: str) -> str:
    """Stage 2 API call: Fetches A/B templates and assembles full programmatic plan."""
    print(f"[Chat] Stage 2: Generating A/B templates with {len(valid_exercises.split(','))} exercises...")
    try:
        response = client_plan.chat.completions.create(
            model=_PLAN_MODEL,
            messages=[
                {"role": "system", "content": get_generation_system_prompt(valid_exercises)},
                {"role": "user", "content": f"User Profile: {user_summary}"}
            ],
            temperature=0.1 # Lower temp makes it generate faster and stick strictly to JSON format
        )
        result_text = response.choices[0].message.content or ""
        print(f"[Chat] Stage 2 AI templates (first 200 chars): {result_text[:200]}")
        
        # Parse minimal AI output
        json_match = re.search(r'(\{[\s\S]*\})', result_text)
        if json_match:
            try:
                ai_data = json.loads(json_match.group(1))
            except:
                ai_data = {}
        else:
            ai_data = {}
            
        template_a = ai_data.get("template_a", [])
        template_b = ai_data.get("template_b", [])
        
        # Safely parse calories to integer since LLM sometimes returns strings
        try:
            cals_raw = ai_data.get("daily_calories_target", 2000)
            cals = int(cals_raw)  # type: ignore
        except (ValueError, TypeError):
            cals = 2000
            
        water = ai_data.get("daily_water_liters", 2.5)
        notes = ai_data.get("notes", "Stay hydrated and be consistent!")
        
        # Determine veg heuristically from user_summary
        is_veg = "non-veg" not in user_summary.lower() and "non veg" not in user_summary.lower()
        print(f"[Chat] V2 Assembler: is_veg={is_veg}, cals={cals}")
        
        # V2 Deterministic Engine Calls
        diet = build_7_day_diet(is_veg, cals)
        workout = expand_workout_plan(template_a, template_b)
        
        final_plan = {
            "diet_plan": diet,
            "workout_plan": workout,
            "daily_calories_target": cals,
            "daily_water_liters": water,
            "notes": notes
        }
        
        return json.dumps(final_plan, indent=2)
    except Exception as e:
        print(f"[Chat] Stage 2 Error: {e}")
        return ""

def chat_with_coach(messages: list[dict], uid: str = "default_session") -> str:
    """Backend-controlled chat flow with background plan generation."""
    session_id = uid
    answers = _extract_user_answers(messages)
    session = _ensure_session(session_id, reset=not answers)
    answer_count = len(answers)

    profile = _extract_profile_from_messages(messages)
    if profile:
        session["profile"] = profile

    if profile and answer_count >= 7:
        _start_filtering_background(session_id, profile)

    if profile and answer_count >= 8:
        _start_plan_generation_background(session_id, profile)

    if profile and answer_count >= 12:
        return _finalize_plan_for_chat(session_id, profile)

    if session.get("plan_delivered"):
        cached_plan = session.get("plan_json")
        if _looks_like_json_object(cached_plan):
            return _build_plan_ready_response(cached_plan)

    next_prompt = _get_next_prompt(answer_count)
    print(f"[Chat] Sending backend prompt for {session_id}: step={answer_count + 1}")
    return next_prompt

def extract_plan_from_response(text: str) -> dict | None:
    """Parses JSON from AI response."""
    if not text: return None
    print(f"[Extract] Trying to extract plan from response (length={len(text)})")
    
    # Try markdown code block format first
    json_match = re.search(r'```json\s*(\{[\s\S]*\})\s*```', text)
    
    # If no markdown block, try parsing raw JSON directly
    if not json_match:
        print("[Extract] No ```json block found, trying raw JSON...")
        json_match = re.search(r'(\{[\s\S]*\})', text)
    
    if json_match:
        try:
            raw = str(json_match.group(1))
            print(f"[Extract] Found JSON (first 200 chars): {str(raw)[:200]}")  # type: ignore
            plan = json.loads(raw)
            if (
                isinstance(plan, dict)
                and isinstance(plan.get("sched"), list)
                and isinstance(plan.get("tpl"), dict)
            ):
                print("[Extract] SUCCESS: Compact plan detected!")
                return plan
            if "diet_plan" in plan and "workout_plan" in plan:
                print("[Extract] SUCCESS: Plan has diet_plan and workout_plan!")
                return sanitize_plan_workouts(plan)
            else:
                print(f"[Extract] FAIL: Missing keys. Found keys: {list(plan.keys())}")
        except Exception as e:
            print(f"[Extract] FAIL: JSON parse error: {e}")
    else:
        print("[Extract] FAIL: No JSON found at all in response")
    return None
