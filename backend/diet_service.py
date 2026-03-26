"""
diet_service.py
================
Deterministic diet plan generator logic.
Uses a local dataset and rule-based filtering to ensure reliability.
"""

import random

# ---------- FOOD DATASET ----------
FOODS = {
    "breakfast": [
        {"name": "Oats with milk", "type": "veg", "tags": ["low_sugar", "light"]},
        {"name": "Boiled eggs + toast", "type": "non_veg", "tags": ["protein"]},
        {"name": "Poha", "type": "veg", "tags": ["light"]},
        {"name": "Upma", "type": "veg", "tags": ["light"]},
        {"name": "Banana + peanut butter", "type": "veg", "tags": ["energy"]},
        {"name": "Idli + sambar", "type": "veg", "tags": ["light"]},
        {"name": "Dosa + chutney", "type": "veg", "tags": ["light"]},
        {"name": "Roti + sabji", "type": "veg", "tags": ["balanced"]},
        {"name": "Vegetable sandwich", "type": "veg", "tags": ["light"]},
        {"name": "Paneer sandwich", "type": "veg", "tags": ["protein"]},
        {"name": "Boiled eggs + banana", "type": "non_veg", "tags": ["protein"]},
        {"name": "Sprouts salad", "type": "veg", "tags": ["protein"]},
        {"name": "Cornflakes with milk", "type": "veg", "tags": ["energy"]},
        {"name": "Paratha + curd", "type": "veg", "tags": ["energy"]},
        {"name": "Besan chilla", "type": "veg", "tags": ["protein"]}
    ],

    "lunch": [
        {"name": "Rice + dal + veg", "type": "veg", "tags": ["balanced"]},
        {"name": "Rice + chicken curry", "type": "non_veg", "tags": ["protein"]},
        {"name": "Roti + paneer", "type": "veg", "tags": ["protein"]},
        {"name": "Khichdi", "type": "veg", "tags": ["light"]},
        {"name": "Fish curry + rice", "type": "non_veg", "tags": ["protein"]},
        {"name": "Roti + mixed veg", "type": "veg", "tags": ["balanced"]},
        {"name": "Rice + rajma", "type": "veg", "tags": ["protein"]},
        {"name": "Rice + chole", "type": "veg", "tags": ["protein"]},
        {"name": "Grilled chicken + roti", "type": "non_veg", "tags": ["low_fat"]},
        {"name": "Paneer curry + rice", "type": "veg", "tags": ["protein"]},
        {"name": "Egg curry + rice", "type": "non_veg", "tags": ["protein"]},
        {"name": "Vegetable pulao", "type": "veg", "tags": ["energy"]},
        {"name": "Chicken pulao", "type": "non_veg", "tags": ["energy"]},
        {"name": "Dal + roti + salad", "type": "veg", "tags": ["balanced"]},
        {"name": "Fish fry + rice", "type": "non_veg", "tags": ["fried"]}
    ],

    "dinner": [
        {"name": "Roti + veg", "type": "veg", "tags": ["light"]},
        {"name": "Grilled chicken + salad", "type": "non_veg", "tags": ["low_fat"]},
        {"name": "Soup + salad", "type": "veg", "tags": ["low_calorie"]},
        {"name": "Paneer + roti", "type": "veg", "tags": ["protein"]},
        {"name": "Boiled vegetables", "type": "veg", "tags": ["low_calorie"]},
        {"name": "Dal soup", "type": "veg", "tags": ["light"]},
        {"name": "Egg omelette + roti", "type": "non_veg", "tags": ["protein"]},
        {"name": "Vegetable khichdi", "type": "veg", "tags": ["light"]},
        {"name": "Chicken soup", "type": "non_veg", "tags": ["light"]},
        {"name": "Paneer salad", "type": "veg", "tags": ["protein"]},
        {"name": "Grilled fish + veg", "type": "non_veg", "tags": ["low_fat"]},
        {"name": "Light pulao + raita", "type": "veg", "tags": ["light"]},
        {"name": "Roti + egg curry", "type": "non_veg", "tags": ["protein"]}
    ],

    "snacks": [
        {"name": "Fruits", "type": "veg", "tags": ["healthy"]},
        {"name": "Nuts", "type": "veg", "tags": ["energy"]},
        {"name": "Boiled eggs", "type": "non_veg", "tags": ["protein"]},
        {"name": "Sprouts", "type": "veg", "tags": ["protein"]},
        {"name": "Yogurt", "type": "veg", "tags": ["light"]},
        {"name": "Buttermilk", "type": "veg", "tags": ["light"]},
        {"name": "Roasted chana", "type": "veg", "tags": ["protein"]},
        {"name": "Peanut chaat", "type": "veg", "tags": ["energy"]},
        {"name": "Fruit salad", "type": "veg", "tags": ["healthy"]},
        {"name": "Protein shake", "type": "veg", "tags": ["protein"]},
        {"name": "Boiled corn", "type": "veg", "tags": ["light"]},
        {"name": "Egg sandwich", "type": "non_veg", "tags": ["protein"]}
    ]
}

