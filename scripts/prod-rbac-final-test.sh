#!/bin/bash

# Production RBAC Phase 2 Final Test
# Date: 2025-09-09
# User: brent@perrotuertocm.cl

# Token will be provided by PM - DO NOT PRINT
TOKEN="${1:-}"

if [ -z "$TOKEN" ]; then
    echo "Error: Token required as first argument"
    echo "Usage: $0 <token>"
    exit 1
fi

LOG_DIR="logs/mcp/20250109/prod-finalization"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/test-results.log"

echo "=== PRODUCTION RBAC PHASE 2 VERIFICATION ===" | tee "$LOG_FILE"
echo "Date: $(date)" | tee -a "$LOG_FILE"
echo "Environment: Production (https://fne-lms.vercel.app)" | tee -a "$LOG_FILE"
echo "User: brent@perrotuertocm.cl" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "=== PHASE 1: Testing with Flag ON ===" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "1. Testing /api/admin/auth/is-superadmin..." | tee -a "$LOG_FILE"
echo "   Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
RESPONSE1=$(curl -sS -w "\n---\nHTTP_CODE:%{http_code}\nTIME:%{time_total}s" \
  -H "Authorization: Bearer $TOKEN" \
  "https://fne-lms.vercel.app/api/admin/auth/is-superadmin")
echo "$RESPONSE1" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "2. Testing /api/admin/roles/permissions..." | tee -a "$LOG_FILE"
echo "   Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
RESPONSE2=$(curl -sS -w "\n---\nHTTP_CODE:%{http_code}\nTIME:%{time_total}s" \
  -H "Authorization: Bearer $TOKEN" \
  "https://fne-lms.vercel.app/api/admin/roles/permissions")

# Check if response is JSON and format it
if echo "$RESPONSE2" | head -n1 | grep -q "^{"; then
    echo "$RESPONSE2" | head -n -2 | python3 -m json.tool 2>/dev/null | tee -a "$LOG_FILE" || echo "$RESPONSE2" | tee -a "$LOG_FILE"
    echo "$RESPONSE2" | tail -n2 | tee -a "$LOG_FILE"
else
    echo "$RESPONSE2" | tee -a "$LOG_FILE"
fi
echo "" | tee -a "$LOG_FILE"

echo "=== WAITING FOR FLAG TO BE DISABLED ===" | tee -a "$LOG_FILE"
echo "Please disable FEATURE_SUPERADMIN_RBAC now..." | tee -a "$LOG_FILE"
echo "Press Enter when flag is disabled and redeployed: "
read -r

echo "" | tee -a "$LOG_FILE"
echo "=== PHASE 2: Verifying Flag OFF (expecting 404) ===" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "3. Testing /api/admin/auth/is-superadmin (should be 404)..." | tee -a "$LOG_FILE"
echo "   Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
RESPONSE3=$(curl -sS -w "\n---\nHTTP_CODE:%{http_code}\nTIME:%{time_total}s" \
  "https://fne-lms.vercel.app/api/admin/auth/is-superadmin")
echo "$RESPONSE3" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "4. Testing /api/admin/roles/permissions (should be 404)..." | tee -a "$LOG_FILE"
echo "   Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
RESPONSE4=$(curl -sS -w "\n---\nHTTP_CODE:%{http_code}\nTIME:%{time_total}s" \
  "https://fne-lms.vercel.app/api/admin/roles/permissions")
echo "$RESPONSE4" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "=== TEST COMPLETE ===" | tee -a "$LOG_FILE"
echo "Completed at: $(date)" | tee -a "$LOG_FILE"
echo "Results saved to: $LOG_FILE" | tee -a "$LOG_FILE"

# Extract HTTP codes for summary
CODE1=$(echo "$RESPONSE1" | grep "HTTP_CODE:" | cut -d: -f2)
CODE2=$(echo "$RESPONSE2" | grep "HTTP_CODE:" | cut -d: -f2)
CODE3=$(echo "$RESPONSE3" | grep "HTTP_CODE:" | cut -d: -f2)
CODE4=$(echo "$RESPONSE4" | grep "HTTP_CODE:" | cut -d: -f2)

echo "" | tee -a "$LOG_FILE"
echo "=== SUMMARY ===" | tee -a "$LOG_FILE"
echo "With Flag ON:" | tee -a "$LOG_FILE"
echo "  - is-superadmin: HTTP $CODE1" | tee -a "$LOG_FILE"
echo "  - permissions: HTTP $CODE2" | tee -a "$LOG_FILE"
echo "With Flag OFF:" | tee -a "$LOG_FILE"
echo "  - is-superadmin: HTTP $CODE3" | tee -a "$LOG_FILE"
echo "  - permissions: HTTP $CODE4" | tee -a "$LOG_FILE"

# Check success criteria
if [ "$CODE1" = "200" ] && [ "$CODE2" = "200" ] && [ "$CODE3" = "404" ] && [ "$CODE4" = "404" ]; then
    echo "" | tee -a "$LOG_FILE"
    echo "✅ ALL TESTS PASSED!" | tee -a "$LOG_FILE"
else
    echo "" | tee -a "$LOG_FILE"
    echo "⚠️ SOME TESTS FAILED - Review results above" | tee -a "$LOG_FILE"
fi