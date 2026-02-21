-- Licitaciones Module -- Phase 1: Foundation Schema
--
-- This migration creates the complete database infrastructure for the
-- Licitaciones (public procurement) module under Ley 20.248 (SEP).
--
-- Tables created (10 new + 1 ALTER):
--   1.  feriados_chile              -- Chilean public holidays for business day calculation
--   2.  programa_bases_templates    -- Bases document templates per FNE program
--   3.  programa_evaluacion_criterios -- Technical evaluation criteria per program
--   4.  licitaciones                -- Main table with 10-state procurement state machine
--   5.  licitacion_ates             -- ATEs participating in a licitacion
--   6.  licitacion_evaluaciones     -- Criterion scores per ATE per licitacion
--   7.  licitacion_comision         -- Evaluation committee members (max 3)
--   8.  licitacion_consultas        -- ATE questions/answers during bases period
--   9.  licitacion_documentos       -- All documents (full audit trail)
--  10.  licitacion_historial        -- Audit log for all licitacion actions
--  11.  ALTER contratos             -- Add nullable licitacion_id UUID column
--
-- Indexes: 22 total
-- RLS policies: 27 total (all 10 tables have RLS enabled)
-- Triggers: 3 updated_at triggers on licitaciones, licitacion_ates, programa_bases_templates
-- Storage: licitaciones bucket (private, 25MB, PDF/Word/images)
--
-- RLS pattern:
--   admin:     FOR ALL USING (user_roles check for role_type = 'admin')
--   encargado (licitaciones): direct school_id check via user_roles
--   encargado (child tables): JOIN through licitaciones to check school_id
--   feriados_chile: public SELECT (true), admin ALL
--
-- Date: 2026-02-20
-- Author: DB Agent (Pipeline Task: Licitaciones Phase 1)
-- Source: .pipeline/current-task.md + .cc-bridge/prompt.json

-- NOTE: The encargado_licitacion enum value is added in a separate
-- preceding migration (20260220039999_add_encargado_licitacion_enum.sql)
-- because PostgreSQL requires ALTER TYPE ADD VALUE to be committed
-- before the new value can be used in the same session.

-- ============================================================
-- TABLE 1: feriados_chile
-- ============================================================

