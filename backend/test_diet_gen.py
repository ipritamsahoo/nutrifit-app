import os
import sys

# Add backend to path
backend_path = r"e:\nutrifit-app\backend"
sys.path.append(backend_path)

from ai_service import _build_demo_diet

def test():
    # Test built-in selection logic
    print("Testing Veg, Build Muscle...")
    diet = _build_demo_diet(25, 80, 180, "BUILD_MUSCLE", "", "Veg")
    print("Diet Results:")
    for i in range(1, 8):
        day_key = f"day_{i}"
        meals = diet.get("days", {}).get(day_key, [])
        print(f"{day_key}: {meals}")

    print("\nTesting Non-Veg, Lose Weight...")
    diet_nv = _build_demo_diet(30, 95, 175, "LOSE_WEIGHT", "Diabetes", "Non-Veg")
    print("Diet Results (NV):")
    for i in range(1, 2): # Just one day for brevity
        day_key = f"day_{i}"
        meals = diet_nv.get("days", {}).get(day_key, [])
        print(f"{day_key}: {meals}")

if __name__ == "__main__":
    test()
