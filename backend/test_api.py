import requests
import json

url = "http://localhost:8000/chat"

payload = {
  "uid": "test_uid_123",
  "messages": [
    {
      "role": "user",
      "text": "I want to build muscle, with equipment. Target is full body, and I'm vegetarian."
    }
  ]
}

print("Testing chat endpoint...")
try:
    response = requests.post(url, json=payload)
    print("Status Code:", response.status_code)
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)
except Exception as e:
    print("Request failed:", e)
