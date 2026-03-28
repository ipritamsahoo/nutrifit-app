"""
ai_service.py
=================
Compact workout template generation for the hackathon demo.
"""

import hashlib
import json
import os
import re
import random
from math import gcd
from typing import Any, List, Dict, Optional, Set, Union, cast

from dotenv import load_dotenv
from openai import OpenAI

from exercise_utils import coerce_valid_exercise_name

load_dotenv()

_MODEL_NAME = "stepfun/step-3.5-flash:free"
_API_KEY = os.getenv("OPENROUTER_API_KEY_2")

if not _API_KEY:
    print("[AI Service] WARNING: OPENROUTER_API_KEY_2 not found! Falling back to Key 1")
    _API_KEY = os.getenv("OPENROUTER_API_KEY", "sk-missing")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=_API_KEY,
    timeout=30.0, # Increased timeout
    default_headers={
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "NutriFit Plan Generator",
    }
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

def _get_dynamic_schedule(workout_days: str) -> List[str]:
    """
    Returns a 7-element list of template keys (A1, B1, REST) 
    based on the requested frequency.
    """
    days = (workout_days or "").lower()
    
    # Check strings specifically for common frontend labels
    if "3" in days or "three" in days:
        return ["A1", "REST", "B1", "REST", "A2", "REST", "REST"]
    
    if "4" in days or "four" in days:
        return ["A1", "B1", "REST", "A2", "B2", "REST", "REST"]
    
    if "5" in days or "6" in days or "5-6" in days or "five" in days or "six" in days:
        return ["A1", "B1", "A2", "B2", "A3", "B3", "REST"]
        
    # Default to 7 days if unknown (legacy)
    return ["A1", "B1", "A2", "B2", "A3", "B3", "A4"]