CREATE TABLE IF NOT EXISTS feriados_chile (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  nombre TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feriados_chile_fecha ON feriados_chile(fecha);
CREATE INDEX IF NOT EXISTS idx_feriados_chile_year ON feriados_chile(year);

COMMENT ON TABLE feriados_chile IS 'Chilean public holidays used for business day calculation in licitaciones timeline';

-- ============================================================
-- TABLE 2: programa_bases_templates
-- ============================================================

CREATE TABLE IF NOT EXISTS programa_bases_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  programa_id TEXT NOT NULL,
  nombre_servicio TEXT NOT NULL,
  objetivo TEXT NOT NULL,
  objetivos_especificos JSONB NOT NULL DEFAULT '[]',
  especificaciones_admin JSONB NOT NULL DEFAULT '{}',
  resultados_esperados JSONB NOT NULL DEFAULT '[]',
  requisitos_ate JSONB NOT NULL DEFAULT '[]',
  documentos_adjuntar JSONB NOT NULL DEFAULT '[]',
  condiciones_pago TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: programa_id is TEXT (not UUID) because programas.id is UUID stored as text.
-- No FK constraint is added here -- validate at the application layer.

CREATE INDEX IF NOT EXISTS idx_programa_bases_templates_programa ON programa_bases_templates(programa_id);
CREATE INDEX IF NOT EXISTS idx_programa_bases_templates_active ON programa_bases_templates(programa_id, is_active);

COMMENT ON TABLE programa_bases_templates IS 'Per-program Bases document templates with section content for licitacion document generation';

-- ============================================================
-- TABLE 3: programa_evaluacion_criterios
-- ============================================================

CREATE TABLE IF NOT EXISTS programa_evaluacion_criterios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  programa_id TEXT NOT NULL,
  nombre_criterio TEXT NOT NULL,
  puntaje_maximo NUMERIC NOT NULL CHECK (puntaje_maximo > 0),
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: programa_id is TEXT -- no FK constraint. Validate at application layer.

CREATE INDEX IF NOT EXISTS idx_programa_eval_criterios_programa ON programa_evaluacion_criterios(programa_id);

COMMENT ON TABLE programa_evaluacion_criterios IS 'Technical evaluation sub-criteria per FNE program. Points must sum to 100 per program. Weight split (tech/econ) is set per-licitacion, not here.';

-- ============================================================
-- TABLE 4: licitaciones (core table -- 10-state state machine)
-- ============================================================

CREATE TABLE IF NOT EXISTS licitaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_licitacion TEXT NOT NULL,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  cliente_id TEXT NOT NULL,
  programa_id TEXT NOT NULL,
  nombre_licitacion TEXT NOT NULL,
  year INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN (
    'borrador',
    'publicacion_pendiente',
    'recepcion_bases_pendiente',
    'propuestas_pendientes',
    'evaluacion_pendiente',
    'adjudicacion_pendiente',
    'contrato_pendiente',
    'contrato_generado',
    'adjudicada_externo',
    'cerrada'
  )),
  email_licitacion TEXT NOT NULL,
  monto_minimo NUMERIC NOT NULL CHECK (monto_minimo >= 0),
  monto_maximo NUMERIC NOT NULL CHECK (monto_maximo >= 0),
  tipo_moneda TEXT NOT NULL DEFAULT 'UF' CHECK (tipo_moneda IN ('UF', 'CLP')),
  duracion_minima TEXT NOT NULL,
  duracion_maxima TEXT NOT NULL,
  peso_evaluacion_tecnica INTEGER NOT NULL CHECK (peso_evaluacion_tecnica BETWEEN 1 AND 99),
  peso_evaluacion_economica INTEGER NOT NULL CHECK (peso_evaluacion_economica BETWEEN 1 AND 99),
  participantes_estimados INTEGER,
  modalidad_preferida TEXT,
  fecha_publicacion DATE,
  fecha_limite_solicitud_bases DATE,
  fecha_limite_consultas DATE,
  fecha_inicio_propuestas DATE,
  fecha_limite_propuestas DATE,
  fecha_limite_evaluacion DATE,
  fecha_adjudicacion DATE,
  ganador_ate_id UUID,
  ganador_es_fne BOOLEAN,
  contrato_id UUID,
  publicacion_imagen_url TEXT,
  bases_documento_url TEXT,
  evaluacion_pdf_url TEXT,
  carta_adjudicacion_url TEXT,
  monto_adjudicado_uf NUMERIC,
  condiciones_pago TEXT,
  fecha_oferta_ganadora DATE,
  contacto_coordinacion_nombre TEXT,
  contacto_coordinacion_email TEXT,
  contacto_coordinacion_telefono TEXT,
  hora_inicio_evaluacion TEXT,
  hora_fin_evaluacion TEXT,
  notas TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT licitaciones_monto_check CHECK (monto_maximo >= monto_minimo),
  CONSTRAINT licitaciones_peso_check CHECK (peso_evaluacion_tecnica + peso_evaluacion_economica = 100)
);

-- NOTE: cliente_id and programa_id are TEXT (UUIDs stored as text in existing schema).
-- No FK constraints -- validate at application layer.
-- school_id IS an integer FK to schools(id) -- correct.

