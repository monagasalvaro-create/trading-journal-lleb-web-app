from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

response = client.post("/api/sync", headers={"X-Account-ID": "80078659-1ad6-40ca-8084-51d5750ddf77"})
print("Status:", response.status_code)
print("Response:", response.text)
