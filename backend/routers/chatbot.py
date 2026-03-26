from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List
from datetime import datetime, timezone
from firebase_init import db
from chat_service import chat_with_coach, extract_plan_from_response

router = APIRouter(tags=["Chatbot"])

class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'model'")
    text: str = Field(..., description="Message content")

class ChatRequest(BaseModel):
    uid: str = Field(..., description="Firebase Auth UID of the outsider")
    messages: List[ChatMessage] = Field(..., description="Conversation history")

@router.post("/chat")
async def chat_endpoint(req: ChatRequest):
    """
    Multi-turn conversational AI chatbot for outsiders.
    Sends conversation history to Gemini and returns the response.
    If a plan is detected in the response, it auto-saves to Firestore.
    """

    # Convert messages to Gemini format
    gemini_messages = []
    for msg in req.messages:
        gemini_messages.append({
            "role": msg.role,
            "parts": [msg.text],
        })

    # Get response from Gemini
    try:
        response_text = chat_with_coach(gemini_messages, uid=req.uid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")

    # Check if response contains a generated plan
    plan = extract_plan_from_response(response_text)
    plan_id = None

    if plan:
        # Auto-save the plan to Firestore
        try:
            # Detect V2 vs Legacy Schema
            is_v2 = "sched" in plan and "tpl" in plan
            
            if is_v2:
                diet_json = plan.get("diet", {})
                workout_json = {
                    "sched": plan.get("sched", []),
                    "tpl": plan.get("tpl", {})
                }
                # V2 stores calories/water inside the diet block
                calories = diet_json.get("cal") or plan.get("daily_calories_target")
                water = (diet_json.get("water_ml") / 1000) if diet_json.get("water_ml") else plan.get("daily_water_liters")
            else:
                diet_json = plan.get("diet_plan", {})
                workout_json = plan.get("workout_plan", {})
                calories = plan.get("daily_calories_target")
                water = plan.get("daily_water_liters")

            plan_doc = {
                "uid": req.uid,
                "plan_type": "ai",
                "diet_json": diet_json,
                "workout_json": workout_json,
                "daily_calories_target": calories,
                "daily_water_liters": water,
                "notes": plan.get("notes", ""),
                "status": "draft",  # outsider needs to approve
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            _, doc_ref = db.collection("plans").add(plan_doc)
            plan_id = doc_ref.id
        except Exception as e:
            print(f"[Chat] Failed to save plan: {e}")

    return {
        "response": response_text,
        "plan_detected": plan is not None,
        "plan": plan,
        "plan_id": plan_id,
    }
