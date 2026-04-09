import requests
import json

try:
    response = requests.get("http://localhost:8000/api/trades?page=1&page_size=10")
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        print("Success. First trade sample:")
        data = response.json()
        if data['trades']:
            print(data['trades'][0])
        else:
            print("No trades found.")
    else:
        print(f"Error Response: {response.text}")
except Exception as e:
    print(f"Connection failed: {e}")
