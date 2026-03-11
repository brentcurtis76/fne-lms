-- Proposal Generator: New Tables
-- Phase 1 Foundation — DO NOT run against production directly.
-- Apply via Supabase Dashboard > SQL Editor.
-- Author: Claude Code
-- Date: 2026-03-11

-- =====================================================================
-- 1. propuesta_fichas_servicio — MINEDUC Registered Services
-- =====================================================================
CREATE TABLE IF NOT EXISTS propuesta_fichas_servicio (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio                INTEGER UNIQUE NOT NULL,       -- MINEDUC folio number (e.g., 52244)
  nombre_servicio      TEXT NOT NULL,
  dimension            TEXT NOT NULL,                -- 'Liderazgo' | 'Gestión Pedagógica'
  categoria            TEXT NOT NULL,                -- 'Asesoría' | 'Capacitación'
  horas_presenciales   INTEGER NOT NULL,
  horas_no_presenciales INTEGER DEFAULT 0,
  total_horas          INTEGER NOT NULL,
  destinatarios        TEXT[] NOT NULL,              -- ['Docentes', 'Directores', 'Sostenedores', ...]
  objetivo_general     TEXT,
  metodologia          TEXT,
  equipo_trabajo       JSONB,                        -- [{nombre, formacion, anos_experiencia}]
  fecha_inscripcion    DATE,
  activo               BOOLEAN DEFAULT true,
  created_at           TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE propuesta_fichas_servicio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON propuesta_fichas_servicio
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')
  );

-- =====================================================================
-- 2. propuesta_consultores — Consultant Library
-- =====================================================================
CREATE TABLE IF NOT EXISTS propuesta_consultores (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                   TEXT NOT NULL,            -- "Arnoldo Cisternas Chávez"
  titulo                   TEXT NOT NULL,            -- "Director del Programa y Asesor Directivo"
  categoria                TEXT NOT NULL,            -- 'comite_internacional' | 'equipo_fne' | 'asesor_internacional'
  perfil_profesional       TEXT,                     -- Rich text bio
  formacion_academica      JSONB,                    -- [{year, institution, degree}]
  experiencia_profesional  JSONB,                    -- [{empresa, cargo, funcion}]
  referencias              JSONB,                    -- [{nombre, cargo, empresa, telefono, periodo}]
  especialidades           TEXT[],                   -- ['liderazgo', 'ABP', 'cambio cultural']
  foto_path                TEXT,                     -- Supabase storage PATH (not URL)
  cv_pdf_path              TEXT,                     -- Supabase storage PATH (not URL)
  activo                   BOOLEAN DEFAULT true,
  orden                    INTEGER DEFAULT 0,        -- Display order
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE propuesta_consultores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON propuesta_consultores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')
  );

-- =====================================================================
-- 3. propuesta_documentos_biblioteca — Document Library
-- =====================================================================
CREATE TABLE IF NOT EXISTS propuesta_documentos_biblioteca (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            TEXT NOT NULL,          -- "Certificado de Pertenencia"
  tipo              TEXT NOT NULL,          -- 'certificado_pertenencia' | 'evaluaciones_clientes' |
                                            -- 'carta_recomendacion' | 'ficha_servicio' | 'otro'
                                            -- NOTE: "certificado de vigencia" = "certificado de pertenencia"
  descripcion       TEXT,
  archivo_path      TEXT NOT NULL,          -- Supabase storage PATH (not URL)
  fecha_emision     DATE,
  fecha_vencimiento DATE,                   -- For certificates with expiry (30 days for pertenencia)
  activo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE propuesta_documentos_biblioteca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON propuesta_documentos_biblioteca
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')
  );

-- =====================================================================
-- 4. propuesta_contenido_bloques — Reusable Content Blocks
-- =====================================================================
CREATE TABLE IF NOT EXISTS propuesta_contenido_bloques (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave         TEXT UNIQUE NOT NULL,   -- 'modelo_consultoria', 'mec7', 'horizonte_cambio', etc.
  titulo        TEXT NOT NULL,
  contenido     JSONB NOT NULL,         -- Structured content: sections, paragraphs, bullet points
  imagenes      JSONB,                  -- [{key, path, alt}] storage paths for diagrams/infographics
  programa_tipo TEXT,                   -- NULL = universal, 'evoluciona' = only for Evoluciona
  orden         INTEGER DEFAULT 0,
  activo        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE propuesta_contenido_bloques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON propuesta_contenido_bloques
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')
  );

-- =====================================================================
-- 5. propuesta_plantillas — Proposal Templates
-- =====================================================================
CREATE TABLE IF NOT EXISTS propuesta_plantillas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                TEXT NOT NULL,          -- "Programa Evoluciona 148h"
  tipo_servicio         TEXT NOT NULL,          -- 'preparacion' | 'evoluciona' | 'custom'
  ficha_id              UUID REFERENCES propuesta_fichas_servicio(id),
  bloques_orden         TEXT[] NOT NULL,        -- ['educacion_relacional', 'modelo_consultoria', ...]
  horas_default         INTEGER,                -- 148 or 88
  configuracion_default JSONB,                  -- Default hour splits, payment terms, etc.
  activo                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE propuesta_plantillas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON propuesta_plantillas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')
  );

-- =====================================================================
-- 6. propuesta_generadas — Generated Proposals (Audit Trail)
-- =====================================================================
CREATE TABLE IF NOT EXISTS propuesta_generadas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacion_id   UUID REFERENCES licitaciones(id) ON DELETE CASCADE,
  plantilla_id    UUID REFERENCES propuesta_plantillas(id),
  ficha_id        UUID REFERENCES propuesta_fichas_servicio(id),
  configuracion   JSONB NOT NULL,       -- Full snapshot of config at generation time
                                        -- {horas, desglose, consultores_ids, precio_uf,
                                        --  forma_pago, plataforma, modulos, ...}
  consultores_ids UUID[],               -- Selected consultant UUIDs
  documentos_ids  UUID[],               -- Selected supporting document UUIDs
  archivo_path    TEXT,                 -- Supabase storage PATH (not URL)
  pdf_sha256      TEXT,                 -- Hash for integrity verification
  estado          TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'generando' | 'completada' | 'error'
  error_message   TEXT,                 -- Error details if estado = 'error'
  version         INTEGER NOT NULL DEFAULT 1,
  generado_por    UUID,                 -- auth.uid() of the generating admin
  created_at      TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_version_per_licitacion UNIQUE(licitacion_id, version)
);

ALTER TABLE propuesta_generadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_access" ON propuesta_generadas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')
  );

-- =====================================================================
-- 7. Add logo_url to schools (additive only)
-- =====================================================================
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_url TEXT;
