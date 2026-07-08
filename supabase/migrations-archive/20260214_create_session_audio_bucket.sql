-- Create Storage Bucket for Session Audio Files
--
-- This migration creates the Supabase Storage bucket for audio session reports.
-- Audio files are uploaded when consultants create session reports via audio upload
-- or browser recording (using OpenAI Whisper for transcription + Claude for summary).
--
-- Bucket configuration:
-- - Name: session-audio
-- - Public: false (signed URLs required for access)
-- - File size limit: 25MB (26214400 bytes)
-- - Allowed MIME types: audio/mpeg, audio/wav, audio/mp4, audio/x-m4a, audio/ogg, audio/webm, audio/aac
--
-- NOTE: Storage RLS policies are NOT created in this migration because the
-- migration role does not own storage.objects. Authorization is enforced at
-- the API layer (all storage operations use createServiceRoleClient() which
-- bypasses storage RLS). The API endpoint (pages/api/sessions/[id]/audio-report.ts)
-- enforces facilitator/admin checks before any storage operation.
--
-- Date: 2026-02-14
-- Author: DB Agent (Pipeline Task 3.2)
-- Context: Audio Session Reports feature — audio upload + transcription + AI summary

-- ============================================================
-- CREATE STORAGE BUCKET (idempotent)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-audio',
  'session-audio',
  false,  -- Private bucket, requires signed URLs
  26214400,  -- 25MB max file size
  ARRAY[
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/ogg',
    'audio/webm',
    'audio/aac'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
