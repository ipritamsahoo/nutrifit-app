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
        {"name": "Oats with milk (50g Oats, 200ml Milk)", "type": "veg", "tags": ["low_sugar", "light"], "cal": 430},
        {"name": "Boiled eggs + toast (2 pc Eggs, 2 slices Bread)", "type": "non_veg", "tags": ["protein"], "cal": 390},
        {"name": "Poha (1 bowl, 100g)", "type": "veg", "tags": ["light"], "cal": 340},
        {"name": "Upma (1 bowl, 100g)", "type": "veg", "tags": ["light"], "cal": 330},
        {"name": "Banana + peanut butter (1 pc Banana, 1 tbsp PB)", "type": "veg", "tags": ["energy"], "cal": 220},
        {"name": "Idli + sambar (3 pc Idli, 1 bowl Sambar)", "type": "veg", "tags": ["light"], "cal": 330},
        {"name": "Dosa + chutney (2 pc Dosa, 1/2 bowl Chutney)", "type": "veg", "tags": ["light"], "cal": 350},
        {"name": "Roti + sabji (2 pc Roti, 1 bowl Veggies)", "type": "veg", "tags": ["balanced"], "cal": 380},
        {"name": "Vegetable sandwich (2 slices Bread, 50g Veggies)", "type": "veg", "tags": ["light"], "cal": 320},
        {"name": "Paneer sandwich (2 slices Bread, 40g Paneer)", "type": "veg", "tags": ["protein"], "cal": 400},
        {"name": "Boiled eggs + banana (2 pc Eggs, 1 pc Banana)", "type": "non_veg", "tags": ["protein"], "cal": 310},
        {"name": "Sprouts salad (1 bowl, 150g)", "type": "veg", "tags": ["protein"], "cal": 230},
        {"name": "Cornflakes with milk (50g Flakes, 200ml Milk)", "type": "veg", "tags": ["energy"], "cal": 320},
        {"name": "Paratha + curd (1 pc Paratha, 1 bowl Curd)", "type": "veg", "tags": ["energy"], "cal": 460},
        {"name": "Besan chilla (2 pc, 80g)", "type": "veg", "tags": ["protein"], "cal": 360}
    ],

    "lunch": [
        {"name": "Rice + dal + veg (1.5 bowl Rice, 1 bowl Dal, 1 bowl Veg)", "type": "veg", "tags": ["balanced"], "cal": 520},
        {"name": "Rice + chicken curry (1.5 bowl Rice, 150g Chicken)", "type": "non_veg", "tags": ["protein"], "cal": 690},
        {"name": "Roti + paneer (3 pc Roti, 100g Paneer)", "type": "veg", "tags": ["protein"], "cal": 620},
        {"name": "Khichdi (2 bowls, 300g)", "type": "veg", "tags": ["light"], "cal": 480},
        {"name": "Fish curry + rice (150g Fish, 1.5 bowl Rice)", "type": "non_veg", "tags": ["protein"], "cal": 600},
        {"name": "Roti + mixed veg (3 pc Roti, 1.5 bowl Veggies)", "type": "veg", "tags": ["balanced"], "cal": 540},
        {"name": "Rice + rajma (1.5 bowl Rice, 1 bowl Rajma)", "type": "veg", "tags": ["protein"], "cal": 580},
        {"name": "Rice + chole (1.5 bowl Rice, 1 bowl Chole)", "type": "veg", "tags": ["protein"], "cal": 510},
        {"name": "Grilled chicken + roti (150g Chicken, 2 pc Roti)", "type": "non_veg", "tags": ["low_fat"], "cal": 560},
        {"name": "Paneer curry + rice (100g Paneer, 1.5 bowl Rice)", "type": "veg", "tags": ["protein"], "cal": 650},
        {"name": "Egg curry + rice (2 pc Eggs, 1.5 bowl Rice)", "type": "non_veg", "tags": ["protein"], "cal": 560},
        {"name": "Vegetable pulao (2 bowls, 300g)", "type": "veg", "tags": ["energy"], "cal": 500},
        {"name": "Chicken pulao (150g Chicken, 2 bowls Rice)", "type": "non_veg", "tags": ["energy"], "cal": 680},
        {"name": "Dal + roti + salad (1 bowl Dal, 2 pc Roti, 1 bowl Salad)", "type": "veg", "tags": ["balanced"], "cal": 470},
        {"name": "Fish fry + rice (120g Fish, 1.5 bowl Rice)", "type": "non_veg", "tags": ["fried"], "cal": 720}
    ],

    "dinner": [
        {"name": "Roti + veg (2 pc Roti, 1 bowl Veggies)", "type": "veg", "tags": ["light"], "cal": 420},
        {"name": "Grilled chicken + salad (150g Chicken, 1.5 bowl Salad)", "type": "non_veg", "tags": ["low_fat"], "cal": 480},
        {"name": "Soup + salad (1 bowl Soup, 1 bowl Salad)", "type": "veg", "tags": ["low_calorie"], "cal": 320},
        {"name": "Paneer + roti (80g Paneer, 2 pc Roti)", "type": "veg", "tags": ["protein"], "cal": 540},
        {"name": "Boiled vegetables (2 bowls, 300g)", "type": "veg", "tags": ["low_calorie"], "cal": 280},
        {"name": "Dal soup (1.5 bowl, 250ml)", "type": "veg", "tags": ["light"], "cal": 350},
        {"name": "Egg omelette + roti (2 pc Eggs, 1 pc Roti)", "type": "non_veg", "tags": ["protein"], "cal": 460},
        {"name": "Vegetable khichdi (1.5 bowl, 250g)", "type": "veg", "tags": ["light"], "cal": 440},
        {"name": "Chicken soup (1 bowl, 250ml)", "type": "non_veg", "tags": ["light"], "cal": 410},
        {"name": "Paneer salad (100g Paneer, 1 bowl Salad)", "type": "veg", "tags": ["protein"], "cal": 480},
        {"name": "Grilled fish + veg (120g Fish, 1 bowl Veggies)", "type": "non_veg", "tags": ["low_fat"], "cal": 510},
        {"name": "Light pulao + raita (1.5 bowl Pulao, 1 bowl Raita)", "type": "veg", "tags": ["light"], "cal": 430},
        {"name": "Roti + egg curry (2 pc Roti, 1 bowl Egg Curry)", "type": "non_veg", "tags": ["protein"], "cal": 580}
    ],

    "snacks": [
        {"name": "Fruits (1 pc Apple/Banana)", "type": "veg", "tags": ["healthy"], "cal": 150},
        {"name": "Nuts (15-20 pc, Mixed)", "type": "veg", "tags": ["energy"], "cal": 240},
        {"name": "Boiled eggs (2 pc)", "type": "non_veg", "tags": ["protein"], "cal": 180},
        {"name": "Sprouts (1 bowl, 100g)", "type": "veg", "tags": ["protein"], "cal": 230},
        {"name": "Yogurt (1 bowl, 150ml)", "type": "veg", "tags": ["light"], "cal": 220},
        {"name": "Buttermilk (1 glass, 250ml)", "type": "veg", "tags": ["light"], "cal": 180},
        {"name": "Roasted chana (1/2 bowl, 50g)", "type": "veg", "tags": ["protein"], "cal": 210},
        {"name": "Peanut chaat (1/2 bowl, 50g)", "type": "veg", "tags": ["energy"], "cal": 260},
        {"name": "Fruit salad (1 bowl, 150g)", "type": "veg", "tags": ["healthy"], "cal": 220},
        {"name": "Protein shake (1 scoop, 30g)", "type": "veg", "tags": ["protein"], "cal": 280},
        {"name": "Boiled corn (1/2 bowl, 80g)", "type": "veg", "tags": ["light"], "cal": 190},
        {"name": "Egg sandwich (1 pc Egg, 2 slices Bread)", "type": "non_veg", "tags": ["protein"], "cal": 360}
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
        day_plan = []
        for meal, items in filtered.items():
            if not items:
                continue
            index = day % len(items)
            item = items[index]
            day_plan.append({
                "meal_type": meal,
                "name": item["name"],
                "cal": item["cal"]
            })

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