# Legacy alias for backward compatibility with outsider chatbot if needed
FIXED_SCHEDULE = ["A1", "B1", "A2", "B2", "A3", "B3", "A4"]

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
            {"id": "veg_protein_oats", "name": "Protein Oats (50g Oats, 200ml Milk)", "cal": 430, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_paneer_toast", "name": "Paneer Toast (100g Paneer, 2 pc Bread)", "cal": 400, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_moong_chilla", "name": "Moong Chilla (2 pc, 150g Batter)", "cal": 350, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sugar"]},
            {"id": "veg_yogurt_parfait", "name": "Yogurt Parfait (200g Yogurt, 30g Granola)", "cal": 320, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_poha_peanuts", "name": "Poha Peanuts (100g Poha, 20g Peanuts)", "cal": 340, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle"]},
            {"id": "veg_besan_cheela", "name": "Besan Cheela (2 pc, 150g Batter)", "cal": 360, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar"]},
            {"id": "veg_tofu_scramble", "name": "Tofu Scramble (150g Tofu, 2 pc Toast)", "cal": 390, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_idli_sambar", "name": "Idli Sambar (3 pc Idli, 150ml Sambar)", "cal": 330, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_peanut_smoothie", "name": "Peanut Smoothie (250ml Milk, 2 tbsp PB)", "cal": 460, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_sprout_bowl", "name": "Sprout Bowl (150g Sprouts, 1/2 Lemon)", "cal": 300, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar", "gentle"]},
            {"id": "veg_quinoa_breakfast", "name": "Quinoa Breakfast (100g Quinoa, 100ml Milk)", "cal": 380, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_fruit_salad_large", "name": "Giant Fruit Bowl (300g Mixed Fruits)", "cal": 280, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["low_sodium"]},
        ],
        "lunch": [
            {"id": "veg_paneer_rice", "name": "Paneer Rice (150g Paneer, 1.5 bowl Rice)", "cal": 650, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_dal_roti", "name": "Dal Roti (1 bowl Dal, 2 pc Roti)", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_rajma_rice", "name": "Rajma Rice (1.5 bowl Rajma, 1 bowl Rice)", "cal": 580, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_tofu_quinoa", "name": "Tofu Quinoa (150g Tofu, 1 bowl Quinoa)", "cal": 560, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar", "high_protein"]},
            {"id": "veg_chickpea_salad", "name": "Chickpea Salad (200g Chickpeas, Mixed Veg)", "cal": 430, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["low_sugar", "low_sodium"]},
            {"id": "veg_veg_khichdi", "name": "Veg Khichdi (2 bowl Khichdi, 50g Curd)", "cal": 480, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_paneer_wrap", "name": "Paneer Wrap (120g Paneer, 1 pc Whole Wheat Wrap)", "cal": 540, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_soya_pulao", "name": "Soya Pulao (100g Soya, 1 bowl Rice)", "cal": 610, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_curd_rice", "name": "Curd Rice (1 bowl Rice, 150g Curd)", "cal": 450, "goals": ["FLEXIBILITY", "LOSE_WEIGHT", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "veg_lentil_bowl", "name": "Lentil Bowl (200g Lentils, 1 pc Toast)", "cal": 500, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar", "low_sodium"]},
            {"id": "veg_soya_bhurji", "name": "Soya Bhurji (150g Soya, 2 pc Roti)", "cal": 590, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_mixed_veg_curry", "name": "Mixed Veg Curry (2 bowl Veg, 2 pc Roti)", "cal": 470, "goals": ["STAY_FIT", "FLEXIBILITY"], "flags": ["low_sodium"]},
        ],
        "snack": [
            {"id": "veg_fruit_yogurt", "name": "Fruit Yogurt (150g Yogurt, 1/2 Apple)", "cal": 220, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar"]},
            {"id": "veg_roasted_chana", "name": "Roasted Chana (50g)", "cal": 210, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar", "low_sodium"]},
            {"id": "veg_peanut_ladoo", "name": "Peanut Ladoo (2 pc, Small)", "cal": 260, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_banana_shake", "name": "Banana Shake (200ml Milk, 1 pc Banana)", "cal": 300, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_nuts_mix", "name": "Nuts Mix (30g Almonds/Walnuts)", "cal": 240, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["low_sugar"]},
            {"id": "veg_sprout_chaat", "name": "Sprout Chaat (100g Sprouts, Chat Masala)", "cal": 230, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_apple_peanut", "name": "Apple Peanut (1 pc Apple, 1 tbsp PB)", "cal": 210, "goals": ["LOSE_WEIGHT", "STAY_FIT", "FLEXIBILITY"], "flags": ["low_sugar"]},
            {"id": "veg_protein_milk", "name": "Protein Milk (250ml Skimmed Milk)", "cal": 250, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_makhana_mix", "name": "Makhana Mix (40g Roasted Makhana)", "cal": 190, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_hummus_sticks", "name": "Hummus Sticks (50g Hummus, Carrot Sticks)", "cal": 230, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
        ],
        "dinner": [
            {"id": "veg_paneer_roti", "name": "Paneer Roti (120g Paneer, 2 pc Roti)", "cal": 620, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_tofu_stirfry", "name": "Tofu Stirfry (150g Tofu, Mixed Veg)", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "veg_dal_soup", "name": "Dal Soup (2 bowl Dal, 1 pc Garlic Bread)", "cal": 430, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_veg_pulao", "name": "Veg Pulao (1.5 bowl Pulao, 50g Curd)", "cal": 500, "goals": ["STAY_FIT", "FLEXIBILITY"], "flags": ["gentle"]},
            {"id": "veg_soya_curry", "name": "Soya Curry (150g Soya, 1 pc Roti)", "cal": 560, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_khichdi_bowl", "name": "Khichdi Bowl (1.5 bowl, Light Salt)", "cal": 460, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_chana_roti", "name": "Chana Roti (1 bowl Chana, 2 pc Roti)", "cal": 510, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "veg_palak_paneer", "name": "Palak Paneer (150g Paneer, 1 pc Roti)", "cal": 540, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_curd_khichdi", "name": "Curd Khichdi (1 bowl Khichdi, 100g Curd)", "cal": 420, "goals": ["FLEXIBILITY", "LOSE_WEIGHT"], "flags": ["gentle"]},
            {"id": "veg_veggie_soup", "name": "Veggie Soup (2 bowl Healthy Soup)", "cal": 390, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "veg_paneer_tikka", "name": "Paneer Tikka (200g, No Oil)", "cal": 480, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "veg_mushroom_stirfry", "name": "Mushroom Stirfry (200g Mushroom, 1 pc Roti)", "cal": 410, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["low_sugar"]},
        ],
    },
    "NON_VEG": {
        "breakfast": [
            {"id": "nv_egg_toast", "name": "Egg Toast (2 pc Egg, 2 pc Bread)", "cal": 390, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_omelette_wrap", "name": "Omelette Wrap (3 pc Egg, 1 pc Wrap)", "cal": 420, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_greek_yogurt", "name": "Greek Yogurt (200g Yogurt, 30g Nuts)", "cal": 310, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "nv_egg_oats", "name": "Egg Oats (2 pc Egg, 50g Oats)", "cal": 430, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_chicken_sandwich", "name": "Chicken Sandwich (100g Chicken, 2 pc Bread)", "cal": 410, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_tuna_toast", "name": "Tuna Toast (80g Tuna, 2 pc Bread)", "cal": 360, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_boiled_eggs", "name": "Boiled Eggs (4 pc Eggs, No Yolk)", "cal": 300, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "high_protein"]},
            {"id": "nv_chicken_poha", "name": "Chicken Poha (100g Poha, 50g Chicken)", "cal": 440, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_egg_idli", "name": "Egg Idli (2 pc Idli, 2 pc Egg)", "cal": 340, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "nv_peanut_eggs", "name": "Peanut Eggs (3 pc Egg, 1 tbsp PB)", "cal": 460, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_salmon_breakfast", "name": "Salmon Toast (80g Salmon, 1 pc Bread)", "cal": 380, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_chicken_smoothie", "name": "Protein Smoothie (30g Whey, 250ml Milk)", "cal": 350, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
        ],
        "lunch": [
            {"id": "nv_chicken_rice", "name": "Chicken Rice (200g Chicken, 1.5 bowl Rice)", "cal": 690, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_grilled_chicken", "name": "Grilled Chicken (200g Chicken, 1 bowl Veg)", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_fish_rice", "name": "Fish Rice (150g Fish, 1.5 bowl Rice)", "cal": 600, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_tuna_salad", "name": "Tuna Salad (150g Tuna, Large Bowl Veg)", "cal": 430, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["low_sugar", "low_sodium"]},
            {"id": "nv_egg_curry", "name": "Egg Curry (3 pc Egg, 1 bowl Rice)", "cal": 560, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_chicken_quinoa", "name": "Chicken Quinoa (150g Chicken, 1 bowl Quinoa)", "cal": 540, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_fish_khichdi", "name": "Fish Khichdi (1 bowl, 100g Fish)", "cal": 500, "goals": ["FLEXIBILITY", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "nv_chicken_wrap", "name": "Chicken Wrap (150g Chicken, 1 pc Wrap)", "cal": 570, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_egg_bowl", "name": "Egg Bowl (4 pc Egg, 50g Curd)", "cal": 510, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_turkey_rice", "name": "Turkey Rice (200g Turkey, 1 bowl Rice)", "cal": 630, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_chicken_pasta", "name": "Chicken Pasta (100g Chicken, 1.5 bowl Pasta)", "cal": 650, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_fish_tacos", "name": "Fish Tacos (2 pc, 100g Fish)", "cal": 580, "goals": ["STAY_FIT", "LOSE_WEIGHT"], "flags": ["high_protein"]},
        ],
        "snack": [
            {"id": "nv_greek_nuts", "name": "Greek Nuts (200g Yogurt, 20g Nuts)", "cal": 240, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "nv_boiled_egg", "name": "Boiled Egg (2 pc)", "cal": 180, "goals": ["LOSE_WEIGHT", "FLEXIBILITY", "STAY_FIT"], "flags": ["gentle", "high_protein"]},
            {"id": "nv_tuna_cracker", "name": "Tuna Cracker (50g Tuna, 4 pc Crackers)", "cal": 230, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_chicken_soup", "name": "Chicken Soup (1.5 bowl Healthy Soup)", "cal": 210, "goals": ["LOSE_WEIGHT", "FLEXIBILITY"], "flags": ["gentle", "low_sodium"]},
            {"id": "nv_protein_shake", "name": "Protein Shake (1 scoop, 300ml Water)", "cal": 280, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_egg_salad", "name": "Egg Salad (2 pc Egg, Mixed Greens)", "cal": 220, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar", "high_protein"]},
            {"id": "nv_curd_chicken", "name": "Curd Chicken (100g Chicken, 50g Curd)", "cal": 250, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_fruit_yogurt", "name": "Fruit Yogurt (150g Yogurt, 1/2 Banana)", "cal": 220, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["low_sugar"]},
            {"id": "nv_egg_wrap", "name": "Egg Wrap (2 pc Egg, 1 pc Mini Wrap)", "cal": 260, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_fish_cup", "name": "Fish Cup (50g Steamed Fish)", "cal": 230, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
        ],
        "dinner": [
            {"id": "nv_grilled_fish", "name": "Grilled Fish (200g Fish, Mixed Veg)", "cal": 540, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_chicken_roti", "name": "Chicken Roti (150g Chicken, 2 pc Roti)", "cal": 610, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_egg_bhurji", "name": "Egg Bhurji (4 pc Egg, 1 pc Roti)", "cal": 500, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_fish_soup", "name": "Fish Soup (2 bowl Soup, 1 pc Toast)", "cal": 430, "goals": ["FLEXIBILITY", "LOSE_WEIGHT"], "flags": ["gentle", "low_sodium"]},
            {"id": "nv_chicken_stirfry", "name": "Chicken Stirfry (150g Chicken, 50g Cashews)", "cal": 520, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_turkey_wrap", "name": "Turkey Wrap (150g Turkey, 1 pc Wrap)", "cal": 560, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_chicken_khichdi", "name": "Chicken Khichdi (1.5 bowl, 100g Chicken)", "cal": 470, "goals": ["FLEXIBILITY", "STAY_FIT"], "flags": ["gentle"]},
            {"id": "nv_tuna_bowl", "name": "Tuna Bowl (150g Tuna, 50g Quinoa)", "cal": 490, "goals": ["LOSE_WEIGHT", "STAY_FIT"], "flags": ["high_protein", "low_sugar"]},
            {"id": "nv_egg_rice", "name": "Egg Rice (3 pc Egg, 1 bowl Rice)", "cal": 530, "goals": ["STAY_FIT", "BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_fish_roti", "name": "Fish Roti (150g Fish, 1 pc Roti)", "cal": 580, "goals": ["BUILD_MUSCLE", "STAY_FIT"], "flags": ["high_protein"]},
            {"id": "nv_chicken_legs", "name": "Grilled Chicken Legs (2 pc, Large)", "cal": 590, "goals": ["BUILD_MUSCLE"], "flags": ["high_protein"]},
            {"id": "nv_prawn_curry", "name": "Prawn Curry (150g Prawns, 1 pc Roti)", "cal": 460, "goals": ["STAY_FIT", "LOSE_WEIGHT"], "flags": ["high_protein"]},
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

_TPL_ITEM_PATTERN = re.compile(r"^\s*([^|]+?)\s*\|\s*(\d{1,3})\s*[xX\*]\s*(\d{1,3}s?)\s*\|\s*r?(\d{1,4})\s*$")
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


def _build_doctor_tpl_prompt(
    goal: str,
    level: str,
    days: str,
    time: str,
    muscles: str,
    equipment: str,
    injury: str,
    filtered_exercises: List[str]
) -> str:
    """
    Requested custom prompt for the Doctor Dashboard.
    Ensures AI uses specific details and exercises.
    """
    ex_list = ", ".join(filtered_exercises) if filtered_exercises else "N/A"
    return "\n".join(
        [
            "Return JSON only.",
            "You are creating two reusable workout templates for the app. Do NOT create a weekly schedule.",
            f"Goal: {goal}",
            f"Fitness Level: {level}",
            f"Workout Days: {days}",
            f"Session Time: {time}",
            f"Target Areas: {muscles}",
            f"Equipment: {equipment}",
            f"Injury Notes: {injury}",
            f"Allowed Exercises: {ex_list}",
            "Schema:",
            '{"tpl":{"A":{"focus":["upper"],"dur":30,"ex":["Push Up|3x12|r60","Bench Dips|3x10|r45","Dumbbell Curl|3x12|r45","Long Lever Forearm Plank|3x30s|r30"]},"B":{"focus":["legs"],"dur":30,"ex":["Bodyweight Squat|3x12|r60","Dumbbell Forward Lunge|3x10|r60","Glute Bridge|3x15|r45","Dead Bug|3x12|r30"]}}}',
            "Rules:",
            "- include exactly one top-level key: tpl",
            "- inside tpl include only A and B",
            "- inside each template include only focus, dur, ex",
            "- focus must be 1-2 short lowercase strings",
            "- dur must be an integer number of minutes and fit within the requested session time",
            "- ex must contain exactly 4 items",
            "- use only the allowed exercises listed above and copy each exercise name exactly",
            '- every ex item must use the exact format "Name|SetsxReps|rRestSeconds"',
            "- use lowercase x, numeric reps or seconds like 30s, and numeric rest like r60",
            "- no schedule, no rest-day plan, no diet, no notes, no markdown, no extra keys",
            "CRITICAL: RETURN ONLY RAW JSON. DO NOT WRITE ANY CONVERSATIONAL TEXT BEFORE OR AFTER.",
        ]
    )


def _build_tpl_prompt(
    goal: str,
    medical_conditions: str,
    a_candidates: List[str],
    b_candidates: List[str],
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


def _parse_duration_minutes(value: str | int | float | None, default: int = 30) -> int:
    if isinstance(value, (int, float)) and value > 0:
        return max(10, min(120, int(value)))

    matches = re.findall(r"\d{1,3}", str(value or ""))
    if not matches:
        return default

    return max(10, min(120, int(matches[-1])))


def _build_filtered_fallback_tpl(
    goal: str,
    medical_conditions: str,
    filtered_exercises: list[str],
    session_time: str = "",
) -> dict[str, dict[str, Any]]:
    goal_key = _normalize_goal(goal)
    meta = _GOAL_TEMPLATE_META.get(goal_key, _GOAL_TEMPLATE_META["STAY_FIT"])
    canonical_pool = _dedupe_strings(
        [
            canonical
            for name in filtered_exercises
            for canonical in [coerce_valid_exercise_name(name)]
            if canonical
        ]
    )

    if not canonical_pool:
        return _get_fallback_tpl(goal_key, medical_conditions)

    requested_duration = _parse_duration_minutes(session_time, 30)

    def _build_template(template_key: str, day_index: int, avoid_names: set[str] | None = None) -> dict[str, Any]:
        meta_block = cast(Dict[str, Any], meta.get(template_key, {}))
        # Add a random component to the seed to ensure variety as requested by user
        # This prevents the fallback from looking "too static"
        random_seed = random.randint(1, 1000)
        selected_names = _pick_day_exercises(
            canonical_pool,
            f"{goal_key}:{template_key}:{session_time or requested_duration}:{random_seed}",
            avoid_names,
        )
        prescribed = [
            _prescribe_exercise(name, goal_key, medical_conditions, day_index)
            for name in selected_names
        ]
        template_duration = int(cast(Union[int, float, str], meta_block.get("dur", requested_duration)))
        safe_duration = min(max(10, template_duration), requested_duration)
        return _build_template_block(
            cast(List[str], meta_block.get("focus", [])),
            safe_duration,
            prescribed,
        )

    template_a = _build_template("A", 1)
    used_in_a = set(_extract_template_names(template_a))
    template_b = _build_template("B", 2, used_in_a)

    return {
        "A": template_a,
        "B": template_b,
    }


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
    workout_days: str = ""
) -> dict[str, Any]:
    del goal, medical_conditions, candidates

    sched = _get_dynamic_schedule(workout_days)
    print(f"[AI Service] Dynamic Schedule Generated: {sched} (Based on: {workout_days})")
    
    weekly_tpl: dict[str, dict[str, Any]] = {}
    
    # Map for progression (key -> base template, step index)
    progression: Dict[str, tuple[str, int]] = {
        "A1": ("A", 0), "B1": ("B", 0),
        "A2": ("A", 1), "B2": ("B", 1),
        "A3": ("A", 2), "B3": ("B", 2),
        "A4": ("A", 3),
    }

    # Only build templates for non-REST days in the schedule
    for day_code in sched:
        if day_code != "REST" and day_code in progression:
            base_key, step = progression[day_code]
            weekly_tpl[day_code] = _build_progressive_template(base_templates.get(base_key, {}), step)

    return {
        "sched": sched,
        "tpl": weekly_tpl,
    }


def _build_fallback_plan(
    age: int,
    weight: float,
    height: float,
    goal: str,
    medical_conditions: str = "",
    diet_preference: str = "",
    workout_days: str = ""
) -> dict[str, Any]:
    goal_key = _normalize_goal(goal)
    base_tpl = _get_fallback_tpl(goal_key, medical_conditions)
    weekly_workout = _build_weekly_templates(goal_key, medical_conditions, base_tpl, _get_candidate_templates(goal_key), workout_days)
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


def _extract_response_text(message: Any) -> str:
    if isinstance(message, dict):
        content = message.get("content")
        reasoning = message.get("reasoning")
    else:
        content = getattr(message, "content", None)
        reasoning = getattr(message, "reasoning", None)

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                if part.strip():
                    parts.append(part.strip())
                continue

            if isinstance(part, dict):
                text_value = part.get("text")
            else:
                text_value = getattr(part, "text", None)

            if isinstance(text_value, str):
                if text_value.strip():
                    parts.append(text_value.strip())
                continue

            if isinstance(text_value, dict):
                nested_value = text_value.get("value")
            else:
                nested_value = getattr(text_value, "value", None)

            if isinstance(nested_value, str) and nested_value.strip():
                parts.append(nested_value.strip())

        return "\n".join(parts).strip()

    if isinstance(reasoning, str):
        return reasoning.strip()

    return ""


def _build_allowed_lookup(values: list[str] | None) -> Set[str]:
    lookup: Set[str] = set()
    for value in values or []:
        canonical = coerce_valid_exercise_name(value)
        if canonical:
            lookup.add(canonical)
        elif value and str(value).strip():
            lookup.add(str(value).strip())
    return lookup


def _coerce_tpl_payload(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None

    raw_tpl = payload.get("tpl", payload)
    if not isinstance(raw_tpl, dict):
        return None

    key_map = {
        "A": "A",
        "B": "B",
        "TEMPLATE_A": "A",
        "TEMPLATE_B": "B",
        "SET_A": "A",
        "SET_B": "B",
        "WORKOUT_A": "A",
        "WORKOUT_B": "B",
    }
    normalized_tpl: dict[str, Any] = {}
    for key, value in raw_tpl.items():
        mapped_key = key_map.get(str(key).strip().upper())
        if mapped_key and mapped_key not in normalized_tpl:
            normalized_tpl[mapped_key] = value

    return normalized_tpl if set(normalized_tpl.keys()) == {"A", "B"} else None


def _coerce_tpl_exercise_item(item: Any) -> str | None:
    if isinstance(item, str):
        return item.strip()

    if not isinstance(item, dict):
        return None

    name = item.get("name") or item.get("exercise")
    sets = item.get("sets")
    reps = item.get("reps") or item.get("duration") or item.get("seconds")
    rest = item.get("rest") or item.get("rest_seconds") or item.get("restSeconds")

    if not name or sets in (None, "") or reps in (None, "") or rest in (None, ""):
        return None

    return f"{str(name).strip()}|{str(sets).strip()}x{str(reps).strip()}|r{str(rest).strip()}"


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

    tpl = _coerce_tpl_payload(payload)
    if not tpl:
        print("[Gemini] Validation failed: missing or malformed tpl payload")
        return None

    allowed_lookup: Dict[str, Set[str]] = {
        "A": _build_allowed_lookup(allowed_a),
        "B": _build_allowed_lookup(allowed_b),
    }

    normalized: dict[str, dict[str, Any]] = {}
    for template_key in ("A", "B"):
        section = tpl.get(template_key)
        if not isinstance(section, dict):
            print(f"[Gemini] Validation failed: invalid template block {template_key}")
            return None

        focus = section.get("focus")
        if isinstance(focus, str):
            focus = [focus]

        dur_raw = section.get("dur")
        if isinstance(dur_raw, str):
            dur_match = re.search(r"\d{1,3}", dur_raw)
            dur = int(dur_match.group(0)) if dur_match else None
        else:
            dur = dur_raw

        exercises = section.get("ex", section.get("exercises"))

        if not isinstance(focus, list) or not focus or any(not isinstance(item, str) or not item.strip() for item in focus):
            print(f"[Gemini] Validation failed: invalid focus in {template_key}")
            return None

        if not isinstance(dur, (int, float)) or dur <= 0 or dur > 120:
            print(f"[Gemini] Validation failed: invalid dur in {template_key}")
            return None

        if not isinstance(exercises, list):
            print(f"[Gemini] Validation failed: invalid ex payload in {template_key}")
            return None

        normalized_exercises: list[str] = []
        for item in exercises:
            coerced_item = _coerce_tpl_exercise_item(item)
            if not isinstance(coerced_item, str) or len(coerced_item) > 80:
                print(f"[Gemini] Skipping invalid exercise item in {template_key}")
                continue

            match = _TPL_ITEM_PATTERN.match(coerced_item)
            if not match:
                print(f"[Gemini] Skipping badly formatted exercise item in {template_key}")
                continue

            exercise_name = coerce_valid_exercise_name(match.group(1).strip())
            if not exercise_name:
                print(f"[Gemini] Skipping unknown exercise in {template_key}")
                continue

            lookup_set = cast(Set[str], allowed_lookup.get(template_key, set()))
            if lookup_set and exercise_name not in lookup_set:
                print(f"[Gemini] Skipping exercise outside allowed list in {template_key}: {exercise_name}")
                continue

            sets = int(match.group(2))
            reps = match.group(3).strip().lower() # Ensure consistency (e.g., 30s)
            rest = int(match.group(4))
            
            if sets < 1 or sets > 6 or rest < 15 or rest > 180:
                print(f"[Gemini] Skipping invalid set/rest values in {template_key}")
                continue

            if reps.endswith("s"):
                # Use rstrip to avoid slicing linter bugs
                duration_value = int(reps.rstrip("s"))
                if duration_value < 10 or duration_value > 120:
                    print(f"[Gemini] Skipping invalid time value in {template_key}")
                    continue
            else:
                try:
                    rep_value = int(reps)
                    if rep_value < 4 or rep_value > 30:
                        print(f"[Gemini] Skipping invalid rep value in {template_key}")
                        continue
                except ValueError:
                    print(f"[Gemini] Skipping non-numeric reps in {template_key}")
                    continue

            # NORMALIZATION: Force clean "Name|SetsxReps|rRest" format
            normalized_exercises.append(f"{exercise_name}|{sets}x{reps}|r{rest}")
            if len(normalized_exercises) == 4:
                break

        if len(normalized_exercises) != 4:
            print(f"[Gemini] Validation failed: invalid ex count in {template_key}")
            return None

        normalized[template_key] = {
            "focus": [item.strip() for item in focus],
            "dur": int(round(float(dur))),
            "ex": normalized_exercises,
        }

    return normalized


def _get_v2_filtered_exercises(goal: str, equipment: str, targets: Optional[List[str]], injuries: Optional[List[str]], fitness_level: str = "beginner") -> List[str]:
    """
    Read JSON objects from the structured exerciseversion2/ folder.
    Filters by Goal, Equipment, Target Area, Difficulty, and EXCLUDES based on Injury tags.
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    v2_dir = os.path.join(base_dir, "exerciseversion2")
    
    # Normalize Goal
    goal_norm = (goal or "").strip().upper().replace(" ", "_").replace("-", "_")
    
    # Normalize Equipment (Handle Doctor Dashboard inputs)
    equipment_str = (equipment or "").strip().lower()
    if "no equip" in equipment_str or not equipment_str:
        equip_norm = "NO_EQUIPMENT"
    else:
        equip_norm = "WITH_EQUIPMENT"
    
    goal_path = os.path.join(v2_dir, goal_norm)
    equip_path = os.path.join(goal_path, equip_norm)
    
    if not os.path.exists(equip_path):
        # Fallback if specific folder doesn't exist
        print(f"[AI Service] Warning: Path {equip_path} not found. Fallback to STAY_FIT/NO_EQUIPMENT")
        equip_path = os.path.join(v2_dir, "STAY_FIT", "NO_EQUIPMENT")
    
    injury_list: List[str] = [i.lower() for i in (injuries or []) if i and i.lower() != 'none']
    all_filtered: List[str] = []
    
    # Target synonyms to map frontend inputs to filenames
    SYNONYMS = {
        "abs": ["abdominals", "lower abdominals", "upper abdominals", "obliques"],
        "hand": ["forearms", "biceps", "triceps", "wrists"],
        "hands": ["forearms", "biceps", "triceps", "wrists"],
        "glutes": ["gluteus maximus", "gluteus medius", "glutes"],
        "quads": ["quads", "inner quadriceps", "outer quadricep", "rectus femoris"],
        "back": ["lower back", "lats", "traps", "traps (mid-back)"],
        "shoulders": ["shoulders", "anterior deltoid", "lateral deltoid", "posterior deltoid", "front shoulders", "rear shoulders"],
        "shoulder": ["shoulders", "anterior deltoid", "lateral deltoid", "posterior deltoid", "front shoulders", "rear shoulders"],
        "neck": ["traps", "upper traps"],
        "legs": ["quads", "hamstrings", "calves", "glutes", "inner thigh"],
        "leg": ["quads", "hamstrings", "calves", "glutes", "inner thigh"],
        "core": ["abdominals", "obliques", "lower back", "lower abdominals", "upper abdominals"],
        "chest": ["chest", "mid and lower chest", "upper chest"],
        "arms": ["biceps", "triceps", "forearms", "lateral head triceps", "medial head triceps"],
        "arm": ["biceps", "triceps", "forearms"],
        "bicep": ["biceps"],
        "tricep": ["triceps", "lateral head triceps", "medial head triceps"],
        "calf": ["calves", "gastrocnemius", "tibialis"]
    }
    
    target_files: List[str] = []
    if not targets or any("full" in (t or "").lower() for t in targets):
        if os.path.exists(equip_path):
            target_files = [f for f in os.listdir(equip_path) if f.endswith(".json")]
    else:
        if os.path.exists(equip_path):
            all_files_map = {f.lower().replace(".json", ""): f for f in os.listdir(equip_path) if f.endswith(".json")}
            for t in targets:
                if not t: continue
                t_lower = t.strip().lower()
                search_terms = set([t_lower])
                if t_lower in SYNONYMS:
                    search_terms.update(SYNONYMS[t_lower])
                    
                for search_term in search_terms:
                    if search_term in all_files_map:
                        target_files.append(all_files_map[search_term])
                        
    # Duplicate prevention for target_files
    target_files = list(set(target_files))
                    
    # Read files and filter safely
    for filename in target_files:
        filepath = os.path.join(equip_path, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                exercises_data = json.load(f)
                for ex in exercises_data:
                    # Check Level/Difficulty
                    difficulty = str(ex.get("difficulty", "beginner")).lower()
                    if fitness_level == "beginner" and difficulty != "beginner":
                        continue
                    elif fitness_level == "intermediate" and difficulty == "advanced":
                        continue
                    # advanced -> all allowed

                    avoid_tags: List[str] = [str(tag).lower() for tag in ex.get("injury_avoid", [])]
                    is_safe = True
                    for injury in injury_list:
                        if any(tag in injury for tag in avoid_tags):
                            is_safe = False
                            break
                    if is_safe:
                        name = ex.get("name")
                        if name:
                            all_filtered.append(str(name))
        except Exception as e:
            print(f"[AI Service] Failed to read {filepath}: {e}")

    # GUARANTEED FALLBACK: If nothing was found, grab random safe exercises from the whole folder
    if not all_filtered and os.path.exists(equip_path):
        print(f"[AI Service] Warning: No exercises matched {targets}. Reverting to Full Body safe exercises.")
        for filename in os.listdir(equip_path):
            if filename.endswith(".json"):
                filepath = os.path.join(equip_path, filename)
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        exercises_data = json.load(f)
                        for ex in exercises_data:
                            # Check Level/Difficulty
                            difficulty = str(ex.get("difficulty", "beginner")).lower()
                            if fitness_level == "beginner" and difficulty != "beginner":
                                continue
                            elif fitness_level == "intermediate" and difficulty == "advanced":
                                continue
                            
                            avoid_tags: List[str] = [str(tag).lower() for tag in ex.get("injury_avoid", [])]
                            is_safe = True
                            for injury in injury_list:
                                if any(tag in injury for tag in avoid_tags):
                                    is_safe = False
                                    break
                            if is_safe:
                                name = ex.get("name")
                                if name:
                                    all_filtered.append(str(name))
                except Exception:
                    pass

    unique_names: List[str] = list(set(all_filtered))
    random.shuffle(unique_names)
    unique_names = unique_names[:30]
    
    print(f"[AI Service] Successfully filtered {len(unique_names)} exercises from folders.")
    return unique_names

def generate_plan(
    age: int,
    weight: float,
    height: float,
    goal: str,
    medical_conditions: str = "",
    diet_preference: str = "",
    # Optional Doctor Dashboard Parameters
    workout_goal: Optional[str] = None,
    equipment: Optional[str] = None,
    target_areas: Optional[List[str]] = None,
    fitness_level: Optional[str] = None,
    workout_days: Optional[str] = None,
    session_time: Optional[str] = None,
    injuries: Optional[List[str]] = None,
    intensity: Optional[str] = None,
    force_deterministic_fallback: bool = False,
) -> Dict[str, Any]:
    """
    Main entry point for plan generation.
    - If force_deterministic_fallback is True, skip AI and use Smart Fallback.
    - If Doctor Dashboard inputs (workout_goal, etc.) are present, use AI-assisted filtering (V2).
    - Otherwise, use the legacy deterministic/fallback flow for the outsider chatbot.
    """
    profile_hash = _build_profile_hash(age, weight, height, goal, medical_conditions, diet_preference)
    
    # DOCTOR DASHBOARD PATH: If we have specific workout inputs, use Smart AI route
    if workout_goal and equipment:
        fitness_level_str = (fitness_level or "beginner").strip().lower()
        v2_filtered = _get_v2_filtered_exercises(workout_goal, equipment, target_areas, injuries, fitness_level_str)

        if force_deterministic_fallback:
            print(f"[AI Service] FORCED Deterministic Fallback for {workout_goal}...")
            fallback_tpl = _build_filtered_fallback_tpl(
                workout_goal,
                medical_conditions,
                v2_filtered,
                session_time or "",
            )
            weekly_plan = _build_weekly_templates(workout_goal, medical_conditions, fallback_tpl, {}, workout_days or "")
            return {
                "profile_hash": profile_hash,
                "plan": {
                    "schema_version": 2,
                    "goal": _normalize_goal(workout_goal),
                    "sched": weekly_plan["sched"],
                    "tpl": weekly_plan["tpl"],
                    "diet": _build_demo_diet(age, weight, height, goal, medical_conditions, diet_preference),
                    "allowed_exercises": v2_filtered,
                    "notes": (
                        f"High-Precision Optimized Plan ({fitness_level}). Frequency: {workout_days}. "
                        f"Generated via NutriFit Smart-Engine."
                    ),
                }
            }

        print(f"[AI Service] Using Smart V2 Filter Route for Doctor Dashboard...")
        
        # 2. Build AI Prompt for LLM
        # We allow the AI to use any of the up to 30 returned exercises for both A and B
        a_candidates = v2_filtered
        b_candidates = v2_filtered
        
        if not v2_filtered:
            # Emergency fallback if filtering yielded nothing
            print("[AI Service] EMERGENCY: Smart filtering returned zero exercises. Using fallback.")
            return {
                "profile_hash": profile_hash,
                "plan": _build_fallback_plan(age, weight, height, goal, medical_conditions, diet_preference, workout_days or ""),
            }

        prompt = _build_doctor_tpl_prompt(
            goal=workout_goal,
            level=fitness_level or "Beginner",
            days=workout_days or "3 days/week",
            time=session_time or "20-30 min",
            muscles=", ".join(target_areas) if target_areas else "Full Body",
            equipment=equipment,
            injury=", ".join(injuries) if injuries else "None",
            filtered_exercises=v2_filtered
        )
        
        last_error = None
        DOCTOR_MODEL = _MODEL_NAME
        
        for attempt in range(3):
            try:
                print(f"[AI Service] Calling Doctor AI ({DOCTOR_MODEL}) (Attempt {attempt + 1}/3)...")
                response = client.chat.completions.create(
                    model=DOCTOR_MODEL,
                    messages=[
                        {"role": "system", "content": "You are a rigid API engine. You MUST output exclusively raw JSON. Do NOT include markdown blocks, pleasantries, or conversational text. Ever."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,
                )
                
                if not response.choices:
                    last_error = "Empty choices in provider response"
                    print(f"[AI Service] Attempt {attempt+1} FAILED: Empty choices in response.")
                    continue
                    
                raw_ai = _extract_response_text(response.choices[0].message)
                print(f"[AI Service] Raw Output (Attempt {attempt + 1}): {raw_ai[:300]}...")
                
                if not raw_ai.strip():
                    last_error = "Provider returned empty message content"
                    print(f"[AI Service] Attempt {attempt+1} FAILED: AI returned an empty string.")
                    continue
                
                tpl_data = _safe_parse_tpl(raw_ai, a_candidates, b_candidates)
                
                if tpl_data:
                    # Successfully generated AI templates. Now build the full 7-day schedule.
                    weekly_plan = _build_weekly_templates(workout_goal, medical_conditions, tpl_data, {}, workout_days or "")
                    return {
                        "profile_hash": profile_hash,
                        "plan": {
                            "schema_version": 2,
                            "goal": _normalize_goal(workout_goal),
                            "sched": weekly_plan["sched"],
                            "tpl": weekly_plan["tpl"],
                            "diet": _build_demo_diet(age, weight, height, goal, medical_conditions, diet_preference),
                            "allowed_exercises": v2_filtered,
                            "notes": f"Personalized plan for {fitness_level} level. Frequency: {workout_days}. Session: {session_time}."
                        }
                    }
                else:
                    last_error = "AI returned invalid JSON format (failed validation)"
                    print(f"[AI Service] Parse failed on attempt {attempt + 1}: {last_error}")
            except Exception as e:
                last_error = str(e)
                print(f"[AI Service] LLM call CRASHED on attempt {attempt + 1}: {e}")
                
        print(f"[AI Service] AI generation exhausted after 3 tries. Using filtered fallback templates. Last error: {last_error}")
        fallback_tpl = _build_filtered_fallback_tpl(
            workout_goal,
            medical_conditions,
            v2_filtered,
            session_time or "",
        )
        weekly_plan = _build_weekly_templates(workout_goal, medical_conditions, fallback_tpl, {}, workout_days or "")
        return {
            "profile_hash": profile_hash,
            "plan": {
                "schema_version": 2,
                "goal": _normalize_goal(workout_goal),
                "sched": weekly_plan["sched"],
                "tpl": weekly_plan["tpl"],
                "diet": _build_demo_diet(age, weight, height, goal, medical_conditions, diet_preference),
                "allowed_exercises": v2_filtered,
                "notes": (
                    f"Personalized plan for {fitness_level} level. Frequency: {workout_days}. "
                    f"Session: {session_time}. AI fallback used after empty or invalid provider output."
                ),
            }
        }
            
    # FALLBACK / OUTSIDER PATH: Default to deterministic logic to avoid breaking legacy chatbot
    print(f"[AI Service] Using Fallback / Deterministic Route...")
    plan = _build_fallback_plan(age, weight, height, goal, medical_conditions, diet_preference, workout_days or "")
    
    return {
        "profile_hash": profile_hash,
        "plan": plan,
    }

# Alias for compatibility
generate_compact_plan = generate_plan