CREATE UNIQUE INDEX IF NOT EXISTS idx_licitaciones_numero ON licitaciones(numero_licitacion);
CREATE INDEX IF NOT EXISTS idx_licitaciones_school ON licitaciones(school_id);
CREATE INDEX IF NOT EXISTS idx_licitaciones_programa ON licitaciones(programa_id);
CREATE INDEX IF NOT EXISTS idx_licitaciones_estado ON licitaciones(estado);
CREATE INDEX IF NOT EXISTS idx_licitaciones_year ON licitaciones(year);
-- Partial unique index: prevents duplicate ACTIVE licitaciones (same school/program/year).
-- Closed and externally-awarded licitaciones are excluded (historical records allowed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_licitaciones_school_programa_year
  ON licitaciones(school_id, programa_id, year)
  WHERE estado NOT IN ('cerrada', 'adjudicada_externo');

COMMENT ON TABLE licitaciones IS 'Main licitacion records tracking the 10-state procurement workflow. State flow: borrador -> publicacion_pendiente -> recepcion_bases_pendiente -> propuestas_pendientes -> evaluacion_pendiente -> adjudicacion_pendiente -> contrato_pendiente -> contrato_generado/adjudicada_externo -> cerrada';

-- ============================================================
-- TABLE 5: licitacion_ates
-- ============================================================

CREATE TABLE IF NOT EXISTS licitacion_ates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacion_id UUID NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
  nombre_ate TEXT NOT NULL,
  rut_ate TEXT,
  nombre_contacto TEXT,
  email TEXT,
  telefono TEXT,
  fecha_solicitud_bases DATE,
  fecha_envio_bases DATE,
  propuesta_url TEXT,
  propuesta_filename TEXT,
  propuesta_size INTEGER,
  propuesta_mime_type TEXT,
  fecha_propuesta DATE,
  monto_propuesto NUMERIC,
  puntaje_tecnico NUMERIC,
  puntaje_economico NUMERIC,
  puntaje_tecnico_ponderado NUMERIC,
  puntaje_economico_ponderado NUMERIC,
  puntaje_total NUMERIC,
  es_ganador BOOLEAN DEFAULT false,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licitacion_ates_licitacion ON licitacion_ates(licitacion_id);
CREATE INDEX IF NOT EXISTS idx_licitacion_ates_ganador ON licitacion_ates(licitacion_id, es_ganador) WHERE es_ganador = true;

COMMENT ON TABLE licitacion_ates IS 'ATEs participating in a licitacion -- tracks bases distribution, proposals, and evaluation scores';

-- ============================================================
-- TABLE 6: licitacion_evaluaciones
-- ============================================================

CREATE TABLE IF NOT EXISTS licitacion_evaluaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacion_id UUID NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
  ate_id UUID NOT NULL REFERENCES licitacion_ates(id) ON DELETE CASCADE,
  criterio_id UUID NOT NULL REFERENCES programa_evaluacion_criterios(id),
  puntaje NUMERIC NOT NULL CHECK (puntaje >= 0),
  comentario TEXT,
  evaluado_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: criterio_id has NO ON DELETE CASCADE -- criteria should not be casually deleted.

CREATE UNIQUE INDEX IF NOT EXISTS idx_licitacion_eval_unique ON licitacion_evaluaciones(licitacion_id, ate_id, criterio_id);
CREATE INDEX IF NOT EXISTS idx_licitacion_eval_licitacion ON licitacion_evaluaciones(licitacion_id);
CREATE INDEX IF NOT EXISTS idx_licitacion_eval_ate ON licitacion_evaluaciones(ate_id);

COMMENT ON TABLE licitacion_evaluaciones IS 'Individual criterion scores per ATE per licitacion. One row per ATE x criterion combination.';

-- ============================================================
-- TABLE 7: licitacion_comision
-- ============================================================

CREATE TABLE IF NOT EXISTS licitacion_comision (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacion_id UUID NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  rut TEXT,
  cargo TEXT,
  orden INTEGER NOT NULL DEFAULT 1 CHECK (orden BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licitacion_comision_licitacion ON licitacion_comision(licitacion_id);

COMMENT ON TABLE licitacion_comision IS 'Evaluation committee members (up to 3) for the Acta de Reunion document';

-- ============================================================
-- TABLE 8: licitacion_consultas
-- ============================================================

CREATE TABLE IF NOT EXISTS licitacion_consultas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacion_id UUID NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
  ate_id UUID REFERENCES licitacion_ates(id) ON DELETE SET NULL,
  pregunta TEXT NOT NULL,
  respuesta TEXT,
  fecha_pregunta DATE,
  fecha_respuesta DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licitacion_consultas_licitacion ON licitacion_consultas(licitacion_id);

COMMENT ON TABLE licitacion_consultas IS 'Optional: ATE questions and school answers during the bases distribution period';

-- ============================================================
-- TABLE 9: licitacion_documentos
-- ============================================================

CREATE TABLE IF NOT EXISTS licitacion_documentos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacion_id UUID NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'publicacion_imagen',
    'bases_generadas',
    'bases_enviadas',
    'propuesta',
    'evaluacion_generada',
    'evaluacion_firmada',
    'carta_adjudicacion_generada',
    'carta_adjudicacion_firmada',
    'otro'
  )),
  nombre TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licitacion_documentos_licitacion ON licitacion_documentos(licitacion_id);
CREATE INDEX IF NOT EXISTS idx_licitacion_documentos_tipo ON licitacion_documentos(licitacion_id, tipo);

COMMENT ON TABLE licitacion_documentos IS 'All documents associated with a licitacion -- both system-generated and user-uploaded. Full audit trail.';

-- ============================================================
-- TABLE 10: licitacion_historial
-- ============================================================

CREATE TABLE IF NOT EXISTS licitacion_historial (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacion_id UUID NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
  accion TEXT NOT NULL,
  estado_anterior TEXT,
  estado_nuevo TEXT,
  detalles JSONB,
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licitacion_historial_licitacion ON licitacion_historial(licitacion_id);
CREATE INDEX IF NOT EXISTS idx_licitacion_historial_created ON licitacion_historial(created_at);

COMMENT ON TABLE licitacion_historial IS 'Audit log for every action on a licitacion -- status changes, uploads, edits, etc.';

-- ============================================================
-- ALTER contratos: add licitacion_id column
-- ============================================================

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS licitacion_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_licitacion_id ON contratos(licitacion_id) WHERE licitacion_id IS NOT NULL;

-- NOTE: No REFERENCES constraint from contratos.licitacion_id to licitaciones(id) is added.
-- Both tables exist now, but FK can be added in a future migration after validation.
-- Application layer enforces the link.

COMMENT ON COLUMN contratos.licitacion_id IS 'Links contract back to its originating licitacion when FNE wins the procurement';

-- ============================================================
-- ENABLE RLS ON ALL 10 NEW TABLES
-- ============================================================

ALTER TABLE feriados_chile ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa_bases_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa_evaluacion_criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacion_ates ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacion_evaluaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacion_comision ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacion_consultas ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacion_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE licitacion_historial ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ============================
-- feriados_chile (2 policies)
-- Public read for date calculations; admin-only for writes.
-- PostgreSQL RLS is permissive (OR logic): select_all grants reads,
-- admin_all grants full access to admins. No conflict.
-- ============================

CREATE POLICY "feriados_chile_select_all" ON feriados_chile
  FOR SELECT USING (true);

CREATE POLICY "feriados_chile_admin_all" ON feriados_chile
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

-- ============================
-- programa_bases_templates (2 policies)
-- ============================

CREATE POLICY "programa_bases_templates_admin_all" ON programa_bases_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "programa_bases_templates_encargado_select" ON programa_bases_templates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'encargado_licitacion'
            AND is_active = true)
  );

