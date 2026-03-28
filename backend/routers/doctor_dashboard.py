from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
from firebase_admin import auth as firebase_auth
from firebase_init import db

router = APIRouter(tags=["Doctor Dashboard"])


class CreateInsiderRequest(BaseModel):
    """Doctor creates a patient (insider) account."""
    doctor_uid: str = Field(..., description="UID of the doctor creating the patient")
    patient_name: str = Field(..., description="Full name of the patient")
    patient_email: str = Field(..., description="Email for the patient account")
    patient_password: str = Field(..., min_length=6, description="Password for the patient account")


class PrescriptionRequest(BaseModel):
    """Doctor manually assigns a prescription to a patient."""
    doctor_uid: str = Field(..., description="UID of the doctor")
    patient_uid: str = Field(..., description="UID of the patient")
    diet_json: dict = Field(default={}, description="Diet plan JSON")
    workout_json: dict = Field(default={}, description="Workout plan JSON")
    daily_calories_target: Optional[int] = None
    daily_water_liters: Optional[float] = None
    notes: str = Field(default="", description="Doctor's notes")


@router.post("/create-insider")
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


@router.post("/assign-prescription")
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

@router.get("/check-email")
async def check_email(email: str):
    """
    Check if a user account already exists in Firebase Auth for a given email.
    """
    if not email:
        return {"exists": False}
    try:
        firebase_auth.get_user_by_email(email)
        return {"exists": True}
    except firebase_auth.UserNotFoundError:
        return {"exists": False}
    except Exception as e:
        print(f"[Check Email] Error: {e}")
        # Return false on other errors so it doesn't block UI wrongly,
        # but let the final check catch real issues
        return {"exists": False}
