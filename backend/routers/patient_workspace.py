from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timezone

from firebase_init import db
import ai_service
import diet_service

router = APIRouter(tags=["Patient Workspace"])

class PlanRequest(BaseModel):
    """Body for POST /generate-plan (AI-assisted or deterministic generation)."""
    uid: str = Field(..., description="Firebase Auth UID of the user")
    age: int = Field(..., ge=10, le=120, description="Age in years")
    weight: float = Field(..., gt=0, description="Weight in kg")
    height: float = Field(..., gt=0, description="Height in cm")
    goal: str = Field(..., description="Fitness goal")
    medical_conditions: str = Field(default="", description="Medical conditions (optional)")
    gender: str = Field(default="Male", description="Patient gender")
    food_preference: str = Field(default="Veg", description="Dietary preference")
    restrictions: str = Field(default="", description="Food restrictions")
    activity_level: str = Field(default="Moderate", description="Activity level")
    meals_per_day: int = Field(default=3, description="Meals per day")
    plan_mode: Optional[str] = Field(default="ai", description="Generation mode: 'ai' or 'deterministic_diet'")
    plan_type: Optional[str] = Field(default="both", description="Type of plan: 'diet', 'exercise', or 'both'")
    
    # Workout Specifics (from Doctor Dashboard)
    workout_goal: Optional[str] = Field(default=None)
    equipment: Optional[str] = Field(default=None)
    target_areas: Optional[List[str]] = Field(default_factory=list)
    fitness_level: Optional[str] = Field(default=None)
    workout_days: Optional[str] = Field(default=None)
    session_time: Optional[str] = Field(default=None)
    injuries: Optional[List[str]] = Field(default_factory=list)
    intensity: Optional[str] = Field(default=None)

class PlanResponse(BaseModel):
    """Successful response from POST /generate-plan."""
    message: str = Field(..., description="Success message")
    plan_id: str = Field(..., description="ID of the saved plan")
    plan: dict = Field(..., description="The generated plan JSON")

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

    # Phase 2: Generate plan
    try:
        if req.plan_mode == "deterministic_diet":
            # Use local deterministic logic
            plan = diet_service.generate_deterministic_diet({
                "age": req.age,
                "gender": req.gender,
                "weight": req.weight,
                "height": req.height,
                "goal": req.goal,
                "disease": req.medical_conditions,
                "preference": req.food_preference,
                "restrictions": req.restrictions,
                "activity": req.activity_level,
                "meals": req.meals_per_day
            })
        else:
            # Generate plan via local AI service abstraction
            plan = ai_service.generate_plan(
                age=req.age,
                weight=req.weight,
                height=req.height,
                goal=req.goal,
                medical_conditions=req.medical_conditions,
                diet_preference=req.food_preference,
                # New Workout Specifics
                workout_goal=req.workout_goal,
                equipment=req.equipment,
                target_areas=req.target_areas,
                fitness_level=req.fitness_level,
                workout_days=req.workout_days,
                session_time=req.session_time,
                injuries=req.injuries,
                intensity=req.intensity
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Plan generation failed: {e}")

    # Phase 3: Normalize and save the plan to Firestore
    try:
        # ai_service returns {"profile_hash": ..., "plan": {...}} 
        # while diet_service returns a flat object.
        inner_plan = plan.get("plan", plan)
        is_v2 = inner_plan.get("schema_version") == 2

        if is_v2:
            diet_json = inner_plan.get("diet", {})
            workout_json = {
                "sched": inner_plan.get("sched", []),
                "tpl": inner_plan.get("tpl", {})
            }
            calories = diet_json.get("cal")
            water = (diet_json.get("water_ml", 0) / 1000.0) if diet_json.get("water_ml") else None
        else:
            diet_json = inner_plan.get("diet_plan", {})
            workout_json = inner_plan.get("workout_plan", {})
            calories = inner_plan.get("daily_calories_target")
            water = inner_plan.get("daily_water_liters")

        plan_doc = {
            "uid": req.uid,
            "plan_type": "deterministic" if req.plan_mode == "deterministic_diet" else "ai",
            "diet_json": diet_json,
            "workout_json": workout_json,
            "daily_calories_target": calories,
            "daily_water_liters": water,
            "notes": inner_plan.get("notes", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _, doc_ref = db.collection("plans").add(plan_doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save plan: {e}")

    return {
        "message": "Plan generated and saved successfully!",
        "plan_id": str(doc_ref.id),
        "plan": inner_plan,
    }

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
