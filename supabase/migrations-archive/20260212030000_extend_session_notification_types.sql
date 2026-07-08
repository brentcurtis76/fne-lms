-- Migration: Extend session_notifications.notification_type CHECK constraint
-- Task: 2.2 — Session Notifications (Edit Requests + Reminders)
-- Date: 2026-02-12
--
-- Purpose: Add two new notification types for session reminders:
--   - session_reminder_24h: Sent 24 hours before a session
--   - session_reminder_1h: Sent 1 hour before a session
--
-- These complement the existing reminder types (1w, 2d, 30m) and enable
-- the new cron endpoint to send timely notifications to facilitators and attendees.

-- Drop the existing CHECK constraint (if it exists)
ALTER TABLE session_notifications
  DROP CONSTRAINT IF EXISTS session_notifications_notification_type_check;

-- Add the new CHECK constraint with all existing values PLUS the two new reminder types
ALTER TABLE session_notifications
  ADD CONSTRAINT session_notifications_notification_type_check
  CHECK (notification_type IN (
    'session_created',
    'session_reminder_1w',
    'session_reminder_2d',
    'session_reminder_30m',
    'session_reminder_24h',   -- NEW: 24-hour reminder
    'session_reminder_1h',    -- NEW: 1-hour reminder
    'session_rescheduled',
    'session_cancelled',
    'materials_uploaded',
    'report_shared',
    'edit_request_pending',
    'edit_request_resolved',
    'report_overdue'
  ));

-- Add a comment documenting the change
COMMENT ON CONSTRAINT session_notifications_notification_type_check ON session_notifications IS
  'Allowed notification types for session notifications. Extended 2026-02-12 to include session_reminder_24h and session_reminder_1h for the cron-based reminder system.';
