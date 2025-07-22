#!/bin/bash

echo "🚀 Pre-development environment check..."

# Run environment validation
node scripts/validate-environment.js

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Environment validation failed!"
    echo "   Please fix configuration issues before starting development."
    echo ""
    echo "🔧 Quick fixes:"
    echo "   Remove symbolic link: rm .env.local"
    echo "   Restore from backup: cp .env.local.backup .env.local"
    echo ""
    exit 1
fi

echo "✅ Environment validation passed - starting development server..."