"""
diet_engine.py
===============
V2 Fitness Backend: Deterministic Diet Generator (0% AI)
Uses template rotation (M1, M2, M3) to create 7-day variation 
without consecutive day repetitions.
"""

import random

# ─── PREDEFINED MEAL POOLS (VEG) ────────────────────────────────────────────────────────
VEG_POOLS = {
    "breakfast": [
        {"meal": "Oatmeal with Almonds and Apple slices (M1)", "calories": 350},
        {"meal": "Poha with Peanuts and Green Peas (M2)", "calories": 320},
        {"meal": "Besan Chilla with Mint Chutney (M3)", "calories": 310},
        {"meal": "Greek Yogurt with Mixed Berries and Chia seeds (M4)", "calories": 280},
    ],
    "lunch": [
        {"meal": "Dal Tadka, Mixed Veg Salad, and Brown Rice (M1)", "calories": 450},
        {"meal": "Paneer Tikka, Roti, and Cucumber Raita (M2)", "calories": 520},
        {"meal": "Rajma Chawal with Side Salad (M3)", "calories": 480},
        {"meal": "Vegetable Quinoa Pulao with Curd (M4)", "calories": 420},
    ],
    "snacks": [
        {"meal": "Roasted Makhana and Black Coffee (M1)", "calories": 150},
        {"meal": "Handful of Mixed Nuts (Almonds, Walnuts) (M2)", "calories": 180},
        {"meal": "Apple and Peanut Butter (M3)", "calories": 200},
        {"meal": "Sprouts Salad with Lemon (M4)", "calories": 160},
    ],
    "dinner": [
        {"meal": "Tofu Stir Fry with Broccoli and Bell Peppers (M1)", "calories": 400},
        {"meal": "Palak Paneer with 2 Multigrain Rotis (M2)", "calories": 460},
        {"meal": "Moong Dal Chilla with Tomato Chutney (M3)", "calories": 380},
        {"meal": "Mixed Vegetable Soup and Sautéed Soy Chunks (M4)", "calories": 350},
    ]
}

# ─── PREDEFINED MEAL POOLS (NON-VEG) ────────────────────────────────────────────────────
NON_VEG_POOLS = {
    "breakfast": [
        {"meal": "3 Boiled Eggs with Whole Wheat Toast (M1)", "calories": 340},
        {"meal": "Bulls Eye (Sunny Side Up) with Avocado Toast (M2)", "calories": 380},
        {"meal": "Masala Omelette with Onion and Spinach (M3)", "calories": 310},
        {"meal": "Oatmeal with Protein Powder and Almonds (M4)", "calories": 350},
    ],
    "lunch": [
        {"meal": "Grilled Chicken Breast, Quinoa, and Asparagus (M1)", "calories": 550},
        {"meal": "Chicken Curry with Brown Rice and Mixed Salad (M2)", "calories": 600},
        {"meal": "Fish Tikka with 2 Rotis and Mint Chutney (M3)", "calories": 510},
        {"meal": "Egg Bhurji with Paratha and Cucumber Slices (M4)", "calories": 480},
    ],
    "snacks": [
        {"meal": "Boiled Egg Whites (3) and Green Tea (M1)", "calories": 100},
        {"meal": "Handful of Mixed Nuts (M2)", "calories": 180},
        {"meal": "Protein Shake in Water (M3)", "calories": 120},
        {"meal": "Chicken Salami Slices with Cherry Tomatoes (M4)", "calories": 190},
    ],
    "dinner": [
        {"meal": "Baked Salmon with Steam Broccoli (M1)", "calories": 450},
        {"meal": "Light Chicken Stew with Mixed Vegetables (M2)", "calories": 400},
        {"meal": "Grilled Fish and Salad (M3)", "calories": 380},
        {"meal": "Sautéed Chicken Sausage with Capsicum (M4)", "calories": 420},
    ]
}


def build_7_day_diet(is_veg: bool, target_calories: int = 2000) -> dict:
    """
    Generates a 7-day diet plan avoiding consecutive day repeats.
    Scales the meal pools to match the approximate daily target calories.
    """
    pool = VEG_POOLS if is_veg else NON_VEG_POOLS
    diet_plan = {}
    
    # Pre-calculate a simple scalar to adjust meal calories (Base is around 1300-1500)
    # We distribute: Breakfast ~25%, Lunch ~35%, Snacks ~10%, Dinner ~30%
    budget = {
        "breakfast": int(target_calories * 0.25),
        "lunch": int(target_calories * 0.35),
        "snacks": int(target_calories * 0.10),
        "dinner": int(target_calories * 0.30)
    }

    # Template rotation: Day i gets Meal index (i % 4) to ensure no consecutive repeats
    for day in range(1, 8):
        day_key = f"day_{day}"
        diet_plan[day_key] = {}
        
        # Give a little shift so M1 isn't always identical across meals on exactly the same day
        shift = day
        
        for meal_type in ["breakfast", "lunch", "snacks", "dinner"]:
            meal_list = pool[meal_type]
            # Pick a meal using modulo math + shift
            idx = (day + len(meal_list) + list(pool.keys()).index(meal_type)) % len(meal_list)
            base_meal = meal_list[idx]
            
            diet_plan[day_key][meal_type] = {
                "meal": base_meal["meal"],
                "calories": budget[meal_type] # Overriding base calories with scaled target
            }
            
    return diet_plan
