-- GENERA fixes F26, build A, item N85: an admin can upload a contract file.
--
-- The `contracts` store (signed contracts and the original PDFs of imported
-- contracts) had no permissive rule on storage.objects. The four restrictive
-- file_stores_boundary_* rules already say "admin only" for an upload there, but
-- a restrictive rule gives nothing on its own, so every upload was refused.
--
-- This adds ONE permissive rule: an active admin may add a file to `contracts`.
-- No read, update or delete rule is added: a contract file is opened only through
-- a five-minute link that the server signs for an active admin, and every new
-- upload has a new name, so nothing is replaced or removed. The store itself is
-- not created or changed here.

CREATE POLICY "contracts_admin_insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND public.auth_is_admin());
