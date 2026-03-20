import requests, base64, os
from dotenv import load_dotenv

load_dotenv()

invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions"
api_key = os.getenv("NVIDIA_API_KEY")

headers = {
  "Authorization": f"Bearer {api_key}",
  "Accept": "application/json"
}

payload = {
  "model": "google/gemma-3n-e4b-it",
  "messages": [{"role":"user","content":"stay fit"}],
  "max_tokens": 512,
  "temperature": 0.20
}

response = requests.post(invoke_url, headers=headers, json=payload)
print(f"Status: {response.status_code}")
print(response.json())
