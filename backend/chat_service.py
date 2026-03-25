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
from openai import OpenAI
from dotenv import load_dotenv
from exercise_utils import sanitize_plan_workouts

load_dotenv()

_MODEL_NAME = "stepfun/step-3.5-flash:free"
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

def get_chat_system_prompt() -> str:
    """Lightweight prompt for the conversational stage."""
    return """You are HonFit Virtual Coach — a friendly, professional AI fitness and nutrition coach.
Your job is to have a natural conversation with the user to understand their needs. You MUST progress through the 3 phases strictly.

## PHASE 1: CORE QUESTIONS
Greet the user and ask these questions STRICTLY ONE AT A TIME in this exact order. 
1. Age
2. Height
3. Weight
4. Goal (BUILD_MUSCLE, LOSE_WEIGHT, STAY_FIT, or FLEXIBILITY)
5. Equipment (NO_EQUIPMENT or WITH_EQUIPMENT)
6. Medical problems or injuries
7. Focus Areas / Specific body parts (e.g., Chest, Biceps, Abs, Quads, Full Body)
8. Food preference (Veg or Non-Veg)

Wait for the user to answer the current question before asking the next. Do not repeat questions already answered.

## PHASE 2: SECRET TRIGGERS & FILLER QUESTIONS (BUYING TIME)
- When the user answers #7 (Focus Areas), your next reply MUST start with:
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

CRITICAL RULES:
- NEVER loop back to ask about Goal, Age, or Weight once you are in Phase 2.
- After the user answers Filler 4, DO NOT ask anything else. Output ONLY [PLAN_READY].
"""

