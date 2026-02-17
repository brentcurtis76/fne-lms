#!/bin/bash
# Check bridge for any pending work (agent-agnostic)

BRIDGE_DIR="$(dirname "$0")"
STATUS_FILE="$BRIDGE_DIR/status.json"
PROMPT_FILE="$BRIDGE_DIR/prompt.json"

if [ ! -f "$STATUS_FILE" ]; then
    echo "No bridge status file found."
    exit 0
fi

STATUS=$(cat "$STATUS_FILE" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
AGENT=$(cat "$STATUS_FILE" | grep -o '"agent"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

case "$STATUS" in
    prompt_pending)
        echo "🔔 NEW TASK on the bridge (posted by: ${AGENT:-unknown})"
        echo "=========================="
        echo ""
        cat "$PROMPT_FILE"
        echo ""
        echo "=========================="
        echo "Read the prompt above and execute the task."
        ;;
    fixes_pending)
        echo "🔧 FIX REQUEST on the bridge (posted by: ${AGENT:-unknown})"
        echo "=========================="
        echo ""
        cat "$PROMPT_FILE"
        echo ""
        echo "=========================="
        echo "Read the fix request above and apply all fixes."
        ;;
    done|review_pending|fixes_complete)
        echo "📋 RESULTS READY for review (posted by: ${AGENT:-unknown})"
        echo "=========================="
        echo "Read response.json and review the results."
        ;;
    approved)
        echo "✅ APPROVED (posted by: ${AGENT:-unknown})"
        echo "=========================="
        echo "Ready for final deploy decision."
        ;;
    working)
        echo "⏳ Agent working... (${AGENT:-unknown})"
        ;;
    error)
        echo "❌ ERROR (from: ${AGENT:-unknown})"
        echo "=========================="
        cat "$STATUS_FILE"
        ;;
    *)
        echo "No pending work. Status: $STATUS"
        ;;
esac
