"""
chat_service.py
================
Conversational AI service for the Virtual Coach chatbot.
Uses Gemini to have multi-turn conversations with outsiders,
collect their info, and generate personalized fitness plans.
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

SYSTEM_PROMPT = """You are HonFit Virtual Coach — a friendly, professional AI fitness and nutrition coach.

Your job is to have a natural conversation with the user to understand their fitness goals and create a personalized plan.

## Conversation Flow:
1. **Greet** the user warmly and ask about their fitness goals.
2. **Collect info** through natural conversation (don't ask all at once):
   - Age
   - Weight (kg)
   - Height (cm)
   - Fitness goal (Lose Weight / Build Muscle / Stay Fit / Improve Flexibility)
   - Any medical conditions or allergies
   - Exercise preferences
   - Dietary preferences or restrictions
3. **Generate a plan** when you have enough info. When ready, respond with a special JSON block.

## Rules:
- Be encouraging, motivational, and empathetic.
- Ask ONE or TWO questions at a time, not all at once.
- Use emojis sparingly to keep it friendly.
- If the user wants to modify something, adjust accordingly.
- When you have enough information to create a complete plan, include the plan in your response using this EXACT format:

```json
{PLAN_JSON_HERE}
```

The JSON must follow this structure:
{
  "diet_plan": {
    "day_1": { "breakfast": {"meal": "...", "calories": 000}, "lunch": {...}, "dinner": {...}, "snacks": {...} },
    ... (day_1 through day_7)
  },
  "workout_plan": {
    "day_1": { "exercises": [{"name": "Squats", "sets": 3, "reps": 12, "target_muscle": "Quadriceps"}], "duration_minutes": 45 },
    ... (day_1 through day_7)
  },
  "daily_calories_target": 2000,
  "daily_water_liters": 2.5,
  "notes": "Important advice"
}

Exercise names must use standard names: Squats, Bicep Curls, Bench Press, Deadlift, Lunges, Plank, Push-ups, Pull-ups, Shoulder Press, Lat Pulldown, etc.

CRITICAL INSTRUCTIONS FOR JSON GENERATION:
1. You MUST include BOTH the `"diet_plan"` AND the `"workout_plan"` in the JSON. Never omit the workout_plan.
2. Ensure the JSON is 100% valid with no missing commas or brackets.
3. Only generate the plan JSON when you have gathered enough information. Before that, just have a natural conversation.
"""


def chat_with_coach(messages: list[dict]) -> str:
    """
    Send conversation history to OpenAI-compatible endpoint and get a response.
    
    messages: list of {"role": "user"|"model", "parts": ["text"]} (from frontend)
    Returns: assistant's response text
    """
    cleaned = []
    initial_greeting = None
    for msg in messages:
        role = "assistant" if msg["role"] == "model" else "user"
        content = msg["parts"][0]
        # Capture the first assistant message (hardcoded greeting from frontend)
        if initial_greeting is None and role == "assistant":
            initial_greeting = content
            continue
        cleaned.append({"role": role, "content": content})

    if not cleaned:
        # No real messages yet — just say hello
        response = client.chat.completions.create(
            model=_MODEL_NAME,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "Hello! I'm looking for fitness advice."}
            ],
            temperature=0.7,
            max_tokens=4096
        )
        return response.choices[0].message.content

    # Build the message list for the API.
    # The API requires strict user/assistant alternation starting with user.
    # If we have an initial greeting from the frontend, insert a synthetic
    # user opener ("Hello!") before the greeting so:
    #   system → user("Hello!") → assistant(greeting) → user(actual msg) → ...
    # This way the AI sees its own greeting as a real turn and won't re-greet.
    openai_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if initial_greeting:
        openai_messages.append({"role": "user", "content": "Hello!"})
        openai_messages.append({"role": "assistant", "content": initial_greeting})
    openai_messages.extend(cleaned)

    try:
        response = client.chat.completions.create(
            model=_MODEL_NAME,
            messages=openai_messages,
            temperature=0.7,
            max_tokens=4096
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"[Chat] Chat API error: {e}")
        raise ValueError(f"Chat failed: {e}")


def extract_plan_from_response(text: str) -> dict | None:
    """
    Check if the chatbot response contains a plan JSON block.
    Returns the parsed plan dict or None.
    """
    # Look for JSON block in markdown code fence
    json_match = re.search(r'```json\s*(\{[\s\S]*?\})\s*```', text)
    if json_match:
        try:
            plan = json.loads(json_match.group(1))
            # Verify it has the expected keys
            if "diet_plan" in plan and "workout_plan" in plan:
                return plan
        except json.JSONDecodeError:
            pass
    
    # Also try to find raw JSON block
    json_match = re.search(r'(\{[\s\S]*"diet_plan"[\s\S]*"workout_plan"[\s\S]*\})', text)
    if json_match:
        try:
            plan = json.loads(json_match.group(1))
            if "diet_plan" in plan and "workout_plan" in plan:
                return plan
        except json.JSONDecodeError:
            pass

    return None