def get_generation_system_prompt(valid_exercises: str) -> str:
    """Minimized prompt to save tokens."""
    return f"""You are a fitness plan generator. Output ONLY a valid 7-day JSON object.
    
    EXERCISES:
    - ONLY use names from this list: {valid_exercises}
    - Exactly 4 exercises per workout day.
    
    OUTPUT RULES:
    - ONLY valid JSON. No conversational text.
    - Meal names < 5 words.
    - Notes < 15 words.
    
    JSON: {{
      "diet_plan": {{ "day_1": {{ "breakfast": {{"meal": "...", "calories": 0}}, "lunch": {{...}}, "dinner": {{...}}, "snacks": {{...}} }}, ... }},
      "workout_plan": {{ "day_1": {{ "exercises": [{{"name": "NAME", "sets": 3, "reps": 12, "target_muscle": "..."}}], "duration_minutes": 45 }}, ... }},
      "daily_calories_target": 2000, "daily_water_liters": 2.5, "notes": "..."
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
                target_lower = f"{target.strip().lower()}.json"
                if target_lower in available_files:
                    filepath = os.path.join(equip_dir, available_files[target_lower])
                    with open(filepath, "r", encoding="utf-8") as f:
                        names = json.load(f)
                        all_names.extend(names)
                else:
                    print(f"[Chat] Warning: Target file {target} not found in {equip_dir}.")

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
    """Stage 2 API call."""
    print(f"[Chat] Stage 2: Generating plan with {len(valid_exercises.split(','))} exercises...")
    try:
        response = client_plan.chat.completions.create(
            model=_MODEL_NAME,
            messages=[
                {"role": "system", "content": get_generation_system_prompt(valid_exercises)},
                {"role": "user", "content": f"User Profile: {user_summary}"}
            ],
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        result = response.choices[0].message.content or ""
        print(f"[Chat] Stage 2 Result (first 200 chars): {result[:200]}")
        return result
    except Exception as e:
        print(f"[Chat] Stage 2 Error: {e}")
        return ""

def chat_with_coach(messages: list[dict], uid: str = "default_session") -> str:
    """Handels Stage 1 (Chat) and triggers Stage 2 (Generation) if [PLAN_READY] detected."""
    # Use the actual user ID to keep background generation safe for multiple users
    session_id = uid
            
    # Reset the session state if this is a brand new conversation (only the greeting or first msg)
    if session_id not in _session_store or len(messages) <= 2:
        print(f"[Chat] Initializing/Resetting session for {session_id}")
        _session_store[session_id] = {
            "filtered_exercises": "Pushups, Squats, Lunges", 
            "plan_json": None, 
            "filtering_done": False, 
            "plan_done": False
        }

    # Convert frontend format to OpenAI format
    cleaned: list[dict[str, str]] = []
    initial_greeting = None
    for msg in messages:
        role = "assistant" if msg["role"] == "model" else "user"
        content = msg["parts"][0]
        if initial_greeting is None and role == "assistant":
            initial_greeting = content
            continue
        cleaned.append({"role": role, "content": str(content)})

    # Regular chat call
    openai_messages: list[dict[str, str]] = [{"role": "system", "content": get_chat_system_prompt()}]
    if initial_greeting:
        openai_messages.append({"role": "user", "content": "Hello!"})
        openai_messages.append({"role": "assistant", "content": str(initial_greeting)})
    openai_messages.extend(cleaned[-30:])  # type: ignore # last 30 turns

    # CRITICAL FIX for "1 minute loading" on the first request:
    # OpenRouter API hangs if the very last message in the array is from the 'assistant'.
    # If the user just opened the chat (only the greeting is present), we inject a hidden 
    # user prompt to force the AI to ask the first assessment question instantly.
    if openai_messages and openai_messages[-1]["role"] == "assistant":
        openai_messages.append({"role": "user", "content": "I am ready, let's start!"})

    try:
        response = client.chat.completions.create(
            model=_MODEL_NAME,
            messages=openai_messages,
            temperature=0.7
        )
        ai_response = response.choices[0].message.content or ""
        
        # Background Trigger 1: START_FILTERING
        if "[START_FILTERING]" in ai_response:
            print(f"[Chat] Background Filtering Triggered for {session_id}...")
            goal = re.search(r"Goal:\s*([^,]+)", ai_response)
            equip = re.search(r"Equipment:\s*([^,]+)", ai_response)
            targets = re.search(r"Targets:\s*([^\n]+)", ai_response)
            
            g_str = goal.group(1).strip() if goal else "STAY_FIT"
            e_str = equip.group(1).strip() if equip else "NO_EQUIPMENT"
            t_list = [t.strip() for t in targets.group(1).split(",")] if targets else ["Full Body"]
            
            def filter_task():
                print(f"[Filter] Starting task for {session_id} targets: {t_list}")
                _session_store[session_id]["filtered_exercises"] = _get_filtered_exercises(g_str, e_str, t_list)
                _session_store[session_id]["filtering_done"] = True
                print(f"[Filter] Task COMPLETE for {session_id}. Data ready.")
                
            threading.Thread(target=filter_task).start()
            # Remove the secret tag so the user doesn't see it
            ai_response = re.sub(r"\[START_FILTERING\].*?(?:\n|$)", "", ai_response, count=1).strip()
            
        # Background Trigger 2: START_PLAN_GEN
        if "[START_PLAN_GEN]" in ai_response:
            print(f"[Chat] Background Plan Generation Triggered for {session_id}...")
            summary_match = re.search(r"Summary:\s*([^\n]+)", ai_response)
            summary_str = summary_match.group(1).strip() if summary_match else ai_response
            
            def generate_task():
                # Wait up to 60s for filtering to finish
                print(f"[Generator] Task started. Waiting for filtering_done for {session_id}...")
                for _ in range(120):
                    if _session_store[session_id]["filtering_done"]: break
                    time.sleep(0.5)
                
                valid_ex = str(_session_store[session_id].get("filtered_exercises", ""))
                print(f"[Generator] Wait over. Exercises ready: {len(valid_ex.split(','))} found. Calling Stage 2...")
                _session_store[session_id]["plan_json"] = _generate_plan(summary_str, valid_ex)
                _session_store[session_id]["plan_done"] = True
                print(f"[Generator] Task COMPLETE for {session_id}. Plan ready.")
                
            threading.Thread(target=generate_task).start()
            ai_response = re.sub(r"\[START_PLAN_GEN\].*?(?:\n|$)", "", ai_response, count=1).strip()

        # Final Trigger: PLAN_READY
        if "[PLAN_READY]" in ai_response:
            print(f"[Chat] PLAN_READY detected for {session_id}. Delivering plan...")
            # Give it up to 60 seconds (120 * 0.5s) to let the long generation finish,
            # especially if the user speeded through the filler questions!
            for _ in range(120):
                if _session_store[session_id].get("plan_done"): break
                time.sleep(0.5)
                
            plan_json = _session_store[session_id]["plan_json"]
            if plan_json:
                return f"Your personalized plan is completely ready! Here it is:\n\n```json\n{plan_json}\n```"
            else:
                return "I'm so sorry, I ran into an issue building your plan. Can we try verifying your goal again?"
            
        return ai_response
    except Exception as e:
        print(f"[Chat] API Error: {e}")
        return "I'm sorry, I'm having trouble connecting to my brain right now. Please try again soon!"

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
            raw = json_match.group(1)
            print(f"[Extract] Found JSON (first 200 chars): {raw[:200]}")
            plan = json.loads(raw)
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