def filter_foods(preference: str, restrictions: list, disease: list):
    """Filter FOODS dataset based on user criteria."""
    filtered = {}
    pref = preference.lower()
    restr = [r.lower() for r in restrictions]
    dis = [d.lower() for d in disease]

    for meal, items in FOODS.items():
        filtered_items = []

        for item in items:
            # Veg filter
            if pref == "veg" and item["type"] != "veg":
                continue

            # Disease / restriction filters
            # Note: The tags in FOODS list don't currently include 'sweet' or 'fried', 
            # but we keep the logic for future dataset expansion.
            if any(d in dis for d in ["diabetes", "diabetic"]) and "sweet" in item["tags"]:
                continue

            if "no sugar" in restr and "sweet" in item["tags"]:
                continue

            if "low oil" in restr and "fried" in item["tags"]:
                continue

            filtered_items.append(item)

        # Fallback to original items if everything was filtered out
        if not filtered_items:
            filtered_items = items

        filtered[meal] = filtered_items

    return filtered

def adjust_by_goal(filtered: dict, goal: str):
    """Adjust filtered foods based on fitness goal."""
    g = goal.lower()
    if "loss" in g:
        for meal in filtered:
            filtered[meal] = [
                item for item in filtered[meal]
                if "energy" not in item["tags"]
            ]
    elif "gain" in g:
        # future upgrade: prioritize high calorie foods
        pass

    return filtered

def generate_week_plan(filtered: dict, days=7):
    """Generate a daily plan for the specified number of days."""
    plan = {}

    # Shuffle foods for randomness
    for meal in filtered:
        random_list = list(filtered[meal])
        random.shuffle(random_list)
        filtered[meal] = random_list

    for day in range(days):
        day_plan = {}
        for meal, items in filtered.items():
            if not items:
                continue
            index = day % len(items)
            day_plan[meal] = items[index]["name"]

        plan[f"day_{day+1}"] = day_plan

    return plan

def generate_deterministic_diet(input_data: dict):
    """
    Main entry point for deterministic diet generation.
    Expected input_data keys:
        - age, gender, weight, height, goal, disease (list), preference, restrictions (list), activity, meals
    """
    disease = input_data.get("disease", [])
    if isinstance(disease, str):
        disease = [d.strip() for d in disease.split(',')]

    restrictions = input_data.get("restrictions", [])
    if isinstance(restrictions, str):
        restrictions = [r.strip() for r in restrictions.split(',')]

    filtered = filter_foods(
        preference=input_data.get("preference", "veg"),
        restrictions=restrictions,
        disease=disease
    )

    filtered = adjust_by_goal(filtered, input_data.get("goal", "Maintain"))

    weekly_plan = generate_week_plan(filtered, days=7)

    return {
        "patient_info": {
            "age": input_data.get("age"),
            "gender": input_data.get("gender"),
            "weight": input_data.get("weight"),
            "goal": input_data.get("goal"),
            "activity": input_data.get("activity")
        },
        "diet_plan": weekly_plan,
        "workout_plan": {}, # Manual diet logic doesn't include workouts
        "daily_calories_target": 2000, # Static or derived fallback
        "daily_water_liters": 3.0,
        "notes": "Generated using NutriFit Protocol (Deterministic Engine)"
    }
