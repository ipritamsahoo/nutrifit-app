"""
main.py
=======
FastAPI application – the "Brain" of Nutrifit.
Refactored into feature-based modules.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import feature routers
from routers import chatbot, doctor_dashboard, patient_workspace, motion_tracking

# ── FastAPI App ──────────────────────────────────────────────────────
app = FastAPI(
    title="Nutrifit AI Backend",
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

# ── Include Feature Routers ──────────────────────────────────────────
# This isolates the backend code so each developer can work on a separate file
app.include_router(chatbot.router)
app.include_router(doctor_dashboard.router)
app.include_router(patient_workspace.router)
app.include_router(motion_tracking.router)

# ── GLobal ENDPOINTS ──────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Simple health-check to verify the server is running."""
    return {"status": "ok", "service": "Nutrifit AI Backend v2"}
