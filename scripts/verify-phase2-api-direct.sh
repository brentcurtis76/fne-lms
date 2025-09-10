#!/bin/bash

# Direct production API verification - Round 2 with actual prod token
# Date: 2025-09-09 14:00 PST

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYyNzkwMDA1LCJpYXQiOjE3NjI3ODY0MDUsImVtYWlsIjoiYnJlbnRAcGVycm90dWVydG9jbS5jbCIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsicm9sZXMiOlsiYWRtaW4iXX0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NjI3ODY0MDV9XSwic2Vzc2lvbl9pZCI6IjBlMWVlMzQyLTZlMjEtNDZlYy05Y2IwLWU3Y2M0Y2RkZDRlOCIsImlzX2Fub255bW91cyI6ZmFsc2UsInN1YiI6IjRhZTE3YjIxLTg5NzctNDI1Yy1iMDVhLWNhN2NkYjhiOWRmNSJ9.fMKW5EFt0yzHJBm52pjLMNAbgJGUQMupQpXSHzNBh2Y"

echo "=== PRODUCTION API Verification - Round 2 ==="
echo "Date: $(date)"
echo "User: brent@perrotuertocm.cl"
echo "Environment: Production (https://fne-lms.vercel.app)"
echo ""

echo "1. Testing /api/admin/auth/is-superadmin..."
curl -sS -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://fne-lms.vercel.app/api/admin/auth/is-superadmin" \
  | tee /tmp/prod-superadmin.json
echo ""

echo "2. Testing /api/admin/roles/permissions..."
curl -sS -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://fne-lms.vercel.app/api/admin/roles/permissions" \
  | tee /tmp/prod-permissions.json
echo ""

echo "=== Test Complete ==="
echo "Results saved to /tmp/prod-*.json"
