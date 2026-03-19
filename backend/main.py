"""
main.py
=======
FastAPI application – the "Brain" of NutriFit.

Endpoints:
  POST /generate-plan  → Accepts user metrics, calls Gemini, saves to Firestore,
                          and returns the structured JSON plan.
  GET  /health         → Simple health-check.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime, timezone

from gemini_service import generate_plan
from firebase_init import db

# ── FastAPI App ──────────────────────────────────────────────────────
app = FastAPI(
    title="NutriFit AI Backend",
    description="AI-powered fitness & diet plan generation using Google Gemini",
    version="1.0.0",
)

# ── CORS – allow the React dev server ────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # Fallback
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ────────────────────────────────────────
class PlanRequest(BaseModel):
    """Body for POST /generate-plan."""
    uid: str = Field(..., description="Firebase Auth UID of the user")
    age: int = Field(..., ge=10, le=120, description="Age in years")
    weight: float = Field(..., gt=0, description="Weight in kg")
    height: float = Field(..., gt=0, description="Height in cm")
    goal: str = Field(
        ...,
        description="Fitness goal, e.g. 'Lose Weight', 'Build Muscle', 'Stay Fit'",
    )
    medical_conditions: str = Field(
        default="",
        description="Any medical conditions or allergies (optional)",
    )


class PlanResponse(BaseModel):
    """Successful response from POST /generate-plan."""
    message: str
    plan_id: str
    plan: dict


# ── Endpoints ────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Simple health-check to verify the server is running."""
    return {"status": "ok", "service": "NutriFit AI Backend"}


@app.post("/generate-plan", response_model=PlanResponse)
async def create_plan(req: PlanRequest):
    """
    1. Accept user health metrics.
    2. Call Gemini API to generate a personalised plan.
    3. Save the plan to Firestore under the `plans` collection.
    4. Also save / update the user's health profile in `health_profiles`.
    5. Return the plan JSON.
    """

    # ── Step 1: Save / update the user's health profile ──────────
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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save health profile to Firestore: {e}",
        )

    # ── Step 2: Generate plan via Gemini ─────────────────────────
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
        raise HTTPException(
            status_code=500,
            detail=f"Gemini API call failed: {e}",
        )

    # ── Step 3: Save the plan to Firestore ───────────────────────
    try:
        plan_doc = {
            "uid": req.uid,
            "diet_json": plan.get("diet_plan", {}),
            "workout_json": plan.get("workout_plan", {}),
            "daily_calories_target": plan.get("daily_calories_target"),
            "daily_water_liters": plan.get("daily_water_liters"),
            "notes": plan.get("notes", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _, doc_ref = db.collection("plans").add(plan_doc)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save plan to Firestore: {e}",
        )

    return PlanResponse(
        message="Plan generated and saved successfully!",
        plan_id=doc_ref.id,
        plan=plan,
    )
