from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from firebase_init import db
from gemini_service import generate_plan

router = APIRouter(tags=["Patient Workspace"])

class PlanRequest(BaseModel):
    """Body for POST /generate-plan (AI-assisted plan generation)."""
    uid: str = Field(..., description="Firebase Auth UID of the user")
    age: int = Field(..., ge=10, le=120, description="Age in years")
    weight: float = Field(..., gt=0, description="Weight in kg")
    height: float = Field(..., gt=0, description="Height in cm")
    goal: str = Field(..., description="Fitness goal")
    medical_conditions: str = Field(default="", description="Medical conditions (optional)")

class PlanResponse(BaseModel):
    """Successful response from POST /generate-plan."""
    message: str
    plan_id: str
    plan: dict

@router.post("/generate-plan", response_model=PlanResponse)
async def create_plan(req: PlanRequest):
    """
    Generate an AI-powered fitness plan.
    Used by: Outsider chatbot AND Doctor AI-assist feature.
    """
    # Save / update health profile
    try:
        db.collection("health_profiles").document(req.uid).set(
            {
                "uid": req.uid,
                "age": req.age,
                "weight": req.weight,
                "height": req.height,
                "goal": req.goal,
                "medical_conditions": req.medical_conditions,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save health profile: {e}")

    # Generate plan via Gemini
    try:
        plan = generate_plan(
            age=req.age,
            weight=req.weight,
            height=req.height,
            goal=req.goal,
            medical_conditions=req.medical_conditions,
        )
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini API call failed: {e}")

    # Save the plan to Firestore
    try:
        plan_doc = {
            "uid": req.uid,
            "plan_type": "ai",
            "diet_json": plan.get("diet_plan", {}),
            "workout_json": plan.get("workout_plan", {}),
            "daily_calories_target": plan.get("daily_calories_target"),
            "daily_water_liters": plan.get("daily_water_liters"),
            "notes": plan.get("notes", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _, doc_ref = db.collection("plans").add(plan_doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save plan: {e}")

    return PlanResponse(
        message="Plan generated and saved successfully!",
        plan_id=doc_ref.id,
        plan=plan,
    )

@router.post("/approve-plan/{plan_id}")
async def approve_plan(plan_id: str):
    """Mark a draft plan as approved so it appears in the workspace."""
    try:
        doc_ref = db.collection("plans").document(plan_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Plan not found.")
        doc_ref.update({"status": "approved"})
        return {"message": "Plan approved!", "plan_id": plan_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to approve plan: {e}")
