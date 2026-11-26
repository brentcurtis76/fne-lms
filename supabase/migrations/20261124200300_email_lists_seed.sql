-- =============================================================================
-- 20261124200300_email_lists_seed.sql — Correos release 1: the two day-one lists
--
-- Host seed data, kept in its own file so the email kit can leave it out.
-- Running this statement again creates nothing: the conflict target is the
-- unique key email_lists_name_key on name_norm, which the database keeps as
-- lower(btrim(name)), so a list with the same name in any letter case or
-- spacing already counts as present (and is left exactly as it is).
-- created_by is NULL: the migration, not an admin.
-- =============================================================================

INSERT INTO public.email_lists (name, description, is_public)
VALUES
  ('Boletín general', NULL, true),
  ('Directivos', NULL, false)
ON CONFLICT (name_norm) DO NOTHING;
