-- Migration: Add web-specific columns to propuesta_generadas
-- Purpose: Enable public web view for proposals (dual Web+PDF system)
-- Status: PENDING — do NOT run directly. DB agent handles execution.

-- Add web-specific columns to propuesta_generadas
ALTER TABLE propuesta_generadas ADD COLUMN IF NOT EXISTS access_code VARCHAR(8) UNIQUE;
ALTER TABLE propuesta_generadas ADD COLUMN IF NOT EXISTS access_code_plain VARCHAR(8);
ALTER TABLE propuesta_generadas ADD COLUMN IF NOT EXISTS web_slug VARCHAR(64) UNIQUE;
ALTER TABLE propuesta_generadas ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
ALTER TABLE propuesta_generadas ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;
ALTER TABLE propuesta_generadas ADD COLUMN IF NOT EXISTS web_status TEXT CHECK (web_status IN ('draft', 'published', 'viewed', 'expired'));
ALTER TABLE propuesta_generadas ADD COLUMN IF NOT EXISTS snapshot_json JSONB;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_propuesta_generadas_access_code ON propuesta_generadas(access_code) WHERE access_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_propuesta_generadas_web_slug ON propuesta_generadas(web_slug) WHERE web_slug IS NOT NULL;
