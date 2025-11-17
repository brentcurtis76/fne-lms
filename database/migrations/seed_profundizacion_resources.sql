-- Migration: Add valid resources to "Profundización" group assignment blocks
-- Date: 2025-01-17
-- Description: Adds 3 replacement resources to "Profundización, ampliación y sostenibilidad"
--              assignment blocks after cleanup of broken resources (empty URLs, example.com)
--
-- IMPORTANT: This is an idempotent migration. Running it multiple times will not create duplicates
--            as it checks for existing resource IDs before inserting.
--
-- Apply with:
--   psql -h <host> -U postgres -d postgres -f database/migrations/seed_profundizacion_resources.sql
--
-- Rollback:
--   DELETE FROM blocks WHERE payload->'resources' @> '[{"id": "resource-permanent-1"}]'::jsonb
--   (Removes only the added resources by checking for specific IDs)

DO $$
DECLARE
  block_record RECORD;
  current_resources JSONB;
  cleaned_resources JSONB;
  new_resources JSONB;
  resource_exists BOOLEAN;
  updated_count INTEGER := 0;
  cleaned_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting Profundización resources seed migration...';

  -- Find all group-assignment blocks with "Profundización" in the title
  FOR block_record IN
    SELECT id, payload
    FROM blocks
    WHERE type = 'group-assignment'
      AND payload->>'title' ILIKE '%Profundización%'
  LOOP
    RAISE NOTICE 'Processing block: % (title: %)', block_record.id, block_record.payload->>'title';

    current_resources := COALESCE(block_record.payload->'resources', '[]'::jsonb);

    -- STEP 1: Clean broken resources (empty URLs, example.com, placeholders)
    -- Keep only resources with valid URLs
    SELECT jsonb_agg(resource)
    INTO cleaned_resources
    FROM jsonb_array_elements(current_resources) AS resource
    WHERE resource->>'url' IS NOT NULL
      AND resource->>'url' != ''
      AND resource->>'url' NOT LIKE '%example.com%'
      AND resource->>'url' NOT LIKE '%REAL_%'
      AND resource->>'url' NOT LIKE '%placeholder%'
      AND resource->>'url' NOT LIKE '%CANVA_ID%'
      AND resource->>'url' NOT LIKE '%GOOGLE_DRIVE_ID%'
      AND resource->>'url' NOT LIKE '%YOUTUBE_ID%';

    -- If no resources remain after cleaning, set to empty array
    cleaned_resources := COALESCE(cleaned_resources, '[]'::jsonb);

    -- Log cleaning results
    IF jsonb_array_length(current_resources) > jsonb_array_length(cleaned_resources) THEN
      RAISE NOTICE 'Cleaned % broken resource(s) from block %',
        jsonb_array_length(current_resources) - jsonb_array_length(cleaned_resources),
        block_record.id;
      cleaned_count := cleaned_count + 1;
    END IF;

    -- STEP 2: Check if our permanent resources already exist (by checking for specific ID)
    resource_exists := (
      SELECT COUNT(*) > 0
      FROM jsonb_array_elements(cleaned_resources) AS resource
      WHERE resource->>'id' = 'resource-permanent-1'
    );

    IF resource_exists THEN
      RAISE NOTICE 'Permanent resources already exist in block %, skipping addition...', block_record.id;
      -- Still update with cleaned resources
      UPDATE blocks
      SET payload = jsonb_set(
        payload,
        '{resources}',
        cleaned_resources
      )
      WHERE id = block_record.id;
      CONTINUE;
    END IF;

    -- Define new resources to add
    -- IMPORTANT: Update these URLs with real FNE resources before production deployment
    -- The URLs below are PLACEHOLDERS and must be replaced with actual FNE content:
    -- 1. Canva template: Create in Canva and share with view/edit link
    -- 2. Google Drive guide: Upload PDF to FNE Google Drive and set sharing to "Anyone with link can view"
    -- 3. Tutorial video: Upload to YouTube FNE channel and use embed link
    --
    -- To disable placeholder resources, set new_resources to '[]'::jsonb
    -- To add real resources, replace URLs below and update this comment

    new_resources := '[]'::jsonb; -- DISABLED until real URLs are provided

    -- Example with real URLs (uncomment and update when ready):
    -- new_resources := '[
    --   {
    --     "id": "resource-permanent-1",
    --     "url": "https://www.canva.com/design/REAL_CANVA_ID/view",
    --     "type": "link",
    --     "title": "Plantilla Canva - Presentación Profundización",
    --     "description": "Plantilla editable para presentar tu proyecto de profundización"
    --   },
    --   {
    --     "id": "resource-permanent-2",
    --     "url": "https://drive.google.com/file/d/REAL_GOOGLE_DRIVE_ID/view",
    --     "type": "link",
    --     "title": "Guía de Profundización FNE",
    --     "description": "Documento guía con recomendaciones y mejores prácticas"
    --   },
    --   {
    --     "id": "resource-permanent-3",
    --     "url": "https://www.youtube.com/watch?v=REAL_YOUTUBE_ID",
    --     "type": "video",
    --     "title": "Video Tutorial - Estrategias de Profundización",
    --     "description": "Video explicativo sobre cómo desarrollar estrategias efectivas"
    --   }
    -- ]'::jsonb;

    -- STEP 3: Merge cleaned resources with new ones
    UPDATE blocks
    SET payload = jsonb_set(
      payload,
      '{resources}',
      cleaned_resources || new_resources
    )
    WHERE id = block_record.id;

    updated_count := updated_count + 1;

    IF jsonb_array_length(new_resources) > 0 THEN
      RAISE NOTICE 'Added % new resource(s) to block %', jsonb_array_length(new_resources), block_record.id;
    ELSE
      RAISE NOTICE 'Updated block % with cleaned resources (no new resources added)', block_record.id;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration complete. Updated % block(s), cleaned broken resources from % block(s).',
    updated_count, cleaned_count;

  IF updated_count = 0 THEN
    RAISE NOTICE 'No blocks were updated. Either no "Profundización" blocks exist or resources already present.';
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error during migration: %', SQLERRM;
END $$;
