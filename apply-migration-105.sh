#!/bin/bash
# Apply Migration 105: Add detected_by column to debug_bugs

echo "🚀 Applying Migration 105: Add detected_by column"
echo ""

# Try using psql
if command -v psql &> /dev/null; then
    echo "Using psql to apply migration..."
    PGPASSWORD='fne2024password' psql \
        -h sxlogxqzmarhqsblxmtj.supabase.co \
        -U postgres \
        -d postgres \
        -f database/migrations/105_add_detected_by_column.sql

    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Migration applied successfully!"
    else
        echo ""
        echo "❌ Migration failed. Please apply manually."
    fi
else
    echo "❌ psql not found."
fi

echo ""
echo "📋 Manual Application Instructions:"
echo "   1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new"
echo "   2. Copy the contents of: database/migrations/105_add_detected_by_column.sql"
echo "   3. Paste into the SQL editor"
echo "   4. Click 'Run'"
echo ""