-- ============================
-- programa_evaluacion_criterios (2 policies)
-- ============================

CREATE POLICY "programa_eval_criterios_admin_all" ON programa_evaluacion_criterios
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "programa_eval_criterios_encargado_select" ON programa_evaluacion_criterios
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'encargado_licitacion'
            AND is_active = true)
  );

-- ============================
-- licitaciones (3 policies)
-- Encargado uses direct school_id check (licitaciones has school_id column).
-- ============================

CREATE POLICY "licitaciones_admin_all" ON licitaciones
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

-- Encargado: SELECT own school's licitaciones
CREATE POLICY "licitaciones_encargado_select" ON licitaciones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'encargado_licitacion'
            AND school_id = licitaciones.school_id
            AND is_active = true)
  );

-- Encargado: UPDATE own school's licitaciones (for uploads, date entry, evaluation)
-- No INSERT for encargado -- admin-only creates licitaciones
-- No DELETE for encargado
CREATE POLICY "licitaciones_encargado_update" ON licitaciones
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'encargado_licitacion'
            AND school_id = licitaciones.school_id
            AND is_active = true)
  );

-- ============================
-- licitacion_ates (4 policies)
-- Child table: must JOIN through licitaciones to check school_id.
-- ============================

CREATE POLICY "licitacion_ates_admin_all" ON licitacion_ates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "licitacion_ates_encargado_select" ON licitacion_ates
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_ates.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_ates_encargado_insert" ON licitacion_ates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_ates.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_ates_encargado_update" ON licitacion_ates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_ates.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

