#!/bin/bash
# Check for pending prompts from Cowork

BRIDGE_DIR="$(dirname "$0")"
STATUS_FILE="$BRIDGE_DIR/status.json"
PROMPT_FILE="$BRIDGE_DIR/prompt.json"

if [ -f "$STATUS_FILE" ]; then
    STATUS=$(cat "$STATUS_FILE" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

    if [ "$STATUS" = "prompt_pending" ]; then
        echo "🔔 NEW PROMPT FROM COWORK!"
        echo "=========================="
        echo ""
        cat "$PROMPT_FILE"
        echo ""
        echo "=========================="
        echo "Read the prompt above and execute the task."
        echo "When done, update status.json and response.json per CLAUDE.md instructions."
    else
        echo "No pending prompts. Status: $STATUS"
    fi
else
    echo "No bridge status file found."
fi
