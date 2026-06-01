-- Public staging table for "Lideres de la Generacion Tractor" signups.
-- Additive only: creates the table, indexes, trigger, and admin-only RLS policy.

CREATE TABLE IF NOT EXISTS public.tractor_signups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source              TEXT NOT NULL DEFAULT 'lideres_generacion_tractor',
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  email_normalized    TEXT NOT NULL,
  school_id           INTEGER NOT NULL REFERENCES public.schools(id),
  birth_date          DATE NOT NULL,
  profession          TEXT NOT NULL,
  role                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  consent_accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_user_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tractor_signups_role_check
    CHECK (role IN ('docente', 'equipo_directivo')),
  CONSTRAINT tractor_signups_status_check
    CHECK (status IN ('pending', 'granted', 'dismissed')),
  CONSTRAINT tractor_signups_email_normalized_check
    CHECK (email_normalized = lower(btrim(email)) AND email_normalized <> ''),
  CONSTRAINT tractor_signups_birth_date_check
    CHECK (birth_date >= DATE '1900-01-01' AND birth_date <= CURRENT_DATE)
);

ALTER TABLE public.tractor_signups ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS tractor_signups_email_normalized_uidx
  ON public.tractor_signups (email_normalized);
CREATE INDEX IF NOT EXISTS tractor_signups_status_idx
  ON public.tractor_signups (status);
CREATE INDEX IF NOT EXISTS tractor_signups_school_idx
  ON public.tractor_signups (school_id);
CREATE INDEX IF NOT EXISTS tractor_signups_created_idx
  ON public.tractor_signups (created_at DESC);
CREATE INDEX IF NOT EXISTS tractor_signups_source_idx
  ON public.tractor_signups (source);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_tractor_signups_updated_at'
  ) THEN
    CREATE TRIGGER trg_tractor_signups_updated_at
      BEFORE UPDATE ON public.tractor_signups
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tractor_signups'
      AND policyname = 'tractor_signups_admin_all'
  ) THEN
    CREATE POLICY tractor_signups_admin_all
      ON public.tractor_signups
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'admin'
            AND ur.is_active = true
        )
      );
  END IF;
END $$;
