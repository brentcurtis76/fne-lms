-- Create Storage Bucket for Session Materials
--
-- This migration creates the Supabase Storage bucket for session materials.
-- The bucket was also created programmatically via the Supabase API as a fallback,
-- since storage.objects ALTER/CREATE POLICY requires supabase_storage_admin role
-- which is not available to the migration role on hosted Supabase.
--
-- Bucket configuration:
-- - Name: session-materials
-- - Public: false (signed URLs required for access)
-- - File size limit: 25MB (26214400 bytes)
-- - Allowed MIME types: PDF, Word, Excel, PowerPoint, images, ZIP
--
-- NOTE: Storage RLS policies are NOT created in this migration because the
-- migration role does not own storage.objects. Authorization is enforced at
-- the API layer (all storage operations use createServiceRoleClient() which
-- bypasses storage RLS). The API endpoints enforce facilitator/admin checks
-- before any storage operation.
--
-- Date: 2026-02-12
-- Author: DB Agent (Pipeline Task 1.2)
-- Context: Session Lifecycle feature — materials upload endpoint

-- ============================================================
-- CREATE STORAGE BUCKET (idempotent)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-materials',
  'session-materials',
  false,  -- Private bucket, requires signed URLs
  26214400,  -- 25MB max file size
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
