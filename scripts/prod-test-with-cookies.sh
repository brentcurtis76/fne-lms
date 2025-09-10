#!/bin/bash

# Try with the session data from the network dump
echo "=== PRODUCTION API Test - Using Session Data ==="
echo "Date: $(date)"
echo ""

# The token from the network capture
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzYyNzkwMDA1LCJpYXQiOjE3NjI3ODY0MDUsImVtYWlsIjoiYnJlbnRAcGVycm90dWVydG9jbS5jbCIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsicm9sZXMiOlsiYWRtaW4iXX0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3NjI3ODY0MDV9XSwic2Vzc2lvbl9pZCI6IjBlMWVlMzQyLTZlMjEtNDZlYy05Y2IwLWU3Y2M0Y2RkZDRlOCIsImlzX2Fub255bW91cyI6ZmFsc2UsInN1YiI6IjRhZTE3YjIxLTg5NzctNDI1Yy1iMDVhLWNhN2NkYjhiOWRmNSJ9.fMKW5EFt0yzHJBm52pjLMNAbgJGUQMupQpXSHzNBh2Y"

# Decode the token to check expiry
echo "Token payload (base64 decoded):"
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool || echo "Could not decode"
echo ""

# Test with cookie format (how the browser sends it)
echo "Testing with cookie-based auth..."
curl -sS -w "\nHTTP Status: %{http_code}\n" \
  -H "Cookie: sb-sxlogxqzmarhqsblxmtj-auth-token.0=$TOKEN" \
  "https://fne-lms.vercel.app/api/admin/auth/is-superadmin"
echo ""

# Also try with Bearer token
echo "Testing with Bearer token..."
curl -sS -w "\nHTTP Status: %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "https://fne-lms.vercel.app/api/admin/auth/is-superadmin"
