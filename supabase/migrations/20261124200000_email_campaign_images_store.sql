-- =============================================================================
-- 20261124200000_email_campaign_images_store.sql — Correos: the picture store
--
-- One file store for the pictures that campaigns show. Part of the generic
-- email kit (names are `email-...`); nothing here names a host table.
--
--   bucket email-campaign-images
--     public = true        a picture opens by its public address (the storage
--                          service serves public addresses without consulting
--                          row security, so no SELECT rule is needed or given;
--                          nobody can LIST the store through it)
--     file_size_limit      5 MB (5242880 bytes)
--     allowed_mime_types   image/png, image/jpeg, image/gif, image/webp
--                          (no SVG: it can carry script)
--
-- Who writes: only the server, with the service role, which bypasses row
-- security. No permissive rule is created for anyone. Because Production
-- carries permissive storage rules that the repository does not declare (see
-- 20261116178000_file_stores_boundaries.sql:7-22), three RESTRICTIVE rules
-- (TO public: visitors and signed-in people, admins included) make sure that
-- whatever permissive rule exists there, nobody but the service role inserts,
-- replaces, moves into, or deletes an object in this store. Being restrictive,
-- they only narrow; they give nothing, and they do not bite outside this
-- bucket. Reading by public address is not affected.
--
-- This file holds only storage statements (the publisher wants storage rules
-- before any file that creates triggers). Additive only: no DROP, no rename.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-campaign-images', 'email-campaign-images', true, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Email campaign images: server-only insert" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO public
  WITH CHECK (bucket_id IS DISTINCT FROM 'email-campaign-images'::text);

CREATE POLICY "Email campaign images: server-only update" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO public
  USING (bucket_id IS DISTINCT FROM 'email-campaign-images'::text)
  WITH CHECK (bucket_id IS DISTINCT FROM 'email-campaign-images'::text);

CREATE POLICY "Email campaign images: server-only delete" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO public
  USING (bucket_id IS DISTINCT FROM 'email-campaign-images'::text);
