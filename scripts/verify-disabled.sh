#!/bin/bash

echo "=== Verifying RBAC Endpoints are Disabled ==="
echo "Date: $(date)"
echo "Expected: 404 responses (feature flag OFF)"
echo ""

echo "1. Testing /api/admin/auth/is-superadmin (should be 404)..."
curl -sS -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  "https://fne-lms.vercel.app/api/admin/auth/is-superadmin"
echo ""

echo "2. Testing /api/admin/roles/permissions (should be 404)..."
curl -sS -w "\nHTTP Status: %{http_code}\nTime: %{time_total}s\n" \
  "https://fne-lms.vercel.app/api/admin/roles/permissions"
echo ""

echo "=== Verification Complete ==="
