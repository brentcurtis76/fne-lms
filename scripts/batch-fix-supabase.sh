#!/bin/bash

# Function to fix React component files
fix_react_file() {
  local file=$1
  echo "Fixing: $file"
  
  # Replace the import
  sed -i '' "s|import { supabase } from '\.\./lib/supabase'|import { useSupabaseClient } from '@supabase/auth-helpers-react'|g" "$file"
  sed -i '' 's|import { supabase } from "../lib/supabase"|import { useSupabaseClient } from "@supabase/auth-helpers-react"|g' "$file"
  sed -i '' "s|import { supabase } from '\.\./\.\./lib/supabase'|import { useSupabaseClient } from '@supabase/auth-helpers-react'|g" "$file"
  sed -i '' 's|import { supabase } from "../../lib/supabase"|import { useSupabaseClient } from "@supabase/auth-helpers-react"|g' "$file"
  
  # Add the hook after the component definition
  # This is a simple approach - might need manual adjustment for some files
  sed -i '' '/export default function [A-Za-z]*() {/,/^[[:space:]]*const/ {
    /export default function/ {
      a\
  const supabase = useSupabaseClient();
    }
  }' "$file"
  
  # Handle arrow function components
  sed -i '' '/const [A-Za-z]*: React.FC.*= () => {/,/^[[:space:]]*const/ {
    /const.*: React.FC.*= () => {/ {
      a\
  const supabase = useSupabaseClient();
    }
  }' "$file"
  
  # Handle other patterns
  sed -i '' '/const [A-Za-z]* = () => {/,/^[[:space:]]*const/ {
    /const.*= () => {/ {
      a\
  const supabase = useSupabaseClient();
    }
  }' "$file"
}

# Pages to fix
pages=(
  "pages/admin/test-session.tsx"
  "pages/quiz-reviews.tsx"
  "pages/notifications.tsx"
  "pages/expense-reports.tsx"
  "pages/contracts.tsx"
  "pages/assignments.tsx"
  "pages/debug-feedback-permissions.tsx"
  "pages/enhanced-reports.tsx"
  "pages/test-sidebar-role.tsx"
  "pages/debug-auth-enhanced.tsx"
  "pages/debug-auth.tsx"
)

# Hooks to fix
hooks=(
  "hooks/useAvatar.ts"
  "hooks/useAuth.ts"
)

# Components to fix
components=(
  "components/RoleAssignmentModal.tsx"
  "components/ConsultantAssignmentModal.tsx"
  "components/quiz/QuizReviewPanel.tsx"
  "components/assignments/SimpleGroupSubmissionModal.tsx"
  "components/RegistrationModal.tsx"
  "components/MoveLessonModal.tsx"
  "components/AssignTeachersModal.tsx"
  "components/blocks/BibliographyBlockEditor.tsx"
  "components/student/StudentBlockRenderer.tsx"
  "components/blocks/GroupAssignmentBlockEditor.tsx"
  "components/feed/PostCard.tsx"
  "components/feed/CommentThread.tsx"
)

# Contexts to fix
contexts=(
  "contexts/AvatarContext.tsx"
)

echo "Starting batch fix for Supabase imports..."

# Fix all files
for file in "${pages[@]}" "${hooks[@]}" "${components[@]}" "${contexts[@]}"; do
  if [ -f "$file" ]; then
    fix_react_file "$file"
  else
    echo "⚠️  File not found: $file"
  fi
done

echo "✅ Batch fix complete!"