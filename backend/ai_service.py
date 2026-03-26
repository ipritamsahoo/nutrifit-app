"""
ai_service.py
=================
Compact workout template generation for the hackathon demo.
"""

import hashlib
import json
import os
import re
from math import gcd
from typing import Any, List, Dict, Optional, Set, Union, cast

from dotenv import load_dotenv
from openai import OpenAI

from exercise_utils import coerce_valid_exercise_name

load_dotenv()

_MODEL_NAME = "google/gemma-3n-e4b-it"
_API_KEY = os.getenv("NVIDIA_API_KEY")

if not _API_KEY:
    print("[AI Service] WARNING: NVIDIA_API_KEY not found in environment!")
    _API_KEY = "nvapi-missing"

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=_API_KEY,
    timeout=5.0,
)

_TEMPLATE_SEQUENCE = (
    ("A1", "A", 0),
    ("B1", "B", 0),
    ("A2", "A", 1),
    ("B2", "B", 1),
    ("A3", "A", 2),
    ("B3", "B", 2),
    ("A4", "A", 3),
)

FIXED_SCHEDULE = [template_key for template_key, _, _ in _TEMPLATE_SEQUENCE]

_CALORIE_TARGETS = {
    "BUILD_MUSCLE": 2600,
    "LOSE_WEIGHT": 1800,
    "STAY_FIT": 2200,
    "FLEXIBILITY": 2000,
}

_MEAL_SLOTS = ("breakfast", "lunch", "snack", "dinner")

