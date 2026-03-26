import os
from chat_service import _generate_plan

valid_exercises = "Push Up, Bodyweight Squat, Dumbbell Bench Press, Pull Up"
user_summary = "Goal: BUILD_MUSCLE, Equipment: WITH_EQUIPMENT, Targets: Full Body. User said: I want to build muscle; I have dumbbells."

print("Running Plan Generator...")
plan = _generate_plan(user_summary, valid_exercises)

print("Output Length:", len(plan))
if not plan:
    print("Plan is empty! There was an error.")
else:
    print("Plan generated successfully (first 500 chars):\n")
    print(plan[:500])
