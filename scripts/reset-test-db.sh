#!/bin/bash

echo "🔄 Resetting local test database..."

# Reset the database (this will re-run migrations)
supabase db reset --local

# Set up storage buckets
echo "📦 Setting up storage buckets..."
node scripts/setup-test-buckets.js

echo "✅ Test database reset complete!"