_MEAL_LIBRARY = {
    "VEG": {
        "breakfast": [
            {"id": "veg_protein_oats", "name": "Protein Oats", "cal": 430, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_paneer_toast", "name": "Paneer Toast", "cal": 400, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_moong_chilla", "name": "Moong Chilla", "cal": 350, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sugar"]},
            {"id": "veg_yogurt_parfait", "name": "Yogurt Parfait", "cal": 320, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_poha_peanuts", "name": "Poha Peanuts", "cal": 340, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle"]},
            {"id": "veg_besan_cheela", "name": "Besan Cheela", "cal": 360, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar"]},
            {"id": "veg_tofu_scramble", "name": "Tofu Scramble", "cal": 390, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_idli_sambar", "name": "Idli Sambar", "cal": 330, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_peanut_smoothie", "name": "Peanut Smoothie", "cal": 460, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_sprout_bowl", "name": "Sprout Bowl", "cal": 300, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar", "gentle"]},
        ],
        "lunch": [
            {"id": "veg_paneer_rice", "name": "Paneer Rice", "cal": 650, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_dal_roti", "name": "Dal Roti", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_rajma_rice", "name": "Rajma Rice", "cal": 580, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_tofu_quinoa", "name": "Tofu Quinoa", "cal": 560, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar", "high_protein"]},
            {"id": "veg_chickpea_salad", "name": "Chickpea Salad", "cal": 430, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["low_sugar", "low_sodium"]},
            {"id": "veg_veg_khichdi", "name": "Veg Khichdi", "cal": 480, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_paneer_wrap", "name": "Paneer Wrap", "cal": 540, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_soya_pulao", "name": "Soya Pulao", "cal": 610, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_curd_rice", "name": "Curd Rice", "cal": 450, "goals": ["FLEXIBILITY", "LOSE_WEIGHT", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "veg_lentil_bowl", "name": "Lentil Bowl", "cal": 500, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar", "low_sodium"]},
        ],
        "snack": [
            {"id": "veg_fruit_yogurt", "name": "Fruit Yogurt", "cal": 220, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar"]},
            {"id": "veg_roasted_chana", "name": "Roasted Chana", "cal": 210, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar", "low_sodium"]},
            {"id": "veg_peanut_ladoo", "name": "Peanut Ladoo", "cal": 260, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_banana_shake", "name": "Banana Shake", "cal": 300, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_nuts_mix", "name": "Nuts Mix", "cal": 240, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["low_sugar"]},
            {"id": "veg_sprout_chaat", "name": "Sprout Chaat", "cal": 230, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_apple_peanut", "name": "Apple Peanut", "cal": 210, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar"]},
            {"id": "veg_protein_milk", "name": "Protein Milk", "cal": 250, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_makhana_mix", "name": "Makhana Mix", "cal": 190, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_hummus_sticks", "name": "Hummus Sticks", "cal": 230, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
        ],
        "dinner": [
            {"id": "veg_paneer_roti", "name": "Paneer Roti", "cal": 620, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_tofu_stirfry", "name": "Tofu Stirfry", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_dal_soup", "name": "Dal Soup", "cal": 430, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_veg_pulao", "name": "Veg Pulao", "cal": 500, "goals": ["STAY_FIT", "FLEXIBILITY"], "flags": ["gentle"]},
            {"id": "veg_soya_curry", "name": "Soya Curry", "cal": 560, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_khichdi_bowl", "name": "Khichdi Bowl", "cal": 460, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_chana_roti", "name": "Chana Roti", "cal": 510, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_palak_paneer", "name": "Palak Paneer", "cal": 540, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_curd_khichdi", "name": "Curd Khichdi", "cal": 420, "goals": ["FLEXIBILITY", "LOSE_WEIGHT"], "flags": ["gentle"]},
            {"id": "veg_veggie_soup", "name": "Veggie Soup", "cal": 390, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
        ],
    },
    "NON_VEG": {
        "breakfast": [
            {"id": "nv_egg_toast", "name": "Egg Toast", "cal": 390, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_omelette_wrap", "name": "Omelette Wrap", "cal": 420, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_greek_yogurt", "name": "Greek Yogurt", "cal": 310, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "nv_egg_oats", "name": "Egg Oats", "cal": 430, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_chicken_sandwich", "name": "Chicken Sandwich", "cal": 410, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_tuna_toast", "name": "Tuna Toast", "cal": 360, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_boiled_eggs", "name": "Boiled Eggs", "cal": 300, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "high_protein"]},
            {"id": "nv_chicken_poha", "name": "Chicken Poha", "cal": 440, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_egg_idli", "name": "Egg Idli", "cal": 340, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "nv_peanut_eggs", "name": "Peanut Eggs", "cal": 460, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
        ],
        "lunch": [
            {"id": "nv_chicken_rice", "name": "Chicken Rice", "cal": 690, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_grilled_chicken", "name": "Grilled Chicken", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_fish_rice", "name": "Fish Rice", "cal": 600, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_tuna_salad", "name": "Tuna Salad", "cal": 430, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["low_sugar", "low_sodium"]},
            {"id": "nv_egg_curry", "name": "Egg Curry", "cal": 560, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_chicken_quinoa", "name": "Chicken Quinoa", "cal": 540, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_fish_khichdi", "name": "Fish Khichdi", "cal": 500, "goals": ["FLEXIBILITY", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "nv_chicken_wrap", "name": "Chicken Wrap", "cal": 570, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_egg_bowl", "name": "Egg Bowl", "cal": 510, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_turkey_rice", "name": "Turkey Rice", "cal": 630, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
        ],
        "snack": [
            {"id": "nv_greek_nuts", "name": "Greek Nuts", "cal": 240, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "nv_boiled_egg", "name": "Boiled Egg", "cal": 180, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "high_protein"]},
            {"id": "nv_tuna_cracker", "name": "Tuna Cracker", "cal": 230, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_chicken_soup", "name": "Chicken Soup", "cal": 210, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "nv_protein_shake", "name": "Protein Shake", "cal": 280, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_egg_salad", "name": "Egg Salad", "cal": 220, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar", "high_protein"]},
            {"id": "nv_curd_chicken", "name": "Curd Chicken", "cal": 250, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_fruit_yogurt", "name": "Fruit Yogurt", "cal": 220, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "nv_egg_wrap", "name": "Egg Wrap", "cal": 260, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_fish_cup", "name": "Fish Cup", "cal": 230, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
        ],
        "dinner": [
            {"id": "nv_grilled_fish", "name": "Grilled Fish", "cal": 540, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_chicken_roti", "name": "Chicken Roti", "cal": 610, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_egg_bhurji", "name": "Egg Bhurji", "cal": 500, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_fish_soup", "name": "Fish Soup", "cal": 430, "goals": ["FLEXIBILITY", "LOSE_WEIGHT"], "flags": ["gentle", "low_sodium"]},
            {"id": "nv_chicken_stirfry", "name": "Chicken Stirfry", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_turkey_wrap", "name": "Turkey Wrap", "cal": 560, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_chicken_khichdi", "name": "Chicken Khichdi", "cal": 470, "goals": ["FLEXIBILITY", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "nv_tuna_bowl", "name": "Tuna Bowl", "cal": 490, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_egg_rice", "name": "Egg Rice", "cal": 530, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_fish_roti", "name": "Fish Roti", "cal": 580, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
        ],
    },
}

_GOAL_TEMPLATE_META = {
    "BUILD_MUSCLE": {
        "A": {"focus": ["upper", "arms"], "dur": 40},
        "B": {"focus": ["legs", "core"], "dur": 40},
    },
    "LOSE_WEIGHT": {
        "A": {"focus": ["cardio", "upper"], "dur": 30},
        "B": {"focus": ["legs", "core"], "dur": 30},
    },
    "STAY_FIT": {
        "A": {"focus": ["upper", "arms"], "dur": 35},
        "B": {"focus": ["legs", "core"], "dur": 35},
    },
    "FLEXIBILITY": {
        "A": {"focus": ["mobility", "core"], "dur": 30},
        "B": {"focus": ["legs", "mobility"], "dur": 30},
    },
}

_WEEKLY_WORKOUT_META = {
    "BUILD_MUSCLE": [
        {"key": "D1", "base": "A", "focus": ["chest", "arms"], "dur": 42},
        {"key": "D2", "base": "B", "focus": ["legs", "glutes"], "dur": 40},
        {"key": "D3", "base": "A", "focus": ["back", "biceps"], "dur": 40},
        {"key": "D4", "base": "B", "focus": ["legs", "core"], "dur": 38},
        {"key": "D5", "base": "A", "focus": ["shoulders", "triceps"], "dur": 40},
        {"key": "D6", "base": "B", "focus": ["lower", "conditioning"], "dur": 36},
        {"key": "D7", "base": "M", "focus": ["full body", "core"], "dur": 34},
    ],
    "LOSE_WEIGHT": [
        {"key": "D1", "base": "A", "focus": ["upper", "burn"], "dur": 32},
        {"key": "D2", "base": "B", "focus": ["legs", "burn"], "dur": 34},
        {"key": "D3", "base": "A", "focus": ["core", "cardio"], "dur": 30},
        {"key": "D4", "base": "B", "focus": ["lower", "core"], "dur": 32},
        {"key": "D5", "base": "A", "focus": ["push", "conditioning"], "dur": 30},
        {"key": "D6", "base": "B", "focus": ["legs", "conditioning"], "dur": 32},
        {"key": "D7", "base": "M", "focus": ["full body", "burn"], "dur": 30},
    ],
    "STAY_FIT": [
        {"key": "D1", "base": "A", "focus": ["upper", "arms"], "dur": 36},
        {"key": "D2", "base": "B", "focus": ["legs", "glutes"], "dur": 36},
        {"key": "D3", "base": "A", "focus": ["push", "core"], "dur": 34},
        {"key": "D4", "base": "B", "focus": ["lower", "core"], "dur": 34},
        {"key": "D5", "base": "A", "focus": ["pull", "shoulders"], "dur": 35},
        {"key": "D6", "base": "B", "focus": ["legs", "conditioning"], "dur": 33},
        {"key": "D7", "base": "M", "focus": ["full body", "mobility"], "dur": 32},
    ],
    "FLEXIBILITY": [
        {"key": "D1", "base": "A", "focus": ["mobility", "core"], "dur": 30},
        {"key": "D2", "base": "B", "focus": ["hips", "legs"], "dur": 30},
        {"key": "D3", "base": "A", "focus": ["posture", "core"], "dur": 28},
        {"key": "D4", "base": "B", "focus": ["lower", "mobility"], "dur": 30},
        {"key": "D5", "base": "A", "focus": ["upper", "mobility"], "dur": 28},
        {"key": "D6", "base": "B", "focus": ["glutes", "stability"], "dur": 30},
        {"key": "D7", "base": "M", "focus": ["full body", "mobility"], "dur": 28},
    ],
}

_GOAL_CANDIDATES = {
    "BUILD_MUSCLE": {
        "A": [
            "Push Up",
            "Incline Push Up",
            "Diamond Push Ups",
            "Bench Dips",
            "Dumbbell Curl",
            "Dumbbell Hammer Curl",
            "Dumbbell Overhead Press",
            "Dumbbell Lateral Raise",
            "Dumbbell Rear Delt Row",
            "Machine Assisted Pull Up",
            "Machine Assisted Chin Up",
            "Neutral Pulldown",
            "Kickbacks",
            "Bodyweight Pike Press",
            "Long Lever Forearm Plank",
        ],
        "B": [
            "Bodyweight Squat",
            "Dumbbell Forward Lunge",
            "Glute Bridge",
            "Machine Leg Press",
            "Machine Seated Leg Curl",
            "Dumbbell Calf Raise",
            "Dead Bug",
            "Frog Sit Up",
            "Band Crunch",
            "Bicycle Crunch",
            "Supermans",
            "Cardio Jumping Jacks",
            "Cobra Pose",
        ],
    },
    "LOSE_WEIGHT": {
        "A": [
            "Push Up",
            "Incline Push Up",
            "Jumping Mountain Climber",
            "Bench Dips",
            "Long Lever Forearm Plank",
            "Dead Bug",
            "Bodyweight Pike Press",
            "Cardio Jumping Jacks",
            "Bicycle Crunch",
            "Band Crunch",
            "Dumbbell Curl",
            "Dumbbell Lateral Raise",
        ],
        "B": [
            "Bodyweight Squat",
            "Dumbbell Forward Lunge",
            "Glute Bridge",
            "Frog Sit Up",
            "Dead Bug",
            "Band Crunch",
            "Bicycle Crunch",
            "Dumbbell Calf Raise",
            "Cardio Jumping Jacks",
            "Supermans",
            "Cobra Pose",
        ],
    },
    "STAY_FIT": {
        "A": [
            "Push Up",
            "Incline Push Up",
            "Diamond Push Ups",
            "Bench Dips",
            "Dumbbell Curl",
            "Dumbbell Hammer Curl",
            "Long Lever Forearm Plank",
            "Dumbbell Overhead Press",
            "Bodyweight Pike Press",
            "Machine Assisted Pull Up",
            "Dumbbell Lateral Raise",
            "Kickbacks",
            "Neutral Pulldown",
        ],
        "B": [
            "Bodyweight Squat",
            "Dumbbell Forward Lunge",
            "Glute Bridge",
            "Dead Bug",
            "Frog Sit Up",
            "Dumbbell Calf Raise",
            "Band Crunch",
            "Bicycle Crunch",
            "Cardio Jumping Jacks",
            "Supermans",
            "Cobra Pose",
        ],
    },
    "FLEXIBILITY": {
        "A": [
            "Cobra Pose",
            "Long Lever Forearm Plank",
            "Dead Bug",
            "Glute Bridge",
            "Frog Sit Up",
            "Band Crunch",
            "Bicycle Crunch",
            "Supermans",
            "Bodyweight Pike Press",
            "Push Up",
        ],
        "B": [
            "Bodyweight Squat",
            "Dumbbell Forward Lunge",
            "Glute Bridge",
            "Cobra Pose",
            "Dead Bug",
            "Long Lever Forearm Plank",
            "Band Crunch",
            "Bicycle Crunch",
            "Dumbbell Calf Raise",
            "Supermans",
        ],
    },
}

_FALLBACK_EXERCISES = {
    "BUILD_MUSCLE": {
        "A": [
            "Push Up|4x12|r60",
            "Bench Dips|4x10|r60",
            "Dumbbell Curl|4x12|r45",
            "Dumbbell Overhead Press|3x10|r60",
        ],
        "B": [
            "Bodyweight Squat|4x12|r60",
            "Dumbbell Forward Lunge|3x10|r60",
            "Glute Bridge|4x15|r45",
            "Dead Bug|3x12|r30",
        ],
    },
    "LOSE_WEIGHT": {
        "A": [
            "Push Up|3x12|r45",
            "Jumping Mountain Climber|3x20|r30",
            "Bench Dips|3x10|r45",
            "Long Lever Forearm Plank|3x30s|r30",
        ],
        "B": [
            "Bodyweight Squat|4x15|r45",
            "Dumbbell Forward Lunge|3x12|r45",
            "Glute Bridge|3x15|r30",
            "Dead Bug|3x12|r30",
        ],
    },
    "STAY_FIT": {
        "A": [
            "Push Up|3x12|r60",
            "Bench Dips|3x10|r60",
            "Dumbbell Curl|3x12|r45",
            "Long Lever Forearm Plank|3x30s|r30",
        ],
        "B": [
            "Bodyweight Squat|4x12|r60",
            "Dumbbell Forward Lunge|3x10|r60",
            "Glute Bridge|3x15|r45",
            "Dead Bug|3x12|r30",
        ],
    },
    "FLEXIBILITY": {
        "A": [
            "Cobra Pose|3x30s|r30",
            "Dead Bug|3x10|r30",
            "Long Lever Forearm Plank|3x20s|r30",
            "Glute Bridge|3x12|r45",
        ],
        "B": [
            "Bodyweight Squat|3x10|r60",
            "Dumbbell Forward Lunge|2x8|r60",
            "Cobra Pose|3x30s|r30",
            "Dead Bug|3x10|r30",
        ],
    },
}

_CONSERVATIVE_EXERCISES = {
    "A": [
        "Push Up|2x10|r75",
        "Bench Dips|2x8|r75",
        "Long Lever Forearm Plank|2x20s|r45",
        "Dead Bug|2x10|r30",
    ],
    "B": [
        "Bodyweight Squat|2x10|r75",
        "Glute Bridge|2x12|r60",
        "Dumbbell Forward Lunge|2x8|r75",
        "Cobra Pose|2x20s|r30",
    ],
}

_TPL_ITEM_PATTERN = re.compile(r"^\s*([^|]+)\|(\d{1,2})x(\d{1,3}s?)\|r(\d{1,3})\s*$")
_JSON_BLOCK_PATTERN = re.compile(r"\{[\s\S]*\}")


def _normalize_goal(goal: str) -> str:
    value = (goal or "").strip().upper()
    if "FLEX" in value:
        return "FLEXIBILITY"
    if "MUSCLE" in value or "GAIN" in value or "BULK" in value:
        return "BUILD_MUSCLE"
    if "LOSE" in value or "WEIGHT LOSS" in value or "FAT" in value:
        return "LOSE_WEIGHT"
    if value in _CALORIE_TARGETS:
        return value
    return "STAY_FIT"


def _normalize_diet_preference(diet_preference: str) -> str:
    value = (diet_preference or "").strip().casefold()
    if any(term in value for term in ("non veg", "non-veg", "nonveg", "egg", "chicken", "fish", "meat")):
        return "NON_VEG"
    if any(term in value for term in ("veg", "vegetarian", "vegan", "plant")):
        return "VEG"
    return "ANY"


def _clean_medical_conditions(medical_conditions: str) -> str:
    value = (medical_conditions or "").strip()
    return value if value else "None"


def _has_medical_constraints(medical_conditions: str) -> bool:
    cleaned = _clean_medical_conditions(medical_conditions).casefold()
    return cleaned not in {"none", "no", "n/a", "na", "nil"}


def _extract_diet_flags(medical_conditions: str) -> set[str]:
    text = _clean_medical_conditions(medical_conditions).casefold()
    flags: set[str] = set()

    if any(token in text for token in ("diabetes", "sugar", "prediabetes", "insulin")):
        flags.add("low_sugar")
    if any(token in text for token in ("bp", "blood pressure", "hypertension", "sodium")):
        flags.add("low_sodium")
    if any(token in text for token in ("gastric", "acidity", "gerd", "ulcer", "reflux", "stomach")):
        flags.add("gentle")

    return flags


def _calculate_daily_calories(age: int, weight: float, height: float, goal: str, medical_conditions: str = "") -> int:
    goal_key = _normalize_goal(goal)
    base = (10 * float(weight)) + (6.25 * float(height)) - (5 * int(age)) + 150
    goal_adjustments = {
        "BUILD_MUSCLE": 320,
        "LOSE_WEIGHT": -320,
        "STAY_FIT": 0,
        "FLEXIBILITY": -80,
    }

    target = base + goal_adjustments.get(goal_key, 0)
    if _has_medical_constraints(medical_conditions):
        target -= 60

    return int(max(1400, min(3600, round(target))))


def _calculate_water_ml(weight: float, goal: str) -> int:
    goal_key = _normalize_goal(goal)
    extra = 250 if goal_key == "BUILD_MUSCLE" else 0
    return int(max(2000, round(float(weight) * 35) + extra))


def _get_slot_targets(total_calories: int, goal: str) -> dict[str, int]:
    goal_key = _normalize_goal(goal)
    slot_ratios = {
        "BUILD_MUSCLE": {"breakfast": 0.24, "lunch": 0.33, "snack": 0.17, "dinner": 0.26},
        "LOSE_WEIGHT": {"breakfast": 0.27, "lunch": 0.31, "snack": 0.12, "dinner": 0.30},
        "STAY_FIT": {"breakfast": 0.25, "lunch": 0.32, "snack": 0.13, "dinner": 0.30},
        "FLEXIBILITY": {"breakfast": 0.26, "lunch": 0.30, "snack": 0.14, "dinner": 0.30},
    }
    ratios = slot_ratios.get(goal_key, slot_ratios["STAY_FIT"])
    return {slot: int(round(total_calories * ratio)) for slot, ratio in ratios.items()}


def _goal_matches_meal(goal: str, meal: dict[str, Any]) -> bool:
    return goal in meal.get("goals", []) or "ALL" in meal.get("goals", [])


def _meal_score(meal: dict[str, Any], goal: str, slot_target: int, diet_flags: set[str]) -> tuple[int, int]:
    score = 0
    if _goal_matches_meal(goal, meal):
        score += 8

    meal_flags = set(meal.get("flags", []))
    score += 2 * len(diet_flags.intersection(meal_flags))

    calorie_gap = abs(int(meal.get("cal", slot_target)) - slot_target)
    score += max(0, 6 - (calorie_gap // 60))
    return score, -calorie_gap


def _stable_order(items: list[dict[str, Any]], seed_text: str) -> list[dict[str, Any]]:
    if len(items) <= 1:
        return list(items)

    seed_value = int(hashlib.sha256(seed_text.encode("utf-8")).hexdigest(), 16)
    start = seed_value % len(items)
    step = 1 + ((seed_value // len(items)) % max(1, len(items) - 1))
    while gcd(step, len(items)) != 1:
        step += 1

    return [items[(start + (index * step)) % len(items)] for index in range(len(items))]


def _get_meal_pool(slot: str, diet_preference: str) -> list[dict[str, Any]]:
    pref_key = _normalize_diet_preference(diet_preference)
    if pref_key == "VEG":
        return list(_MEAL_LIBRARY["VEG"][slot])
    if pref_key == "NON_VEG":
        return list(_MEAL_LIBRARY["NON_VEG"][slot])
    return list(_MEAL_LIBRARY["VEG"][slot]) + list(_MEAL_LIBRARY["NON_VEG"][slot])


def _pick_weekly_meals(
    slot: str,
    goal: str,
    diet_preference: str,
    medical_conditions: str,
    slot_target: int,
    seed_text: str,
) -> list[dict[str, Any]]:
    pool = _get_meal_pool(slot, diet_preference)
    goal_key = _normalize_goal(goal)
    diet_flags = _extract_diet_flags(medical_conditions)

    scored = sorted(
        pool,
        key=lambda meal: (
            -_meal_score(meal, goal_key, slot_target, diet_flags)[0],
            -_meal_score(meal, goal_key, slot_target, diet_flags)[1],
            meal["id"],
        ),
    )

    preferred = [meal for meal in scored if _goal_matches_meal(goal_key, meal)]
    candidates = preferred if len(preferred) >= 7 else scored
    ordered = _stable_order(candidates, f"{seed_text}:{slot}")

    picks: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for meal in ordered:
        if meal["id"] in seen_ids:
            continue
        picks.append(meal)
        seen_ids.add(meal["id"])
        if len(picks) == 7:
            return picks

    if not ordered:
        return []

    index = 0
    while len(picks) < 7:
        picks.append(ordered[index % len(ordered)])
        index += 1

    return picks


def _build_profile_hash(
    age: int,
    weight: float,
    height: float,
    goal: str,
    medical_conditions: str = "",
    diet_preference: str = "",
) -> str:
    payload = {
        "age": int(age),
        "weight": float(f"{float(weight):.2f}"),
        "height": float(f"{float(height):.2f}"),
        "goal": _normalize_goal(goal),
        "medical_conditions": _clean_medical_conditions(medical_conditions).lower(),
        "diet_preference": _normalize_diet_preference(diet_preference),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _canonicalize_candidates(names: list[str]) -> list[str]:
    canonical_names: list[str] = []
    seen: set[str] = set()

    for name in names:
        canonical = coerce_valid_exercise_name(name)
        if canonical and canonical not in seen:
            seen.add(canonical)
            canonical_names.append(canonical)

    return canonical_names


def _get_candidate_templates(goal: str) -> dict[str, list[str]]:
    goal_key = _normalize_goal(goal)
    raw_templates = _GOAL_CANDIDATES.get(goal_key, _GOAL_CANDIDATES["STAY_FIT"])
    return {
        "A": _canonicalize_candidates(raw_templates["A"]),
        "B": _canonicalize_candidates(raw_templates["B"]),
    }


def _build_tpl_prompt(
    goal: str,
    medical_conditions: str,
    a_candidates: list[str],
    b_candidates: list[str],
) -> str:
    medical_text = _clean_medical_conditions(medical_conditions)
    return "\n".join(
        [
            "Return JSON only.",
            'Schema: {"tpl":{"A":{"focus":["upper"],"dur":35,"ex":["Exercise|3x12|r60"]},"B":{"focus":["legs"],"dur":35,"ex":["Exercise|3x12|r60"]}}}',
            f"Goal: {_normalize_goal(goal)}",
            f"Medical: {medical_text}",
            f"Allowed A: {', '.join(a_candidates)}",
            f"Allowed B: {', '.join(b_candidates)}",
            "Rules:",
            "- tpl required",
            "- A and B required",
            "- focus must be short list",
            "- dur must be number",
            "- ex must contain exactly 4 items",
            "- use only listed exercise names exactly",
            "- no schedule",
            "- no diet",
            "- no notes",
            "- no markdown",
            "- no extra keys",
        ]
    )


def _meal_to_entry(slot: str, meal: dict[str, Any]) -> str:
    return f"{slot}:{meal['name']}|{int(meal['cal'])}"


def _build_demo_diet(
    age: int,
    weight: float,
    height: float,
    goal: str,
    medical_conditions: str = "",
    diet_preference: str = "",
) -> dict[str, Any]:
    goal_key = _normalize_goal(goal)
    diet_pref_key = _normalize_diet_preference(diet_preference)
    daily_calories = _calculate_daily_calories(age, weight, height, goal_key, medical_conditions)
    slot_targets = _get_slot_targets(daily_calories, goal_key)
    seed_text = _build_profile_hash(
        age=age,
        weight=weight,
        height=height,
        goal=goal_key,
        medical_conditions=medical_conditions,
        diet_preference=diet_pref_key,
    )

    weekly_slots = {
        slot: _pick_weekly_meals(
            slot=slot,
            goal=goal_key,
            diet_preference=diet_pref_key,
            medical_conditions=medical_conditions,
            slot_target=slot_targets[slot],
            seed_text=seed_text,
        )
        for slot in _MEAL_SLOTS
    }

    days: dict[str, list[str]] = {}
    for day_index in range(7):
        day_key = f"day_{day_index + 1}"
        day_entries = []
        for slot in _MEAL_SLOTS:
            slot_meals = weekly_slots.get(slot) or []
            if not slot_meals:
                continue
            meal = slot_meals[day_index % len(slot_meals)]
            day_entries.append(_meal_to_entry(slot, meal))
        days[day_key] = day_entries

    return {
        "cal": daily_calories,
        "water_ml": _calculate_water_ml(weight, goal_key),
        "preference": diet_pref_key,
        "days": days,
        "meals": list(days.get("day_1", [])),
    }


def _build_template_block(focus: List[str], dur: int, exercises: List[str]) -> Dict[str, Any]:
    return {
        "focus": [*focus],
        "dur": int(dur),
        "ex": [*exercises],
    }


def _get_fallback_tpl(goal: str, medical_conditions: str) -> dict[str, dict[str, Any]]:
    goal_key = _normalize_goal(goal)
    meta = _GOAL_TEMPLATE_META.get(goal_key, _GOAL_TEMPLATE_META["STAY_FIT"])

    if _has_medical_constraints(medical_conditions):
        meta_a = cast(Dict[str, Any], meta.get("A", {}))
        meta_b = cast(Dict[str, Any], meta.get("B", {}))
        return {
            "A": _build_template_block(cast(List[str], meta_a.get("focus", [])), 25, cast(List[str], _CONSERVATIVE_EXERCISES["A"])),
            "B": _build_template_block(cast(List[str], meta_b.get("focus", [])), 25, cast(List[str], _CONSERVATIVE_EXERCISES["B"])),
        }

    exercises = _FALLBACK_EXERCISES.get(goal_key, _FALLBACK_EXERCISES["STAY_FIT"])
    # Safely extract parts to satisfy linter type inference
    meta_a = cast(Dict[str, Any], meta.get("A", {}))
    a_focus = cast(List[str], meta_a.get("focus", []))
    a_dur = int(cast(Union[int, float, str], meta_a.get("dur", 25)))
    ex_a = cast(List[str], exercises.get("A", []))

    meta_b = cast(Dict[str, Any], meta.get("B", {}))
    b_focus = cast(List[str], meta_b.get("focus", []))
    b_dur = int(cast(Union[int, float, str], meta_b.get("dur", 25)))
    ex_b = cast(List[str], exercises.get("B", []))

    return {
        "A": _build_template_block(a_focus, a_dur, ex_a),
        "B": _build_template_block(b_focus, b_dur, ex_b),
    }


def _dedupe_strings(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def _stable_string_order(items: list[str], seed_text: str) -> list[str]:
    if len(items) <= 1:
        return list(items)

    seed_value = int(hashlib.sha256(seed_text.encode("utf-8")).hexdigest(), 16)
    start = seed_value % len(items)
    step = 1 + ((seed_value // len(items)) % max(1, len(items) - 1))
    while gcd(step, len(items)) != 1:
        step += 1

    return [items[(start + (index * step)) % len(items)] for index in range(len(items))]


def _extract_template_names(template: dict[str, Any] | None) -> list[str]:
    if not isinstance(template, dict):
        return []

    names: list[str] = []
    for item in template.get("ex", []):
        if not isinstance(item, str):
            continue
        name = item.split("|", 1)[0].strip()
        canonical = coerce_valid_exercise_name(name)
        if canonical:
            names.append(canonical)

    return _dedupe_strings(names)


def _classify_exercise(name: str) -> str:
    lowered = name.casefold()
    if any(token in lowered for token in ("plank", "cobra", "superman")):
        return "static"
    if any(token in lowered for token in ("jumping", "cardio")):
        return "cardio"
    if any(token in lowered for token in ("crunch", "dead bug", "sit up", "bicycle")):
        return "core"
    return "compound"


def _prescribe_exercise(name: str, goal: str, medical_conditions: str, day_index: int) -> str:
    goal_key = _normalize_goal(goal)
    constrained = _has_medical_constraints(medical_conditions)
    exercise_type = _classify_exercise(name)

    if constrained:
        templates = {
            "compound": (2, "8", 75),
            "core": (2, "10", 45),
            "static": (2, "20s", 45),
            "cardio": (2, "15", 45),
        }
    else:
        templates_by_goal = {
            "BUILD_MUSCLE": {
                "compound": (4, "10", 60),
                "core": (3, "12", 45),
                "static": (3, "35s", 30),
                "cardio": (3, "20", 30),
            },
            "LOSE_WEIGHT": {
                "compound": (3, "14", 45),
                "core": (3, "15", 30),
                "static": (3, "30s", 30),
                "cardio": (3, "25", 30),
            },
            "STAY_FIT": {
                "compound": (3, "12", 60),
                "core": (3, "12", 45),
                "static": (3, "30s", 30),
                "cardio": (3, "20", 30),
            },
            "FLEXIBILITY": {
                "compound": (2, "10", 60),
                "core": (2, "10", 45),
                "static": (3, "30s", 30),
                "cardio": (2, "18", 30),
            },
        }
        templates = templates_by_goal.get(goal_key, templates_by_goal["STAY_FIT"])

    sets, reps_or_seconds, rest_seconds = templates[exercise_type]
    if not constrained and exercise_type == "compound" and goal_key == "BUILD_MUSCLE" and day_index in {3, 5}:
        reps_or_seconds = "12"
    if not constrained and exercise_type == "cardio" and goal_key == "LOSE_WEIGHT" and day_index in {3, 7}:
        reps_or_seconds = "30"

    return f"{name}|{sets}x{reps_or_seconds}|r{rest_seconds}"


def _pick_day_exercises(pool: list[str], day_key: str, avoid_names: set[str] | None = None) -> list[str]:
    ordered = _stable_string_order(_dedupe_strings(pool), day_key)
    avoid_lookup: Set[str] = avoid_names if avoid_names is not None else set()

    selected: list[str] = []
    for name in ordered:
        if name in avoid_lookup:
            continue
        selected.append(name)
        if len(selected) == 4:
            return selected

    for name in ordered:
        if name not in selected:
            selected.append(name)
        if len(selected) == 4:
            return selected

    while ordered and len(selected) < 4:
        selected.append(ordered[len(selected) % len(ordered)])

    return selected


def _increase_reps_value(value: str, step: int) -> str:
    if step <= 0:
        return value

    if value.endswith("s"):
        # Use rstrip to avoid slicing linter bugs
        base_value = int(value.rstrip("s"))
        return f"{min(90, base_value + (step * 5))}s"

    base_value = int(value)
    return str(min(30, base_value + (step * 2)))


def _build_progressive_template(template: dict[str, Any], step: int) -> dict[str, Any]:
    focus = template.get("focus", []) if isinstance(template, dict) else []
    duration = template.get("dur", 30) if isinstance(template, dict) else 30
    exercises = template.get("ex", []) if isinstance(template, dict) else []

    progressed_exercises: list[str] = []
    for item in exercises:
        if not isinstance(item, str):
            continue

        match = _TPL_ITEM_PATTERN.match(item)
        if not match:
            progressed_exercises.append(item)
            continue

        name = match.group(1).strip()
        sets = int(match.group(2))
        reps_or_seconds = _increase_reps_value(match.group(3), step)
        rest_seconds = int(match.group(4))
        progressed_exercises.append(f"{name}|{sets}x{reps_or_seconds}|r{rest_seconds}")

    return {
        "focus": list(focus),
        "dur": int(duration),
        "ex": progressed_exercises,
    }


def _build_weekly_templates(
    goal: str,
    medical_conditions: str,
    base_templates: dict[str, dict[str, Any]],
    candidates: dict[str, list[str]],
) -> dict[str, Any]:
    del goal, medical_conditions, candidates

    weekly_tpl: dict[str, dict[str, Any]] = {}
    for template_key, base_key, step in _TEMPLATE_SEQUENCE:
        weekly_tpl[template_key] = _build_progressive_template(base_templates.get(base_key, {}), step)

    return {
        "sched": list(FIXED_SCHEDULE),
        "tpl": weekly_tpl,
    }


def _build_fallback_plan(
    age: int,
    weight: float,
    height: float,
    goal: str,
    medical_conditions: str = "",
    diet_preference: str = "",
) -> dict[str, Any]:
    goal_key = _normalize_goal(goal)
    base_tpl = _get_fallback_tpl(goal_key, medical_conditions)
    weekly_workout = _build_weekly_templates(goal_key, medical_conditions, base_tpl, _get_candidate_templates(goal_key))
    return {
        "schema_version": 2,
        "goal": goal_key,
        "sched": weekly_workout["sched"],
        "tpl": weekly_workout["tpl"],
        "diet": _build_demo_diet(age, weight, height, goal_key, medical_conditions, diet_preference),
    }


def _strip_json_wrappers(raw_text: str) -> str:
    text = (raw_text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    if text.startswith("{") and text.endswith("}"):
        return text

    match = _JSON_BLOCK_PATTERN.search(text)
    return match.group(0) if match else text


def _safe_parse_tpl(
    raw_text: str,
    allowed_a: list[str] | None = None,
    allowed_b: list[str] | None = None,
) -> dict[str, dict[str, Any]] | None:
    parsed_text = _strip_json_wrappers(raw_text)

    try:
        payload = json.loads(parsed_text)
    except Exception as exc:
        print(f"[Gemini] JSON parse failed: {exc}")
        return None

    if not isinstance(payload, dict) or "tpl" not in payload:
        print("[Gemini] Validation failed: missing tpl")
        return None

    tpl = payload.get("tpl")
    if not isinstance(tpl, dict) or set(tpl.keys()) != {"A", "B"}:
        print("[Gemini] Validation failed: tpl must contain A and B only")
        return None

    allowed_lookup: Dict[str, Set[str]] = {
        "A": set(allowed_a or []),
        "B": set(allowed_b or []),
    }

    normalized: dict[str, dict[str, Any]] = {}
    for template_key in ("A", "B"):
        section = tpl.get(template_key)
        if not isinstance(section, dict) or set(section.keys()) != {"focus", "dur", "ex"}:
            print(f"[Gemini] Validation failed: invalid template block {template_key}")
            return None

        focus = section.get("focus")
        dur = section.get("dur")
        exercises = section.get("ex")

        if not isinstance(focus, list) or not focus or any(not isinstance(item, str) or not item.strip() for item in focus):
            print(f"[Gemini] Validation failed: invalid focus in {template_key}")
            return None

        if not isinstance(dur, (int, float)) or dur <= 0 or dur > 120:
            print(f"[Gemini] Validation failed: invalid dur in {template_key}")
            return None

        if not isinstance(exercises, list) or len(exercises) != 4:
            print(f"[Gemini] Validation failed: invalid ex count in {template_key}")
            return None

        normalized_exercises: list[str] = []
        for item in exercises:
            if not isinstance(item, str) or len(item) > 80:
                print(f"[Gemini] Validation failed: invalid exercise item in {template_key}")
                return None

            match = _TPL_ITEM_PATTERN.match(item)
            if not match:
                print(f"[Gemini] Validation failed: bad exercise format in {template_key}")
                return None

            exercise_name = coerce_valid_exercise_name(match.group(1).strip())
            if not exercise_name:
                print(f"[Gemini] Validation failed: unknown exercise in {template_key}")
                return None

            lookup_set = cast(Set[str], allowed_lookup.get(template_key, set()))
            if lookup_set and exercise_name not in lookup_set:
                print(f"[Gemini] Validation failed: exercise outside allowed list in {template_key}")
                return None

            sets = int(match.group(2))
            reps_or_seconds = match.group(3)
            rest_seconds = int(match.group(4))

            if sets < 1 or sets > 6 or rest_seconds < 15 or rest_seconds > 180:
                print(f"[Gemini] Validation failed: invalid set/rest values in {template_key}")
                return None

            if str(reps_or_seconds).endswith("s"):
                # Use rstrip to avoid slicing linter bugs
                duration_value = int(str(reps_or_seconds).rstrip("s"))
                if duration_value < 10 or duration_value > 120:
                    print(f"[Gemini] Validation failed: invalid time value in {template_key}")
                    return None
            else:
                rep_value = int(reps_or_seconds)
                if rep_value < 4 or rep_value > 30:
                    print(f"[Gemini] Validation failed: invalid rep value in {template_key}")
                    return None

            normalized_exercises.append(f"{exercise_name}|{sets}x{reps_or_seconds}|r{rest_seconds}")

        normalized[template_key] = {
            "focus": [item.strip() for item in focus],
            "dur": int(round(float(dur))),
            "ex": normalized_exercises,
        }

    return normalized


def generate_plan(
    age: int,
    weight: float,
    height: float,
    goal: str,
    medical_conditions: str = "",
    diet_preference: str = "",
) -> dict[str, Any]:
    """
    V2 DETERMINISTIC GENERATOR (NO AI)
    Complies with requirements: 
    1. Diet Variation (Meal Rotation logic)
    2. Workout Progression (A/B templates, dynamic reps/sets)
    3. Zero LLM usage for plan generation.
    """
    profile_hash = _build_profile_hash(age, weight, height, goal, medical_conditions, diet_preference)
    plan = _build_fallback_plan(age, weight, height, goal, medical_conditions, diet_preference)
    
    return {
        "profile_hash": profile_hash,
        "plan": plan,
    }

# Alias for generate_compact_plan if needed by other modules
generate_compact_plan = generate_plan
