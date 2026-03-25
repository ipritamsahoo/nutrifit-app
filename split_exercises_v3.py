import csv
import re
import json
import os
import shutil

CSV_PATH = r"e:\nutrifit-app\Verified_MuscleWiki_Data.csv"
BASE_DIR = r"e:\nutrifit-app\backend\exercises"

# 1. Clean up old directory to start fresh
if os.path.exists(BASE_DIR):
    shutil.rmtree(BASE_DIR)
os.makedirs(BASE_DIR)

# 2. Logic to map Equipment to Category (NO_EQUIPMENT vs WITH_EQUIPMENT)
def get_equip_category(eq_raw):
    eq_clean = re.sub(r"<[^>]+>", "", eq_raw).strip()
    eq_clean = re.sub(r"\bMale\b|\bFemale\b|\|", "", eq_clean).strip()
    eq_clean = re.sub(r"\s+", " ", eq_clean).strip()
    
    lower_eq = eq_clean.lower()
    if not lower_eq or "bodyweight" in lower_eq or "yoga" in lower_eq or "cardio" in lower_eq:
        return "NO_EQUIPMENT"
    else:
        return "WITH_EQUIPMENT"

# 3. Logic to map Exercise to GOALS
def get_goals(muscle_group, exercise_name, equipment, difficulty):
    goals = set()
    eq_low = equipment.lower()
    ex_low = exercise_name.lower()
    mg_low = muscle_group.lower()

    # -- FLEXIBILITY --
    if "yoga" in eq_low or "stretch" in ex_low or "mobility" in ex_low or "yoga" in ex_low:
        goals.add("FLEXIBILITY")

    # -- LOSE_WEIGHT (Cardio, HIIT, Full Body) --
    if "cardio" in eq_low or "jumping" in ex_low or "burpee" in ex_low or "high knee" in ex_low:
        goals.add("LOSE_WEIGHT")
    # Compound bodyweight movements are also good for weight loss
    if "bodyweight" in eq_low and any(x in ex_low for x in ["squat", "lunge", "push up", "plank"]):
        goals.add("LOSE_WEIGHT")

    # -- BUILD_MUSCLE (Hypertrophy / Strength) --
    strength_equip = ["dumbbell", "barbell", "cable", "machine", "plate", "kettlebell", "vitruvian"]
    if any(e in eq_low for e in strength_equip):
        goals.add("BUILD_MUSCLE")
    # Bodyweight strength
    if "bodyweight" in eq_low and any(x in ex_low for x in ["push up", "pull up", "chin up", "dip", "pike"]):
        goals.add("BUILD_MUSCLE")

    # -- STAY_FIT (General Health - Very Broad) --
    # Most exercises labeled Beginner/Novice/Intermediate go here
    if difficulty.lower() in ["beginner", "novice", "intermediate"]:
        goals.add("STAY_FIT")
    
    # Catch-all: If it doesn't fit anywhere, put it in STAY_FIT
    if not goals:
        goals.add("STAY_FIT")
        
    return list(goals)

# 4. Map CSV into Structure
# data[goal][equipment][muscle_group] = [exercise_list]
final_data = {}

with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    for row in reader:
        mg = row.get("Muscle Group", "").strip() or "Full Body"
        ex = row.get("Exercise", "").strip()
        eq_raw = row.get("Equipment", "").strip()
        diff = row.get("Difficulty", "").strip() or "General"
        
        eq_cat = get_equip_category(eq_raw)
        goals = get_goals(mg, ex, eq_raw, diff)
        
        for goal in goals:
            if goal not in final_data: final_data[goal] = {}
            if eq_cat not in final_data[goal]: final_data[goal][eq_cat] = {}
            if mg not in final_data[goal][eq_cat]: final_data[goal][eq_cat][mg] = []
            
            final_data[goal][eq_cat][mg].append(ex)

# 5. Write to Disk
for goal, equips in final_data.items():
    goal_dir = os.path.join(BASE_DIR, goal)
    os.makedirs(goal_dir, exist_ok=True)
    
    for eq_cat, muscles in equips.items():
        eq_dir = os.path.join(goal_dir, eq_cat)
        os.makedirs(eq_dir, exist_ok=True)
        
        for mg, ex_list in muscles.items():
            filename = re.sub(r'[\\/*?:"<>|]', "_", mg) + ".json"
            filepath = os.path.join(eq_dir, filename)
            
            with open(filepath, "w", encoding="utf-8") as out:
                json.dump(ex_list, out, indent=2)

print(f"Successfully restructured exercises into {BASE_DIR}")
print(f"Goals found: {list(final_data.keys())}")
