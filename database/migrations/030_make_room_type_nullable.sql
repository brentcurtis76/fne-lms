-- Migration: Make room_type nullable in pasantias_quotes table
-- Reason: When use_groups = true, room types are stored per-group in pasantias_quote_groups
--         The main pasantias_quotes.room_type field is not needed in grouped mode
-- Date: 2025-11-11

-- Remove NOT NULL constraint from room_type
-- Keep the CHECK constraint to ensure valid values when the field IS provided
ALTER TABLE pasantias_quotes
  ALTER COLUMN room_type DROP NOT NULL;

-- Verify the change
-- After this migration:
-- - room_type can be NULL (for grouped quotes)
-- - room_type must still be 'single' or 'double' when provided (CHECK constraint remains)
-- - Legacy quotes (use_groups = false) will continue to store room_type as before
