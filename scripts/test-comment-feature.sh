#!/bin/bash

echo "🧪 Running unit tests for Group Assignment Comment Count feature..."
echo "================================================"

# Run only the comment feature tests
npm test -- tests/workspace/groupAssignmentComments.test.tsx tests/workspace/discussionCountsIntegration.test.ts tests/workspace/discussionLinkUI.test.tsx --reporter=verbose

echo ""
echo "📊 Generating coverage report..."
npm test -- tests/workspace/*.test.{ts,tsx} --coverage --coverage.enabled=true

echo ""
echo "✅ Test run complete!"