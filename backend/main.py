"""
main.py
=======
FastAPI application – the "Brain" of HonFit.

Endpoints:
  POST /create-insider     → Doctor creates a patient account (Firebase Admin SDK)
  POST /generate-plan      → Generate AI plan via Gemini (used by chatbot & doctor AI assist)
  POST /assign-prescription→ Doctor manually assigns diet/workout to a patient
  POST /chat               → Conversational AI chatbot for outsiders
  GET  /exercises          → Fetch exercises from Wger API
  GET  /health             → Simple health-check.
"""

from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone

from firebase_admin import auth as firebase_auth
from gemini_service import generate_plan
from chat_service import chat_with_coach, extract_plan_from_response
from firebase_init import db

import httpx
import os

# ── FastAPI App ──────────────────────────────────────────────────────
app = FastAPI(
    title="HonFit AI Backend",
    description="AI-powered fitness & diet plan generation + Doctor admin tools",
    version="2.0.0",
)

# ── CORS – allow the React dev server ────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "https://localhost:5173",  # HTTPS Vite dev server
        "http://localhost:3000",   # Fallback
        "http://127.0.0.1:5173",
        "https://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Wger API Config ──────────────────────────────────────────────────
WGER_API_BASE = "https://wger.de/api/v2"
WGER_API_KEY = os.getenv("WGER_API_KEY", "")

# ── ExerciseDB (RapidAPI) Config ─────────────────────────────────────
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
EXERCISEDB_HOST = "exercisedb.p.rapidapi.com"


# ══════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ══════════════════════════════════════════════════════════════════════

class CreateInsiderRequest(BaseModel):
    """Doctor creates a patient (insider) account."""
    doctor_uid: str = Field(..., description="UID of the doctor creating the patient")
    patient_name: str = Field(..., description="Full name of the patient")
    patient_email: str = Field(..., description="Email for the patient account")
    patient_password: str = Field(..., min_length=6, description="Password for the patient account")


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


class PrescriptionRequest(BaseModel):
    """Doctor manually assigns a prescription to a patient."""
    doctor_uid: str = Field(..., description="UID of the doctor")
    patient_uid: str = Field(..., description="UID of the patient")
    diet_json: dict = Field(default={}, description="Diet plan JSON")
    workout_json: dict = Field(default={}, description="Workout plan JSON")
    daily_calories_target: Optional[int] = None
    daily_water_liters: Optional[float] = None
    notes: str = Field(default="", description="Doctor's notes")


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'model'")
    text: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    """Body for POST /chat."""
    uid: str = Field(..., description="Firebase Auth UID of the outsider")
    messages: List[ChatMessage] = Field(..., description="Conversation history")


# ══════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """Simple health-check to verify the server is running."""
    return {"status": "ok", "service": "HonFit AI Backend v2"}


