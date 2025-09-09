-- ============================================================
-- THREADS COMPATIBILITY VIEW (ROLLBACK OPTION)
-- Date: 2025-09-05
-- Purpose: Provides backward compatibility if code rollback needed
-- ============================================================

-- This view creates a compatibility layer mapping community_threads -> message_threads
-- Only apply if rollback is required after updating code to use message_threads

CREATE OR REPLACE VIEW public.community_threads AS
SELECT 
  id,
  workspace_id,
  title,
  created_by,
  created_at,
  updated_at,
  is_pinned,
  is_locked,
  category_id,
  last_activity_at,
  metadata,
  context_type,
  context_id
FROM public.message_threads;

-- Grant same permissions as message_threads
GRANT SELECT ON public.community_threads TO authenticated;
GRANT ALL ON public.community_threads TO service_role;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Test that view works:
-- SELECT COUNT(*) FROM public.community_threads;
-- SELECT COUNT(*) FROM public.message_threads;
-- Results should match

-- ============================================================
-- ROLLBACK (Remove View)
-- ============================================================
/*
DROP VIEW IF EXISTS public.community_threads;
*/