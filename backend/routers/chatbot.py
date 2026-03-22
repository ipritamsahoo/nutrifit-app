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
        response_text = chat_with_coach(gemini_messages)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")

    # Check if response contains a generated plan
    plan = extract_plan_from_response(response_text)
    plan_id = None

    if plan:
        # Auto-save the plan to Firestore
        try:
            plan_doc = {
                "uid": req.uid,
                "plan_type": "ai",
                "diet_json": plan.get("diet_plan", {}),
                "workout_json": plan.get("workout_plan", {}),
                "daily_calories_target": plan.get("daily_calories_target"),
                "daily_water_liters": plan.get("daily_water_liters"),
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
