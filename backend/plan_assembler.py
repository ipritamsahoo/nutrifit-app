"""
plan_assembler.py
=================
V2 Fitness Backend: Deterministic Workout Assembler
Expands static A/B templates into a 7-day program 
with built-in progressive overload (reps/sets).
"""

import copy

def apply_progression(exercises: list, progression_level: int) -> list:
    """
    Progression logic:
    Level 0: Base (e.g. 3x10)
    Level 1: Increase reps by 2 (e.g. 3x12)
    Level 2: Increase sets by 1 and reset reps (e.g. 4x10)
    """
    prog_exercises = copy.deepcopy(exercises)
    
    for ex in prog_exercises:
        # Default safety values if AI missed them
        sets = int(ex.get("sets", 3))
        reps = ex.get("reps", 10)
        
        # Try to parse reps if it's a string like "10-12" or "10"
        parsed_reps = 10
        if isinstance(reps, int):
            parsed_reps = reps
        elif isinstance(reps, str):
            try:
                # If range "10-12", take the lower bound "10"
                parsed_reps = int(reps.split("-")[0].strip())
            except:
                parsed_reps = 10

        if progression_level == 1:
            parsed_reps += 2
        elif progression_level == 2:
            sets += 1
            # Keep parsed_reps at base level
        
        ex["sets"] = sets
        ex["reps"] = parsed_reps
        
    return prog_exercises

def get_rest_day() -> dict:
    return {
        "exercises": [
            {
                "name": "Rest & Recovery",
                "sets": 0,
                "reps": 0,
                "target_muscle": "Full Body",
                "rest_seconds": 0
            }
        ],
        "duration_minutes": 0
    }

def expand_workout_plan(template_a, template_b) -> dict:
    """
    Pattern:
    Day 1: Workout A (Level 0)
    Day 2: Workout B (Level 0)
    Day 3: Rest
    Day 4: Workout A (Level 1)
    Day 5: Workout B (Level 1)
    Day 6: Workout A (Level 2)
    Day 7: Rest
    """
    workout_plan = {}
    
    # Catch case where AI returns {"exercises": [...]} instead of just [...]
    if isinstance(template_a, dict) and "exercises" in template_a:
        template_a = template_a["exercises"]
    elif isinstance(template_a, dict) and "name" in template_a:
        template_a = [template_a]
        
    if isinstance(template_b, dict) and "exercises" in template_b:
        template_b = template_b["exercises"]
    elif isinstance(template_b, dict) and "name" in template_b:
        template_b = [template_b]
    
    # Check if AI returned valid lists, fallback if necessary
    if not isinstance(template_a, list) or not template_a:
        template_a = [{"name": "Bodyweight Squat", "sets": 3, "reps": 10, "target_muscle": "Legs", "rest_seconds": 60}]
    if not isinstance(template_b, list) or not template_b:
        template_b = [{"name": "Push Up", "sets": 3, "reps": 10, "target_muscle": "Chest", "rest_seconds": 60}]
    
    # Ensure all items are dicts
    template_a = [e for e in template_a if isinstance(e, dict)]
    template_b = [e for e in template_b if isinstance(e, dict)]

    workout_plan["day_1"] = {
        "exercises": apply_progression(template_a, 0),
        "duration_minutes": 45
    }
    
    workout_plan["day_2"] = {
        "exercises": apply_progression(template_b, 0),
        "duration_minutes": 45
    }
    
    workout_plan["day_3"] = get_rest_day()
    
    workout_plan["day_4"] = {
        "exercises": apply_progression(template_a, 1),
        "duration_minutes": 45
    }
    
    workout_plan["day_5"] = {
        "exercises": apply_progression(template_b, 1),
        "duration_minutes": 45
    }
    
    workout_plan["day_6"] = {
        "exercises": apply_progression(template_a, 2),
        "duration_minutes": 55
    }
    
    workout_plan["day_7"] = get_rest_day()
    
    return workout_plan