-- ============================
-- licitacion_evaluaciones (4 policies)
-- ============================

CREATE POLICY "licitacion_evaluaciones_admin_all" ON licitacion_evaluaciones
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "licitacion_evaluaciones_encargado_select" ON licitacion_evaluaciones
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_evaluaciones.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_evaluaciones_encargado_insert" ON licitacion_evaluaciones
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_evaluaciones.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_evaluaciones_encargado_update" ON licitacion_evaluaciones
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_evaluaciones.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

-- ============================
-- licitacion_comision (4 policies)
-- ============================

CREATE POLICY "licitacion_comision_admin_all" ON licitacion_comision
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "licitacion_comision_encargado_select" ON licitacion_comision
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_comision.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_comision_encargado_insert" ON licitacion_comision
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_comision.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_comision_encargado_update" ON licitacion_comision
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_comision.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

-- ============================
-- licitacion_consultas (4 policies)
-- ============================

CREATE POLICY "licitacion_consultas_admin_all" ON licitacion_consultas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "licitacion_consultas_encargado_select" ON licitacion_consultas
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_consultas.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_consultas_encargado_insert" ON licitacion_consultas
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_consultas.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_consultas_encargado_update" ON licitacion_consultas
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_consultas.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

-- ============================
-- licitacion_documentos (3 policies -- encargado cannot DELETE documents)
-- ============================

CREATE POLICY "licitacion_documentos_admin_all" ON licitacion_documentos
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "licitacion_documentos_encargado_select" ON licitacion_documentos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_documentos.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

CREATE POLICY "licitacion_documentos_encargado_insert" ON licitacion_documentos
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_documentos.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

-- ============================
-- licitacion_historial (3 policies -- encargado cannot DELETE audit entries)
-- ============================

CREATE POLICY "licitacion_historial_admin_all" ON licitacion_historial
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles
            WHERE user_id = auth.uid()
            AND role_type = 'admin'
            AND is_active = true)
  );

CREATE POLICY "licitacion_historial_encargado_select" ON licitacion_historial
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_historial.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

-- Encargados can insert history entries (their actions are logged)
CREATE POLICY "licitacion_historial_encargado_insert" ON licitacion_historial
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM licitaciones l
            JOIN user_roles ur ON ur.school_id = l.school_id
            WHERE l.id = licitacion_historial.licitacion_id
            AND ur.user_id = auth.uid()
            AND ur.role_type = 'encargado_licitacion'
            AND ur.is_active = true)
  );

-- ============================================================
-- TRIGGER FUNCTION (idempotent -- set_updated_at may already exist)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- UPDATED_AT TRIGGERS (3 tables that have updated_at columns)
-- ============================================================

CREATE TRIGGER trg_licitaciones_updated_at
  BEFORE UPDATE ON licitaciones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_licitacion_ates_updated_at
  BEFORE UPDATE ON licitacion_ates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_programa_bases_templates_updated_at
  BEFORE UPDATE ON programa_bases_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- STORAGE BUCKET: licitaciones
-- ============================================================
-- Private bucket, 25MB limit, PDF/Word/images only.
-- No storage.objects RLS policies are created here.
-- Authorization is enforced at the API layer via createServiceRoleClient().
-- This matches the pattern from 20260212020000_create_session_materials_bucket.sql.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'licitaciones',
  'licitaciones',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
