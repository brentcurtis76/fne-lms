#!/bin/bash

echo "🔥 Warming up dev server..."
echo "This will take 5-10 minutes but speeds up development"
echo ""

# Start dev server in background
echo "Starting dev server..."
NODE_OPTIONS='--max-old-space-size=4096' npm run dev &
DEV_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 15

# Function to warm up a page
warmup_page() {
  local page=$1
  echo "⏳ Warming up $page..."
  curl -s "http://localhost:3000$page" > /dev/null 2>&1
  echo "✅ $page warmed up"
}

echo ""
echo "Pre-compiling common pages..."
echo ""

# Warm up most common pages
warmup_page "/"
warmup_page "/login"
warmup_page "/dashboard"

echo ""
echo "✅ Dev server is warmed up and ready!"
echo "   Server is running at http://localhost:3000"
echo "   Pages should load quickly now."
echo ""
echo "Press Ctrl+C to stop the dev server"
echo ""

# Keep script running and bring dev server to foreground
wait $DEV_PID