# ── 1. CREATE INSIDER (Doctor creates patient account) ───────────────
@app.post("/create-insider")
async def create_insider(req: CreateInsiderRequest):
    """
    Doctor creates a new patient account using Firebase Admin SDK.
    1. Verify the requester is actually a doctor.
    2. Create Firebase Auth user.
    3. Create Firestore user doc with role='insider' + doctor_id link.
    """

    # Step 1: Verify doctor role
    try:
        doctor_doc = db.collection("users").document(req.doctor_uid).get()
        if not doctor_doc.exists or doctor_doc.to_dict().get("role") != "doctor":
            raise HTTPException(status_code=403, detail="Only doctors can create patient accounts.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify doctor role: {e}")

    # Step 2: Create Firebase Auth user
    try:
        user_record = firebase_auth.create_user(
            email=req.patient_email,
            password=req.patient_password,
            display_name=req.patient_name,
        )
    except firebase_auth.EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create auth user: {e}")

    # Step 3: Create Firestore user document
    try:
        user_doc = {
            "uid": user_record.uid,
            "name": req.patient_name,
            "email": req.patient_email,
            "role": "insider",
            "doctor_id": req.doctor_uid,
            "bio": "",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        db.collection("users").document(user_record.uid).set(user_doc)
    except Exception as e:
        # Rollback: delete the auth user if Firestore write fails
        try:
            firebase_auth.delete_user(user_record.uid)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to create user document: {e}")

    return {
        "message": "Patient account created successfully!",
        "patient_uid": user_record.uid,
        "patient_email": req.patient_email,
        "patient_name": req.patient_name,
    }


# ── 2. GENERATE AI PLAN (for chatbot & doctor AI assist) ────────────
@app.post("/generate-plan", response_model=PlanResponse)
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


# ── 3. ASSIGN PRESCRIPTION (Doctor manually sets plan) ───────────────
@app.post("/assign-prescription")
async def assign_prescription(req: PrescriptionRequest):
    """
    Doctor manually assigns a diet/workout plan to a patient.
    """

    # Verify doctor role
    try:
        doctor_doc = db.collection("users").document(req.doctor_uid).get()
        if not doctor_doc.exists or doctor_doc.to_dict().get("role") != "doctor":
            raise HTTPException(status_code=403, detail="Only doctors can assign prescriptions.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify doctor: {e}")

    # Verify patient exists and belongs to this doctor
    try:
        patient_doc = db.collection("users").document(req.patient_uid).get()
        if not patient_doc.exists:
            raise HTTPException(status_code=404, detail="Patient not found.")
        patient_data = patient_doc.to_dict()
        if patient_data.get("doctor_id") != req.doctor_uid:
            raise HTTPException(status_code=403, detail="This patient is not assigned to you.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify patient: {e}")

    # Save prescription as a plan
    try:
        plan_doc = {
            "uid": req.patient_uid,
            "plan_type": "manual",
            "prescribed_by": req.doctor_uid,
            "diet_json": req.diet_json,
            "workout_json": req.workout_json,
            "daily_calories_target": req.daily_calories_target,
            "daily_water_liters": req.daily_water_liters,
            "notes": req.notes,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        _, doc_ref = db.collection("plans").add(plan_doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save prescription: {e}")

    return {
        "message": "Prescription assigned successfully!",
        "plan_id": doc_ref.id,
    }


# ── 4. WGER EXERCISES (fetch exercise data) ─────────────────────────
@app.get("/exercises")
async def get_exercises(limit: int = 20, offset: int = 0, language: int = 2):
    """
    Fetch exercises from the Wger API.
    language=2 is English.
    """
    try:
        headers = {}
        if WGER_API_KEY:
            headers["Authorization"] = f"Token {WGER_API_KEY}"

        async with httpx.AsyncClient() as client:
            # Get exercises with images
            resp = await client.get(
                f"{WGER_API_BASE}/exercise/",
                params={
                    "format": "json",
                    "limit": limit,
                    "offset": offset,
                    "language": language,
                    "status": 2,  # approved exercises only
                },
                headers=headers,
                timeout=15.0,
            )
            resp.raise_for_status()
            exercises = resp.json()

        return exercises

    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Wger API error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch exercises: {e}")


@app.get("/search-exercise")
async def search_exercise(term: str):
    """Search Wger for an exercise by name to get its image/id."""
    try:
        headers = {}
        if WGER_API_KEY:
            headers["Authorization"] = f"Token {WGER_API_KEY}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{WGER_API_BASE}/exercise/search/",
                params={"term": term, "language": "en"},
                headers=headers,
                timeout=15.0,
            )
            resp.raise_for_status()

        return resp.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search exercise: {e}")


@app.get("/exercise-images/{exercise_id}")
async def get_exercise_images(exercise_id: int):
    """Fetch images/animations for a specific exercise from Wger."""
    try:
        headers = {}
        if WGER_API_KEY:
            headers["Authorization"] = f"Token {WGER_API_KEY}"

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{WGER_API_BASE}/exerciseimage/",
                params={"format": "json", "exercise_base": exercise_id, "limit": 10},
                headers=headers,
                timeout=15.0,
            )
            resp.raise_for_status()

        return resp.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch exercise images: {e}")


# ── 5. CHAT (Conversational AI for outsiders) ───────────────────────
@app.post("/chat")
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


# ── 6. APPROVE PLAN (Outsider approves chatbot plan) ────────────────
@app.post("/approve-plan/{plan_id}")
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


# ── 7. EXERCISE GIF (ExerciseDB via RapidAPI) ───────────────────────
@app.get("/exercise-gif")
async def get_exercise_gif(name: str):
    """
    Search ExerciseDB for an exercise by name and return its exercise ID.
    The frontend uses this ID with /exercise-gif-image/{id} to show the GIF.
    """
    if not RAPIDAPI_KEY:
        return {"exercise_id": None, "error": "RAPIDAPI_KEY not configured"}

    try:
        # Normalize: lowercase, remove hyphens, strip trailing 's' for plurals
        search_name = name.strip().lower().replace("-", " ")
        # Try without trailing 's' (Push-ups → push up, Squats → squat)
        alt_name = search_name.rstrip("s").strip() if search_name.endswith("s") else None
        # Word-by-word fallback: try the last significant word (e.g., "Dumbbell Rows" → "row")
        words = search_name.split()
        last_word = words[-1].rstrip("s") if words else None

        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": EXERCISEDB_HOST,
        }

        async with httpx.AsyncClient() as client:
            # Attempt 1: Full name
            resp = await client.get(
                f"https://{EXERCISEDB_HOST}/exercises/name/{search_name}",
                headers=headers, timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()

            # Attempt 2: Without trailing 's'
            if (not data or len(data) == 0) and alt_name and alt_name != search_name:
                resp = await client.get(
                    f"https://{EXERCISEDB_HOST}/exercises/name/{alt_name}",
                    headers=headers, timeout=15.0,
                )
                resp.raise_for_status()
                data = resp.json()

            # Attempt 3: Last word only (e.g., "dumbbell rows" → "row")
            if (not data or len(data) == 0) and last_word and last_word != search_name and last_word != alt_name:
                resp = await client.get(
                    f"https://{EXERCISEDB_HOST}/exercises/name/{last_word}",
                    headers=headers, timeout=15.0,
                )
                resp.raise_for_status()
                data = resp.json()

        if data and len(data) > 0:
            exercise_id = data[0].get("id")
            return {"exercise_id": exercise_id}

        return {"exercise_id": None}

    except httpx.HTTPStatusError as e:
        print(f"[ExerciseGIF] Search API error: {e.response.status_code}")
        return {"exercise_id": None}
    except Exception as e:
        print(f"[ExerciseGIF] Error: {e}")
        return {"exercise_id": None}


@app.get("/exercise-gif-image/{exercise_id}")
async def get_exercise_gif_image(exercise_id: str):
    """
    Proxy the animated GIF from ExerciseDB so the frontend can use it
    in an <img> tag without needing API keys.
    """
    if not RAPIDAPI_KEY:
        raise HTTPException(status_code=503, detail="RAPIDAPI_KEY not configured")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://{EXERCISEDB_HOST}/image",
                params={"exerciseId": exercise_id, "resolution": "360"},
                headers={
                    "X-RapidAPI-Key": RAPIDAPI_KEY,
                    "X-RapidAPI-Host": EXERCISEDB_HOST,
                },
                timeout=30.0,
            )
            resp.raise_for_status()

        return StreamingResponse(
            iter([resp.content]),
            media_type="image/gif",
            headers={"Cache-Control": "public, max-age=86400"},  # Cache for 24h
        )

    except Exception as e:
        print(f"[ExerciseGIF] Image proxy error: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch exercise GIF")
