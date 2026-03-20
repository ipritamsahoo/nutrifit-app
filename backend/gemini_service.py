"""
gemini_service.py
=================
Encapsulates all Google Gemini API logic.

- Builds a structured prompt from user health metrics.
- Calls Gemini and parses the JSON response.
- Returns a Python dict ready to be saved to Firestore.
"""

import os
import json
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

_MODEL_NAME = "google/gemma-3n-e4b-it"

client = OpenAI(
  base_url="https://integrate.api.nvidia.com/v1",
  api_key=os.getenv("NVIDIA_API_KEY")
)


def _build_prompt(age: int, weight: float, height: float, goal: str, medical_conditions: str = "") -> str:
    """
    Build the prompt that instructs Gemini to return a structured JSON
    containing a 7-day diet plan and a list of trackable exercises.
    Exercise names should match common Wger API exercise names.
    """
    return f"""
You are a certified fitness and nutrition expert AI.

Given the following user profile, generate a COMPLETE and PERSONALIZED 7-day
fitness plan in **valid JSON only** (no markdown, no explanation, no extra text).

### User Profile
- Age: {age}
- Weight: {weight} kg
- Height: {height} cm
- Goal: {goal}
- Medical Conditions / Allergies: {medical_conditions if medical_conditions else "None"}

### Required JSON Structure
{{
  "diet_plan": {{
    "day_1": {{
      "breakfast": {{ "meal": "...", "calories": 000 }},
      "lunch":     {{ "meal": "...", "calories": 000 }},
      "dinner":    {{ "meal": "...", "calories": 000 }},
      "snacks":    {{ "meal": "...", "calories": 000 }}
    }},
    ... (repeat for day_2 through day_7)
  }},
  "workout_plan": {{
    "day_1": {{
      "exercises": [
        {{
          "name": "Squats",
          "sets": 3,
          "reps": 12,
          "target_muscle": "Quadriceps",
          "rest_seconds": 60
        }}
      ],
      "duration_minutes": 45
    }},
    ... (repeat for day_2 through day_7)
  }},
  "daily_calories_target": 0000,
  "daily_water_liters": 0.0,
  "notes": "Any important advice for this user."
}}

### Rules
1. Each day MUST have breakfast, lunch, dinner, and snacks.
2. Exercise names MUST use standard names that match the Wger exercise database
   (e.g. "Squats", "Bicep Curls", "Bench Press", "Deadlift", "Lunges",
    "Plank", "Push-ups", "Pull-ups", "Shoulder Press", "Lat Pulldown").
3. Tailor exercise intensity and diet to the user's goal and medical conditions.
4. Return ONLY the JSON object – no markdown fences, no extra commentary.
"""


def generate_plan(age: int, weight: float, height: float, goal: str, medical_conditions: str = "") -> dict:
    """
    Call Gemini API and return the parsed plan as a Python dict.

    Raises ValueError if the response cannot be parsed as JSON.
    """
    prompt = _build_prompt(age, weight, height, goal, medical_conditions)

    try:
        response = client.chat.completions.create(
            model=_MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2048
        )
        raw_text = response.choices[0].message.content.strip()
    except Exception as e:
        raise ValueError(f"OpenAI API call failed: {e}")

    # Strip markdown code fences if Gemini wraps the output
    raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
    raw_text = re.sub(r"\s*```$", "", raw_text)

    try:
        plan = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Gemini returned invalid JSON. Parse error: {e}\n\nRaw response:\n{raw_text[:500]}"
        )

    return plan
