import requests
import json

def test_api():
    url = "http://localhost:8000/generate-plan"
    payload = {
        "age": 25,
        "weight": 80,
        "height": 180,
        "goal": "BUILD_MUSCLE",
        "conditions": "None",
        "dietType": "Veg"
    }
    
    try:
        response = requests.post(url, json=payload)
        if response.status_code == 200:
            data = response.json()
            diet_json = data.get("diet_json", {})
            print("Successfully generated diet plan.")
            
            # Check day 1 meals
            day1 = diet_json.get("days", {}).get("day_1", [])
            print("\nDay 1 Meals:")
            for meal in day1:
                print(f"- {meal}")
            
            # Check if portions exist in names
            has_portions = any("(" in str(m) and ")" in str(m) for m in day1)
            if has_portions:
                print("\nSUCCESS: Portions are visible in meal names!")
            else:
                print("\nFAILURE: Portions are missing from meal names.")
                
        else:
            print(f"API Error: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"Connection Error: {e}")

if __name__ == "__main__":
    test_api()
