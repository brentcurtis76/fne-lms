-- Migration: Fix Duplicate Notifications Bug
-- Purpose: Add idempotency key and deduplication constraints to prevent duplicate notifications
-- Date: 2025-07-22

BEGIN;

-- Step 1: Add idempotency_key column to user_notifications table
ALTER TABLE public.user_notifications 
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Step 2: Create index for efficient deduplication checks
-- This will help when checking for recent duplicate notifications
CREATE INDEX IF NOT EXISTS idx_user_notifications_dedup 
ON public.user_notifications (user_id, title, created_at DESC);

-- Step 3: Add unique constraint on idempotency_key
-- This prevents duplicate notifications with the same idempotency key
ALTER TABLE public.user_notifications 
ADD CONSTRAINT unique_notification_idempotency_key 
UNIQUE (idempotency_key);

-- Step 4: Create function to check for duplicate notifications
-- This function checks if a similar notification was created within the last minute
CREATE OR REPLACE FUNCTION check_duplicate_notification(
  p_user_id UUID,
  p_title VARCHAR,
  p_description TEXT,
  p_time_window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_notifications
    WHERE user_id = p_user_id
      AND title = p_title
      AND (description = p_description OR (description IS NULL AND p_description IS NULL))
      AND created_at > (NOW() - INTERVAL '1 second' * p_time_window_seconds)
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create function to generate idempotency key for notifications
-- This function creates a consistent key based on event type and data
CREATE OR REPLACE FUNCTION generate_notification_idempotency_key(
  p_event_type VARCHAR,
  p_event_id VARCHAR,
  p_user_id UUID,
  p_timestamp TIMESTAMP DEFAULT NOW()
) RETURNS VARCHAR AS $$
BEGIN
  -- Generate a key that includes timestamp truncated to minute to allow 
  -- for the same event to create notifications after a reasonable time
  RETURN MD5(
    COALESCE(p_event_type, 'unknown') || '-' ||
    COALESCE(p_event_id, 'none') || '-' ||
    p_user_id::TEXT || '-' ||
    DATE_TRUNC('minute', p_timestamp)::TEXT
  );
END;
$$ LANGUAGE plpgsql;

-- Step 6: Update existing notifications to have idempotency keys (for data consistency)
-- This ensures existing notifications won't conflict with new constraint
UPDATE public.user_notifications
SET idempotency_key = MD5(
  id::TEXT || '-' || 
  user_id::TEXT || '-' || 
  COALESCE(title, '') || '-' ||
  created_at::TEXT
)
WHERE idempotency_key IS NULL;

-- Step 7: Add comment explaining the deduplication strategy
COMMENT ON COLUMN public.user_notifications.idempotency_key IS 
'Unique key to prevent duplicate notifications. Generated from event type, event ID, user ID, and timestamp (truncated to minute).';

COMMENT ON FUNCTION check_duplicate_notification IS 
'Checks if a similar notification exists for the user within the specified time window (default 60 seconds).';

COMMENT ON FUNCTION generate_notification_idempotency_key IS 
'Generates a consistent idempotency key for notifications based on event data. Includes minute-level timestamp to allow same events after time passes.';

-- Step 8: Create a helper function for creating notifications with deduplication
CREATE OR REPLACE FUNCTION create_notification_safe(
  p_user_id UUID,
  p_title VARCHAR,
  p_description TEXT,
  p_category VARCHAR DEFAULT 'general',
  p_related_url VARCHAR DEFAULT NULL,
  p_importance VARCHAR DEFAULT 'normal',
  p_notification_type_id VARCHAR DEFAULT NULL,
  p_idempotency_key VARCHAR DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_final_idempotency_key VARCHAR;
BEGIN
  -- Check for recent duplicates if no idempotency key provided
  IF p_idempotency_key IS NULL THEN
    IF check_duplicate_notification(p_user_id, p_title, p_description, 60) THEN
      -- Return NULL to indicate duplicate was prevented
      RETURN NULL;
    END IF;
  END IF;
  
  -- Use provided idempotency key or generate one
  v_final_idempotency_key := COALESCE(
    p_idempotency_key,
    generate_notification_idempotency_key(
      'manual',
      MD5(p_title || COALESCE(p_description, '')),
      p_user_id
    )
  );
  
  -- Try to insert the notification
  INSERT INTO public.user_notifications (
    user_id,
    title,
    description,
    category,
    related_url,
    importance,
    notification_type_id,
    idempotency_key,
    is_read,
    created_at
  ) VALUES (
    p_user_id,
    p_title,
    p_description,
    p_category,
    p_related_url,
    p_importance,
    p_notification_type_id,
    v_final_idempotency_key,
    false,
    NOW()
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_notification_safe IS 
'Creates a notification with built-in deduplication. Returns notification ID if created, NULL if duplicate was prevented.';

COMMIT;

-- Post-migration verification queries:
-- 1. Check that idempotency_key column exists:
--    SELECT column_name FROM information_schema.columns 
--    WHERE table_name = 'user_notifications' AND column_name = 'idempotency_key';
--
-- 2. Verify unique constraint:
--    SELECT constraint_name FROM information_schema.table_constraints 
--    WHERE table_name = 'user_notifications' AND constraint_type = 'UNIQUE';
--
-- 3. Test deduplication function:
--    SELECT check_duplicate_notification('00000000-0000-0000-0000-000000000000'::uuid, 'Test', 'Test Description');