#!/bin/bash

# Production API Verification for Phase 2 Migrations
# This script tests API endpoints to ensure proper behavior with feature flags OFF

echo "=== Production API Verification - Phase 2 ==="
echo "Date: $(date)"
echo ""

# Configuration
PROD_URL="https://fne-lms.vercel.app"
LOG_FILE="logs/mcp/20250108/api-phase2-prod.txt"

# You need to set your superadmin token here
# TOKEN="your-superadmin-token"

if [ -z "$TOKEN" ]; then
    echo "ERROR: Please set TOKEN variable with your superadmin auth token"
    echo "Example: TOKEN='eyJ...' ./scripts/verify-phase2-api.sh"
    exit 1
fi

# Initialize log file
echo "=== Production API Verification Results ===" > $LOG_FILE
echo "Date: $(date)" >> $LOG_FILE
echo "" >> $LOG_FILE

# Test 1: Superadmin Check (Should work regardless of feature flag)
echo "Test 1: Checking superadmin status endpoint..."
echo "=== Test 1: Superadmin Status ===" >> $LOG_FILE

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$PROD_URL/api/admin/auth/is-superadmin")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Response Code: $HTTP_CODE" >> $LOG_FILE
echo "Response Body: $BODY" >> $LOG_FILE

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ PASS - Superadmin check endpoint working"
    echo "Status: ✅ PASS" >> $LOG_FILE
else
    echo "❌ FAIL - Unexpected response code: $HTTP_CODE"
    echo "Status: ❌ FAIL" >> $LOG_FILE
fi

echo "" >> $LOG_FILE

# Test 2: Permissions Endpoint (Should return 404 with feature flag OFF)
echo "Test 2: Checking permissions endpoint (should be disabled)..."
echo "=== Test 2: Permissions Endpoint (Feature Flag OFF) ===" >> $LOG_FILE

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$PROD_URL/api/admin/roles/permissions")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Response Code: $HTTP_CODE" >> $LOG_FILE
echo "Response Body: $BODY" >> $LOG_FILE

if [ "$HTTP_CODE" = "404" ]; then
    echo "✅ PASS - Permissions endpoint properly disabled"
    echo "Status: ✅ PASS - Feature properly disabled" >> $LOG_FILE
elif [ "$HTTP_CODE" = "200" ]; then
    echo "⚠️  WARNING - Permissions endpoint is ACTIVE (feature flag may be ON)"
    echo "Status: ⚠️  WARNING - Feature flag may be ON" >> $LOG_FILE
    
    # Parse response to check for test mode
    IS_MOCK=$(echo "$BODY" | grep -o '"is_mock":[^,}]*' | cut -d: -f2)
    TEST_MODE=$(echo "$BODY" | grep -o '"test_mode":[^,}]*' | cut -d: -f2)
    
    echo "  is_mock: $IS_MOCK" >> $LOG_FILE
    echo "  test_mode: $TEST_MODE" >> $LOG_FILE
else
    echo "❌ UNEXPECTED - Response code: $HTTP_CODE"
    echo "Status: ❌ UNEXPECTED" >> $LOG_FILE
fi

echo "" >> $LOG_FILE

# Test 3: Overlay Endpoint (Should return 404 with feature flag OFF)
echo "Test 3: Checking overlay endpoint (should be disabled)..."
echo "=== Test 3: Overlay Endpoint (Feature Flag OFF) ===" >> $LOG_FILE

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
    -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role_type":"test","permission_key":"test","granted":true,"dry_run":true}' \
    "$PROD_URL/api/admin/roles/permissions/overlay")

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE:")

echo "Response Code: $HTTP_CODE" >> $LOG_FILE
echo "Response Body: $BODY" >> $LOG_FILE

if [ "$HTTP_CODE" = "404" ]; then
    echo "✅ PASS - Overlay endpoint properly disabled"
    echo "Status: ✅ PASS - Feature properly disabled" >> $LOG_FILE
elif [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "⚠️  WARNING - Overlay endpoint is ACTIVE (feature flag may be ON)"
    echo "Status: ⚠️  WARNING - Feature flag may be ON" >> $LOG_FILE
else
    echo "❌ UNEXPECTED - Response code: $HTTP_CODE"
    echo "Status: ❌ UNEXPECTED" >> $LOG_FILE
fi

echo "" >> $LOG_FILE

# Summary
echo ""
echo "=== VERIFICATION SUMMARY ===" | tee -a $LOG_FILE
echo "Timestamp: $(date)" | tee -a $LOG_FILE

# Count results
PASS_COUNT=$(grep -c "✅ PASS" $LOG_FILE)
WARN_COUNT=$(grep -c "⚠️  WARNING" $LOG_FILE)
FAIL_COUNT=$(grep -c "❌ FAIL\|❌ UNEXPECTED" $LOG_FILE)

echo "Results: $PASS_COUNT passed, $WARN_COUNT warnings, $FAIL_COUNT failures" | tee -a $LOG_FILE

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo "Overall: ❌ FAILURES DETECTED - Review results" | tee -a $LOG_FILE
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo "Overall: ⚠️  WARNINGS - Feature may be enabled" | tee -a $LOG_FILE
else
    echo "Overall: ✅ ALL CHECKS PASSED" | tee -a $LOG_FILE
fi

echo ""
echo "Full results saved to: $LOG_FILE"
echo ""
echo "NEXT STEPS:"
echo "1. If warnings present, check feature flags in Vercel"
echo "2. Run SQL verification queries in Supabase"
echo "3. Monitor application logs for any errors"