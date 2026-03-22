# Nutrifit App - Developer Collaboration Guide

Welcome to the Nutrifit app! To allow multiple developers to work simultaneously without Git conflicts, this project is divided into strictly isolated **Feature Modules**.

Each developer should work *only* within their assigned feature folder on the frontend and their specific router on the backend.

## 🏗️ Modules Breakdown

### 1. Auth Module
Handles user login, signup, and onboarding forms.
- **Frontend:** `frontend/src/features/auth/`
- **Backend:** Authentication functions are primarily tied to Firebase configuration, but related user creation is in `backend/routers/doctor_dashboard.py`.

### 2. Patient Workspace Module
Handles the Insider (Patient) Workspace and displaying their AI plans.
- **Frontend:** `frontend/src/features/patient-workspace/`
- **Backend:** `backend/routers/patient_workspace.py`

### 3. Outsider Workspace Module
Handles the tailored workspace for users without accounts (after they finish chatting with the AI).
- **Frontend:** `frontend/src/features/outsider-workspace/`
- **Backend:** `backend/routers/patient_workspace.py` (shares reading endpoints with patients)

### 4. Doctor Dashboard Module
Handles the Doctor interface to assign prescriptions and view user logs.
- **Frontend:** `frontend/src/features/doctor-dashboard/`
- **Backend:** `backend/routers/doctor_dashboard.py`

### 3. Chatbot Module
Handles the AI-powered conversation interface for outsiders (users who haven't logged in yet).
- **Frontend:** `frontend/src/features/chatbot/`
- **Backend:** `backend/routers/chatbot.py`

### 4. Camera & Motion Tracking Module
Handles the real-time pose tracking via webcam, exercise analytics, and fetching exercise GIFs from external APIs.
- **Frontend:** `frontend/src/features/camera/`
- **Backend:** `backend/routers/motion_tracking.py`

---

## 🤖 How to Prompt AI (Antigravity) for Development

If you are using an AI assistant (like Antigravity, Cursor, etc.) to write code, **you MUST tell the AI exactly where your boundary is** so it doesn't accidentally modify other developers' files (like `App.jsx` or `main.py`).

Copy and paste the corresponding text below when you start a new conversation with the AI:

### 👉 If you are working on the Auth Module:
> "Hi Antigravity, I am working on the Auth module. Whenever you write or modify code for me, **you must ONLY use files inside `frontend/src/features/auth/`**. Please do not modify `App.jsx`, `backend/main.py`, or any other feature's folders without asking me first."

### 👉 If you are working on the Patient Workspace Module:
> "Hi Antigravity, I am working on the Patient Workspace module. Whenever you write or modify code for me, **you must ONLY use files inside `frontend/src/features/patient-workspace/` and the backend router `backend/routers/patient_workspace.py`**. Please do not modify `App.jsx`, `main.py`, or any other feature's folders without asking me first."

### 👉 If you are working on the Outsider Workspace Module:
> "Hi Antigravity, I am working on the Outsider Workspace module. Whenever you write or modify code for me, **you must ONLY use files inside `frontend/src/features/outsider-workspace/`**. Please do not modify `App.jsx`, `main.py`, or any other feature's folders without asking me first."

### 👉 If you are working on the Doctor Dashboard Module:
> "Hi Antigravity, I am working on the Doctor Dashboard module. Whenever you write or modify code for me, **you must ONLY use files inside `frontend/src/features/doctor-dashboard/` and the backend router `backend/routers/doctor_dashboard.py`**. Please do not modify `App.jsx`, `main.py`, or any other feature's folders without asking me first."

### 👉 If you are working on the Chatbot Module:
> "Hi Antigravity, I am working on the Chatbot module. Whenever you write or modify code for me, **you must ONLY use files inside `frontend/src/features/chatbot/` and `backend/routers/chatbot.py`**. Please do not modify `App.jsx`, `main.py`, or any other feature's folders without asking me first."

### 👉 If you are working on the Camera Module:
> "Hi Antigravity, I am working on the Camera and motion tracking module. Whenever you write or modify code for me, **you must ONLY use files inside `frontend/src/features/camera/` and `backend/routers/motion_tracking.py`**. Please do not modify `App.jsx`, `main.py`, or any other feature's folders without asking me first."
