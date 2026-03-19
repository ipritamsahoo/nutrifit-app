"""
firebase_init.py
================
Initialises Firebase Admin SDK using a service-account JSON key.
Exports `db` – the Firestore client used by the rest of the backend.
"""

import os
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

load_dotenv()

_SERVICE_ACCOUNT_PATH = os.getenv(
    "FIREBASE_SERVICE_ACCOUNT_PATH", "./serviceAccountKey.json"
)

# Initialise once – guard against repeated calls during hot-reload
if not firebase_admin._apps:
    cred = credentials.Certificate(_SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()
