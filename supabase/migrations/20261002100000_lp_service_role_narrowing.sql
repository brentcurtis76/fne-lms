-- W-B2c-01 G4: narrow service_role on the four learning-path tables.
--
-- Why: the baseline GRANT ALL left service_role holding TRUNCATE, REFERENCES and
-- TRIGGER on these tables. Row security does not govern TRUNCATE, so a leaked or
-- misused server key could wipe every path, assignment and progress record in
-- one statement. No application code truncates, references or adds triggers to
-- these tables through service_role; it only reads and writes rows (Brent's
-- decision, 2 Oct 2026: remove the wipe power, keep normal read/write).
--
-- Additive only: SELECT, INSERT, UPDATE and DELETE are untouched for every
-- role, as are policies, RLS enablement and the table owner.

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_paths FROM service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_path_courses FROM service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_path_assignments FROM service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_path_progress_sessions FROM service_role;
