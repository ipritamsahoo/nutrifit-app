import csv
import json
import os

input_file = r"e:\nutrifit-app\Verified_MuscleWiki_Data.csv"
output_file = r"e:\nutrifit-app\backend\met_values.json"

def calculate_met(muscle_group, exercise_name, equipment, difficulty):
    name = exercise_name.lower()
    muscle = muscle_group.lower()
    equip = equipment.lower()
    
    # Default MET
    met = 3.5
    
    # 1. Cardio/High Intensity check
    cardio_keywords = ["jump", "hop", "climb", "burpee", "jack", "run", "sprint", "mountain climber", "high knee"]
    if any(kw in name for kw in cardio_keywords):
        return 8.0
    
    # 2. Mobility/Stretching check
    if "mobility" in muscle or "stretch" in name or "yoga" in name or "stretching" in muscle:
        return 2.5
    if "plank" in name or "hold" in name:
        return 3.0
    
    # 3. Strength Training based on Muscle Group
    if muscle in ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"]:
        # Lower body compound or isolation
        met = 5.0
    elif muscle in ["chest", "back", "lats", "shoulders", "traps"]:
        # Upper body major
        met = 4.0
    elif muscle in ["biceps", "triceps", "forearms", "abs", "abdominals", "obliques"]:
        # Smaller muscles
        met = 3.5
    
    # 4. Equipment Adjustments
    if "barbell" in equip:
        met += 1.0
    elif "dumbbell" in equip or "kettlebell" in equip:
        met += 0.5
    elif "machine" in equip:
        met += 0.2
    elif "bodyweight" in equip:
        # Bodyweight compound can be intense
        if "squat" in name or "push up" in name or "pull up" in name or "dip" in name:
            met += 0.5
            
    # 5. Difficulty Adjustments
    diff = difficulty.lower()
    if diff == "advanced":
        met += 0.5
    elif diff == "beginner" or diff == "novice":
        met -= 0.2
        
    return round(met, 1)

met_mapping = {}

try:
    with open(input_file, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            muscle_group = row.get("Muscle Group", "")
            exercise_name = row.get("Exercise", "")
            equipment = row.get("Equipment", "")
            difficulty = row.get("Difficulty", "")
            
            if exercise_name:
                met = calculate_met(muscle_group, exercise_name, equipment, difficulty)
                met_mapping[exercise_name] = met

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(met_mapping, f, indent=4)
        
    print(f"Successfully generated {output_file} with {len(met_mapping)} exercises.")
except Exception as e:
    print(f"Error: {e}")
