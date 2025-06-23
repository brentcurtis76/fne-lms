#!/bin/bash

echo "Building and deploying user management redesign..."

# Build the project
echo "Running build..."
npm run build

if [ $? -eq 0 ]; then
    echo "Build successful!"
    
    # Git operations
    echo "Staging changes..."
    git add -A
    
    echo "Creating commit..."
    git commit -m "feat: Redesign user management interface for better UX

- Complete UI/UX redesign of user management page
- Single unified interface (removed confusing toggle between views)
- Expandable rows to show user details and actions
- Clean stats cards for filtering by status
- Better information hierarchy with avatars and badges
- All actions accessible with single click
- Mobile responsive design
- Removed 370+ lines of redundant Classic UI code
- New component: UnifiedUserManagement.tsx
- Updated CLAUDE.md with changes

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
    
    echo "Pushing to GitHub..."
    git push
    
    echo "Deployment complete!"
else
    echo "Build failed. Please fix errors before deploying."
    exit 1
fi