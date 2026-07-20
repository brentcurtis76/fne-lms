# Proposal Generator — Implementation Plan (v2)

> **Feature:** Semi-personalized PDF proposal generation for licitaciones
> **Project:** GENERA (FNE-LMS)
> **Status:** Planning
> **Date:** 2026-03-11
> **Author:** Cowork (Claude) + Brent Curtis
> **Version:** 2.0 — Incorporates feedback from Gemini, Claude Code, and Codex reviews

---

## 1. Problem Statement

FNE responds to licitaciones (procurement processes) from schools across Chile. Each proposal shares ~80% of its content (FNE methodology, models, team bios, supporting documents) but requires customization of hours, pricing, consultant selection, and objectives per licitación. Today, proposals are built manually in design tools, which is slow and error-prone.

**Goal:** An admin-only interface inside the Licitaciones module that generates a professional, FNE-branded PDF proposal by combining configured variables with reusable content blocks and bundled supporting documents.

---

## 2. MINEDUC Ficha de Servicio Compliance (CRITICAL)

Proposals MUST align with the registered **Ficha de Servicio** in the MINEDUC ATE Registry to avoid compliance problems for schools. The system enforces these constraints at generation time.

### 2.1 Mandatory Alignment Fields

| Field | Ficha Source | Proposal Must Match |
|---|---|---|
| **Nombre del Servicio** | Ficha `Nombre del Servicio` | Proposal title / service name must match exactly |
| **Total Hours** | Ficha `Horas Cronológicas` | Proposal presencial + sincrónicas ≤ registered hours |
| **Destinatarios** | Ficha `Actores a los que va dirigido` | Proposal target audience must match |
| **Objetivo General** | Ficha `Objetivo General` | Proposal objective must align |
| **Metodología** | Ficha `Metodología para logro de Objetivos` | Methodology description must be consistent |
| **Consultores** | Ficha `Resumen del Equipo de Trabajo` | At least 2-3 consultants must match the Ficha's registered team |

### 2.2 Hour Classification Rule

**Horas asincrónicas (No Presenciales) must always be ABOVE AND BEYOND the horas presenciales.** The Ficha de Servicio registers "Horas Presenciales" and "Horas No Presenciales" separately. In Folio 52244, all 148 hours are registered as presencial.

- **Presenciales** = in-person sessions + online sincrónicas (synchronous counts as presencial for MINEDUC)
- **Asincrónicas** = platform hours, self-study, async content — EXTRA hours on top of registered presenciales
- The proposal hour table must clearly separate these and ensure async hours don't eat into the presencial quota

### 2.3 Validation Rules (enforced in UI)

```
RULE 1: proposal.nombre_servicio === ficha.nombre_servicio
RULE 2: proposal.horas_presenciales + proposal.horas_sincronicas <= ficha.horas_presenciales
RULE 3: proposal.horas_asincronicas are additional (not counted against ficha hours)
RULE 4: proposal.destinatarios ⊆ ficha.destinatarios
RULE 5: At least 2-3 of proposal.consultores ∈ ficha.equipo_trabajo (partial match)
RULE 6: proposal.objetivo_general aligns with ficha.objetivo_general (human review — show side-by-side comparison in UI)
RULE 7: SUM(modules[].hours) === proposal.total_hours (client-side only — not MINEDUC, prevents internal inconsistency)
```

**Important on Rule 6:** This cannot be machine-validated because it compares Spanish prose for semantic alignment, not exact match. The UI shows the Ficha's registered objective alongside the proposal objective for human review.

The UI shows **errors** (blocks generation) for Rules 1-5, and a **comparison panel** for Rule 6. Expired certificates also **block** generation (not just warn).

---

## 3. 2026 Program Redesign Context

The Evoluciona program was redesigned for 2026 with significant structural changes:

### 3.1 2025 → 2026 Changes

| Activity | 2025 Hours | 2026 Hours | Change |
|---|---|---|---|
| Plataforma de Crecimiento | 36 | 36 | Same |
| Asesoría Directiva Internacional / online | 16 | 16 | Same |
| Visita Asesor Internacional in-situ | 24 | 24 | Same |
| Asesoría Técnica Internacional / online | 32 | **16** | Reduced |
| Visita Asesor Nacional – Gestión del Cambio | 32 | **24** | Reduced |
| Taller Presencial en colegio | 8 | — | **Removed** |
| Taller Residencial G Tractor / Los Pellines | — | **24** | **New** |
| Taller Residencial G INNOVA / Los Pellines | — | **24** | **New** |
| Taller Residencial E DIRECTIVOS / Los Pellines | — | **24** | **New** |
| **TOTAL** | **148** | **188** | **+40 hrs** |

### 3.2 Key Implications

1. **Hours exceed Ficha registration** — Folio 52244 is registered for 148 hrs. The additional 40 hours (residential workshops) are above and beyond the registered presencial hours. The system flags this for human review.
2. **Fixed pricing** — 888 UF per school regardless of hour count. Value-based, not per-hour.
3. **Network/Red model** — Santa Marta is a network of 8 schools. Must handle both individual and network-level proposals.
4. **Los Pellines residential component** — Adds logistical details (accommodations, meals, transport).
5. **GENERA integration** — 2026 proposals reference the platform directly.

---

## 4. What Varies Per Proposal

| Variable | Source | Who Sets It |
|---|---|---|
| School name & logo | Licitación record (in DB) | Auto-populated |
| Service name | `programa_bases_templates` | Auto-populated from Bases |
| Objectives (general + specific) | `programa_bases_templates` | Auto-populated from Bases |
| Required documentation checklist | `programa_bases_templates.documentos_adjuntar` | Auto-populated |
| **Total hours** | Admin input | Admin configures |
| **Hour breakdown** (Presencial / Sincrónica / Asincrónica) | Admin input | Admin configures |
| **Platform access** (Plataforma de Crecimiento) | Admin toggle | Admin configures |
| **Consultants to include** | Selected from consultant library | Admin selects |
| **Price** (UF per hour, total UF, or fixed UF) | Admin input | Admin configures |
| **Pricing model** | Admin selection | `per_hour` or `fixed` (both models exist in practice) |
| **Payment terms** (% upfront, installments) | Admin input | Admin configures |
| **Service type / Program** | Admin selection | Determines which content blocks to include |
| **Year of engagement** | Admin input | Which year of the 5-year trajectory |
| **Modules / Activity schedule** | Admin configures from templates | Session details, calendar |

---

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                 GENERA Platform                      │
│                                                      │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │  Consultant Library  │  │  Content Blocks      │  │
│  │  (DB + Storage)      │  │  (DB: JSON/Markdown) │  │
│  │  - CVs (PDF)         │  │  - Modelo Consultoría│  │
│  │  - Profiles (data)   │  │  - MEC7              │  │
│  │  - Photos            │  │  - Horizonte Cambio  │  │
│  └────────┬─────────────┘  │  - Gen. Tractor      │  │
│           │                │  - Proy. INNOVA       │  │
│  ┌────────┴─────────────┐  │  - Comunidades       │  │
│  │  Document Library     │  │  - INSPIRA           │  │
│  │  (Supabase Storage)   │  │  - Plataforma        │  │
│  │  - Certificados       │  └──────────┬───────────┘  │
│  │  - Evaluaciones       │             │              │
│  │  - Cartas Recom.      │  ┌──────────┴───────────┐  │
│  │  - Ficha Servicio     │  │  Proposal Config UI   │  │
│  └────────┬──────────────┘  │  (Admin-only panel     │  │
│           │                 │   in Licitación detail)│  │
│           │                 └──────────┬────────────┘  │
│           │                            │               │
│           └────────────┬───────────────┘               │
│                        ▼                               │
│           ┌────────────────────────┐                   │
│           │  PDF Generation Engine  │                  │
│           │  (Server-side API)      │                  │
│           │                         │                  │
│           │  1. Validate config     │                  │
│           │     (MINEDUC rules)     │                  │
│           │  2. Render proposal     │                  │
│           │     body (React-PDF)    │                  │
│           │  3. Merge supporting    │                  │
│           │     docs (pdf-lib)      │                  │
│           │  4. Store in Supabase   │                  │
│           │  5. Return signed URL   │                  │
│           └─────────────────────────┘                  │
│                                                        │
│           Client-side: <PDFViewer> for instant preview  │
│           Server-side: Final generation + merge         │
└─────────────────────────────────────────────────────────┘
```

### Preview vs Generation Flow

The system supports two modes:

- **Preview (client-side):** Uses `@react-pdf/renderer`'s `<PDFViewer>` component to render the proposal body in-browser. Instant feedback as the admin adjusts configuration. Does NOT include merged supporting documents (too heavy for client-side).
- **Generate (server-side):** `POST /api/licitaciones/[id]/generate-propuesta` renders the full PDF on the server, merges supporting documents via `pdf-lib`, uploads to Supabase storage, and returns a signed URL. Configured with `maxDuration: 60` for Vercel serverless function timeout.

---

## 6. Database Schema (New Tables)

All tables use **soft deletes** (`activo BOOLEAN DEFAULT true`) to preserve historical integrity. Queries filter on `activo = true` by default. DELETE endpoints set `activo = false` rather than removing rows. This follows the `programas`-table pattern already used in the licitaciones module (as opposed to the LMS-style `deleted_*` archive tables used elsewhere in the codebase).

### 6.1 `propuesta_fichas_servicio` — MINEDUC Registered Services

```sql
CREATE TABLE propuesta_fichas_servicio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio INTEGER UNIQUE NOT NULL,       -- MINEDUC folio number (e.g., 52244)
  nombre_servicio TEXT NOT NULL,
  dimension TEXT NOT NULL,             -- 'Liderazgo' | 'Gestión Pedagógica'
  categoria TEXT NOT NULL,             -- 'Asesoría' | 'Capacitación'
  horas_presenciales INTEGER NOT NULL,
  horas_no_presenciales INTEGER DEFAULT 0,
  total_horas INTEGER NOT NULL,
  destinatarios TEXT[] NOT NULL,       -- ['Docentes', 'Directores', 'Sostenedores', ...]
  objetivo_general TEXT,
  metodologia TEXT,
  equipo_trabajo JSONB,               -- [{nombre, formacion, anos_experiencia}]
  fecha_inscripcion DATE,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Seeded with all 9 registered services from the Certificado de Pertenencia.

### 6.2 `propuesta_consultores` — Consultant Library

```sql
CREATE TABLE propuesta_consultores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,               -- "Arnoldo Cisternas Chávez"
  titulo TEXT NOT NULL,               -- "Director del Programa y Asesor Directivo"
  categoria TEXT NOT NULL,            -- 'comite_internacional' | 'equipo_fne' | 'asesor_internacional'
  perfil_profesional TEXT,            -- Rich text bio (from website/CVs)
  formacion_academica JSONB,          -- [{year, institution, degree}]
  experiencia_profesional JSONB,      -- [{empresa, cargo, funcion}]
  referencias JSONB,                  -- [{nombre, cargo, empresa, telefono, periodo}]
  especialidades TEXT[],              -- ['liderazgo', 'ABP', 'cambio cultural']
  foto_path TEXT,                     -- Supabase storage PATH (signed URL generated at download)
  cv_pdf_path TEXT,                   -- Supabase storage PATH (signed URL generated at download)
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0,           -- Display order
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 6.3 `propuesta_documentos_biblioteca` — Document Library

```sql
CREATE TABLE propuesta_documentos_biblioteca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,               -- "Certificado de Pertenencia"
  tipo TEXT NOT NULL,                 -- 'certificado_pertenencia' | 'evaluaciones_clientes' |
                                      -- 'carta_recomendacion' | 'ficha_servicio' | 'otro'
                                      -- NOTE: "certificado de vigencia" = "certificado de pertenencia"
  descripcion TEXT,
  archivo_path TEXT NOT NULL,         -- Supabase storage PATH (signed URL at download)
  fecha_emision DATE,
  fecha_vencimiento DATE,             -- For certificates with expiry (30 days for pertenencia)
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 6.4 `propuesta_contenido_bloques` — Reusable Content Blocks

```sql
CREATE TABLE propuesta_contenido_bloques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT UNIQUE NOT NULL,         -- 'modelo_consultoria', 'mec7', 'horizonte_cambio', etc.
  titulo TEXT NOT NULL,
  contenido JSONB NOT NULL,           -- Structured content: sections, paragraphs, bullet points
  imagenes JSONB,                     -- [{key, path, alt}] storage paths for diagrams/infographics
  programa_tipo TEXT,                 -- NULL = universal, 'evoluciona' = only for Evoluciona
  orden INTEGER DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 6.5 `propuesta_plantillas` — Proposal Templates

```sql
CREATE TABLE propuesta_plantillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,               -- "Programa Evoluciona 148h"
  tipo_servicio TEXT NOT NULL,        -- 'preparacion' | 'evoluciona' | 'custom'
  ficha_id UUID REFERENCES propuesta_fichas_servicio(id),  -- Links to MINEDUC registration
  bloques_orden TEXT[] NOT NULL,      -- ['educacion_relacional', 'modelo_consultoria', ...]
  horas_default INTEGER,              -- 148 or 88
  configuracion_default JSONB,        -- Default hour splits, payment terms, etc.
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 6.6 `propuesta_generadas` — Generated Proposals (Audit Trail)

```sql
CREATE TABLE propuesta_generadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licitacion_id UUID REFERENCES licitaciones(id) ON DELETE CASCADE,
  plantilla_id UUID REFERENCES propuesta_plantillas(id),
  ficha_id UUID REFERENCES propuesta_fichas_servicio(id),
  configuracion JSONB NOT NULL,       -- Full snapshot of all config at generation time
                                      -- {horas, desglose, consultores_ids, precio_uf,
                                      --  forma_pago, plataforma, modulos, ...}
  consultores_ids UUID[],             -- Selected consultants
  documentos_ids UUID[],              -- Selected supporting documents
  archivo_path TEXT,                  -- Supabase storage PATH (signed URL at download)
  pdf_sha256 TEXT,                    -- Hash for integrity verification
  estado TEXT NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'generando' | 'completada' | 'error'
  error_message TEXT,                 -- Error details if estado = 'error'
  version INTEGER NOT NULL DEFAULT 1,
  generado_por UUID,                  -- User who generated
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_version_per_licitacion UNIQUE(licitacion_id, version)
);
```

### 6.7 RLS Policies

All new tables: **admin-only full access**. No encargado access — this is an internal FNE tool.

```sql
-- Pattern for all propuesta_* tables:
CREATE POLICY "admin_full_access" ON propuesta_consultores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')
  );
```

---

## 7. PDF Design & Branding Strategy

### 7.1 FNE Brand Identity (extracted from proposals + nuevaeducacion.org)

```
BRAND PALETTE
─────────────────────────────────────────────
Primary Gold/Amber:    #FBBF24  (rgb 251, 191, 36)   — Accent, highlights, CTA buttons
Dark Charcoal:         #1A1A1A  (rgb 26, 26, 26)     — Full-bleed section backgrounds
Orange Accent:         #E87722                         — Section headers on dark backgrounds
White:                 #FFFFFF                          — Body text on dark, backgrounds
Near-Black Text:       #111827  (rgb 17, 24, 39)      — Body text on light backgrounds
Light Gray:            #E5E7EB  (rgb 229, 231, 235)   — Borders, dividers
Warm Brown:            #6B4C3B                         — Experience cards (Evaluaciones doc)
Teal-Dark:             #0F2B3C                         — Alternative dark section bg

TYPOGRAPHY
─────────────────────────────────────────────
Primary Font:          Inter (sans-serif)
Headings:              Inter Bold / Extra Bold
Body:                  Inter Regular
Accent Text:           Inter Medium Italic (for taglines)

VISUAL ELEMENTS
─────────────────────────────────────────────
Logo:                  FNE Sunflower mark (gold) + "FUNDACIÓN NUEVA EDUCACIÓN" wordmark
Decorative:            Botanical line art (leaves, vines) — used in corners and margins
Section Backgrounds:   Alternating dark (#1A1A1A) and light (#FFFFFF) full-bleed pages
Photography:           Warm-toned photos of classrooms, educators, children (stock or FNE)
Infographics:          Circle diagrams (gold rings on dark), arrow progressions (green/orange)
Page Numbers:          Bottom-center, styled "EVOLUCIONA [YEAR] – Nueva Educación" left / ## right
```

### 7.2 How We Ensure "Pretty" Output

**Approach: React-PDF with Design System**

Use `@react-pdf/renderer` (v4.3.0, already installed) to build a **component-based PDF design system**. For supporting document merge, use `pdf-lib` (needs to be installed: `npm install pdf-lib`).

```
lib/propuestas/
├── components/           # React-PDF components (the design system)
│   ├── CoverPage.tsx     # Dark bg, school logo + FNE logo, service name
│   ├── TableOfContents.tsx
│   ├── DarkSection.tsx   # Full-bleed dark bg section with white text
│   ├── LightSection.tsx  # White bg section
│   ├── ContentBlock.tsx  # Renders structured JSON content as styled PDF
│   ├── ConsultantCard.tsx# Photo + bio card for team section
│   ├── ModuleTable.tsx   # Session/module schedule table
│   ├── PricingTable.tsx  # Economic proposal table
│   ├── TimelineBar.tsx   # Visual calendar/Gantt
│   ├── BrandElements.tsx # Logo, decorative line art, page numbers
│   ├── Typography.tsx    # Heading, Body, Caption styled components
│   └── Layout.tsx        # Page margins, columns, grids
├── templates/
│   ├── EvolucionaTemplate.tsx   # Full Evoluciona proposal assembly
│   └── PreparacionTemplate.tsx  # Shorter Preparación proposal assembly
├── assets/
│   ├── fne-logo-gold.png
│   ├── fne-logo-white.png
│   ├── decorative-vine-corner.png
│   ├── decorative-leaf.png
│   └── fonts/
│       ├── Inter-Regular.ttf
│       ├── Inter-Bold.ttf
│       ├── Inter-ExtraBold.ttf
│       └── Inter-MediumItalic.ttf
├── styles.ts             # Shared StyleSheet definitions (colors, spacing)
└── generator.ts          # Main orchestrator: config → PDF buffer → merge → upload
```

**Why React-PDF:** Already a dependency. Component model enables reusable, styled blocks that match FNE brand exactly. Server-side rendering to buffer. Font registration gives pixel-perfect Inter typography.

**Infographics strategy:** The circular diagrams (MC model, MEC7) and arrow progressions (INICIA/INSPIRA/EVOLUCIONA) are **pre-rendered as high-quality PNG assets** stored in the project. They don't change between proposals — they're part of the methodology. This keeps generation simple while maintaining visual quality.

### 7.3 Page-by-Page Design Spec

```
PAGE 1 — COVER
├── Full dark background (#1A1A1A)
├── FNE sunflower logo (gold, top-left)
├── Decorative sunburst (top-right corner, outline)
├── "PROGRAMA [YEAR]" in gold
├── "[SERVICE NAME]" in white, extra-bold, large
├── School name (white, left-aligned)
├── School logo (centered, if available — graceful fallback to name-only)
├── Tagline: "La educación nueva se levanta sobre una nueva cultura relacional" (italic)
└── FNE wordmark (bottom-left)

PAGE 2 — MODELO DE EDUCACIÓN RELACIONAL
├── Gray background
├── FNE logo (white, top-right)
├── Content block: educacion_relacional
└── Large "FNE" watermark (bottom)

PAGE 3 — TABLE OF CONTENTS
├── White background
├── "contenidos" in orange, bold Inter
├── FNE logo (top-right)
├── Section list (titles only — no page numbers in v1; avoids two-pass render complexity)
└── Decorative vine (bottom-right)

PAGES 4-5 — INTRODUCTION
├── Dark background
├── "INTRODUCCIÓN" heading
├── Two-column text layout
└── Context about the school's journey

PAGES 6-20 — CONTENT BLOCKS (variable per template)
├── Alternating dark/light pages
├── Each content block renders as 1-2 pages
├── Infographic PNGs positioned inline
├── Photos with warm overlays
└── Consistent heading/body typography

PAGES 21-22 — EQUIPO CONSULTOR
├── Grid of consultant cards (2-3 per page)
├── Each card: photo (rounded), name, title, short bio
└── Only selected consultants appear

PAGES 23-24 — PROPUESTA TÉCNICA
├── Objective general + specific (from Bases)
├── Module/activity table
├── Hour breakdown (Presencial/Sincrónica/Asincrónica)
├── Calendar timeline visualization
└── Platform access section (if toggled on)

PAGE 25 — PROPUESTA ECONÓMICA
├── Pricing table: UF × hora × total OR fixed UF
├── Payment terms
├── Signature block (Arnoldo Cisternas, Representante Legal)
└── FNE contact info

PAGES 26+ — SUPPORTING DOCUMENTS (merged via pdf-lib)
├── Certificado de Pertenencia
├── CVs of selected consultants (full MINEDUC format)
├── Evaluaciones Clientes
├── Cartas de Recomendación
└── Ficha de Servicio
```

---

## 8. UI Design — Proposal Configuration Panel

### 8.1 Location

New collapsible section in the **Licitación Detail Page** (`/pages/licitaciones/[id].tsx`), visible **only to admins**. Accessible from any licitación state (proposals can be prepared early).

### 8.2 MINEDUC Compliance Panel

At the top of the configuration form, a **compliance status panel** shows the selected Ficha de Servicio's registered values alongside the configured proposal values. Violations are highlighted in red and block generation.

```
┌──────────────────────────────────────────────────────────────┐
│  ── Validación MINEDUC ─────────────────────────────────     │
│                                                              │
│  Ficha: Folio 52244 — Asesoría Integral para Desarrollar... │
│                                                              │
│  ✅ Nombre del Servicio: coincide                            │
│  ✅ Horas presenciales: 124/148 (dentro del límite)          │
│  ✅ Destinatarios: Docentes, Directores ⊆ registrados       │
│  ⚠️ Objetivo General: [Ver comparación ▼]                    │
│     Ficha: "Desarrollar una cultura de innovación..."        │
│     Propuesta: "Desarrollar una cultura de innovación..."    │
│  ✅ Consultores: 3/3 registrados en Ficha                    │
│                                                              │
│  Estado: ✅ Puede generar                                    │
└──────────────────────────────────────────────────────────────┘
```

### 8.3 Configuration Form

```
┌──────────────────────────────────────────────────────────────┐
│  GENERAR PROPUESTA FNE                              [Admin]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Plantilla: [Programa Evoluciona 148h ▼]                     │
│  Ficha de Servicio: [Folio 52244 — Asesoría Integral... ▼]  │
│                                                              │
│  ── Configuración de Horas ──────────────────────────────    │
│  Presencial:         [80     ] hrs                           │
│  Online Sincrónica:  [44     ] hrs                           │
│  Subtotal presencial: 124 hrs (de 148 registradas) ✅        │
│  Online Asincrónica: [24     ] hrs (adicionales)             │
│  Total Horas:        148 hrs (124 + 24 asíncronas)           │
│                                                              │
│  ── Plataforma de Crecimiento ───────────────────────────    │
│  [✓] Incluir acceso a Plataforma                             │
│  Beneficios: [Contenidos audiovisuales, formación cruzada,   │
│               gestión del conocimiento interna         ]     │
│                                                              │
│  ── Equipo Consultor ────────────────────────────────────    │
│  [✓] Arnoldo Cisternas — Director del Programa              │
│  [✓] Gabriela Naranjo — Directora FNE-IR Chile              │
│  [✓] Ignacio Pavéz — Director de Investigación              │
│  [ ] Andrés Bustamante — Consultor                           │
│  [ ] Joaquín Aguirre — Consultor                             │
│  [+ Agregar asesor internacional...]                         │
│                                                              │
│  ── Propuesta Económica ─────────────────────────────────    │
│  Modelo de precio:  [Por hora ▼] / [Precio fijo ▼]          │
│  Valor UF por hora:  [1.2    ] UF  (or Fixed: [888] UF)     │
│  Total:              177.6 UF (auto-calculated)              │
│  Forma de pago:      [3 cuotas iguales ▼]                    │
│  Detalle:            [33% inicio, 33% julio, 34% nov   ]    │
│                                                              │
│  ── Módulos / Actividades ───────────────────────────────    │
│  [Cargar desde plantilla] [+ Agregar módulo]                 │
│  ┌────────────────────────────────────────────────────┐     │
│  │ Módulo 1: Diagnóstico Cultural           [20 hrs] │     │
│  │ Módulo 2: Liderazgo del Cambio           [24 hrs] │     │
│  │ Módulo 3: Formación Comunidades          [32 hrs] │     │
│  │ Módulo 4: Acompañamiento Técnico         [40 hrs] │     │
│  │ Módulo 5: Visita Internacional           [16 hrs] │     │
│  │ Módulo 6: Evaluación y Cierre            [16 hrs] │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
│  ── Documentos Adjuntos ─────────────────────────────────    │
│  [✓] Certificado de Pertenencia (11-03-2026) ⚠️ Vence 10/04 │
│      (Same as Certificado de Vigencia) [Actualizar]          │
│  [✓] Evaluaciones Clientes                                   │
│  [✓] Carta Recomendación — Colegio Santa Marta              │
│  [ ] Carta Recomendación — (pendiente) [Subir]               │
│  [✓] Ficha de Servicio (Folio 52244)                         │
│  [✓] CVs de consultores seleccionados (auto)                 │
│                                                              │
│  🚫 Expired certificates BLOCK generation                    │
│                                                              │
│  ── Vista Previa ────────────────────────────────────────    │
│  [Vista Previa (solo cuerpo)]   [Generar Propuesta Final]    │
│   ↑ <PDFViewer> in-browser      ↑ Server-side + merge       │
│                                                              │
│  ── Historial ───────────────────────────────────────────    │
│  v1 — 2026-03-10 — Brent Curtis — completada [Descargar]    │
│  v2 — 2026-03-11 — Brent Curtis — completada [Descargar]    │
│  v3 — 2026-03-11 — Brent Curtis — error ❌ [Ver detalle]    │
└──────────────────────────────────────────────────────────────┘
```

### 8.4 Admin Pages (Document & Consultant Management)

Two new pages under `/admin/licitaciones/`:

**`/admin/licitaciones/consultores`** — CRUD for the consultant library
- Add/edit consultant profiles
- Upload photos and CV PDFs
- Import from website bios (one-time seed)
- Toggle active/inactive (soft delete)

**`/admin/licitaciones/documentos-propuesta`** — CRUD for document library
- Upload certificates, recommendations, evaluaciones
- Track expiry dates (warnings for nearing expiry, red for expired)
- Quick-upload directly from the proposal config UI

---

## 9. API Routes (New Endpoints)

```
# Consultant Library
GET    /api/propuestas/consultores          — List active consultants
POST   /api/propuestas/consultores          — Create consultant
PUT    /api/propuestas/consultores/[id]     — Update consultant
DELETE /api/propuestas/consultores/[id]     — Soft-delete (set activo=false)

# Document Library
GET    /api/propuestas/documentos           — List active documents
POST   /api/propuestas/documentos           — Upload document
PUT    /api/propuestas/documentos/[id]      — Update document metadata
DELETE /api/propuestas/documentos/[id]      — Soft-delete (set activo=false)

# Content Blocks
GET    /api/propuestas/bloques              — List all content blocks
PUT    /api/propuestas/bloques/[clave]      — Update content block

# Proposal Templates
GET    /api/propuestas/plantillas           — List active templates
POST   /api/propuestas/plantillas           — Create template
PUT    /api/propuestas/plantillas/[id]      — Update template

# Fichas de Servicio
GET    /api/propuestas/fichas               — List registered ATE services
PUT    /api/propuestas/fichas/[id]          — Update ficha data

# Proposal Generation
POST   /api/licitaciones/[id]/generate-propuesta  — Generate proposal PDF
GET    /api/licitaciones/[id]/propuestas          — List generated proposals
GET    /api/licitaciones/[id]/propuestas/[pid]    — Download specific proposal (signed URL)
```

All routes follow the existing auth pattern:
```typescript
// Auth → Admin check → Validation → Logic
const isAdmin = roleTypes.includes('admin');
if (!isAdmin) return res.status(403).json({ error: 'Solo administradores' });
```

### Generation Endpoint Detail

```typescript
// POST /api/licitaciones/[id]/generate-propuesta
// Config: { maxDuration: 60 } for Vercel serverless timeout

export default async function handler(req, res) {
  // 1. Auth + admin check
  // 2. Validate config against MINEDUC rules (Rules 1-5)
  //    - If expired certificates selected → 400 error
  //    - If Rule 1-5 violated → 400 with specific violations
  // 3. Create propuesta_generadas record with estado='generando'
  // 4. Fetch all data (licitación, Bases, consultants, blocks, documents)
  // 5. Render proposal body via React-PDF → Buffer
  // 6. Fetch supporting document PDFs from Supabase storage
  //    - Handle malformed/password-protected PDFs gracefully:
  //      try { PDFDocument.load(bytes) } catch → skip with warning in response
  // 7. Merge all PDFs via pdf-lib → final Buffer
  // 8. Compute SHA-256 hash
  // 9. Upload to Supabase storage
  // 10. Update propuesta_generadas: estado='completada', archivo_path, pdf_sha256
  // 11. Return { id, version, downloadUrl (signed), skippedDocs (if any) }
  //
  // On error: Update propuesta_generadas: estado='error', error_message
}
```

---

## 10. Implementation Phases

### Phase 0: Prerequisites (Parallel Workstream)
**Estimated effort: Medium — runs alongside Phase 1**

This phase can begin immediately and runs in parallel with database/API work.

- [ ] Extract text content from all 4 uploaded proposals → structure into JSON content blocks
- [ ] Extract and prepare brand assets (logos, decorative elements) from proposals and website
- [ ] Download Inter font .ttf files (Regular, Bold, ExtraBold, MediumItalic) from Google Fonts
- [ ] Extract/recreate infographic PNGs from proposals (MC diagram, MEC7, INICIA/INSPIRA/EVOLUCIONA arrows, Gen. Tractor, etc.)
- [ ] Compile consultant profiles from CVs + website bios into structured data
- [ ] Seed the 9 Fichas de Servicio data from the Certificado de Pertenencia

**Acceptance criteria:** All content blocks have structured JSON, all brand assets exist as PNG files, Inter fonts downloaded, all 9 Fichas seeded as SQL insert statements.

### Phase 1: Foundation (Database + Storage)
**Estimated effort: Medium**

- [ ] Install `pdf-lib` dependency (`npm install pdf-lib`)
- [ ] Create migration with all 6 new tables + RLS policies + unique constraint + `ALTER TABLE schools ADD COLUMN logo_url TEXT` (for cover page logos, graceful fallback if absent)
- [ ] Set up Supabase storage bucket for proposal assets (`propuestas/`)
- [ ] Implement Supabase storage helper: `getSignedUrl(path)` utility function
- [ ] Seed `propuesta_fichas_servicio` with all 9 ATE services
- [ ] Seed `propuesta_consultores` with data from Phase 0
- [ ] Seed `propuesta_contenido_bloques` with content blocks from Phase 0
- [ ] Seed `propuesta_documentos_biblioteca` with uploaded documents
- [ ] Seed `propuesta_plantillas` with Evoluciona and Preparación templates (linked to fichas via `ficha_id`)

- [ ] Unit tests: Vitest tests for `getSignedUrl` helper and seed data integrity (e.g., all 9 fichas present, FK relationships valid)

**Acceptance criteria:** All tables created with RLS, all seeds applied, `pdf-lib` installed, storage bucket exists, `npx tsc --noEmit` passes, seed tests green.

### Phase 2: PDF Design System
**Estimated effort: High — most critical phase**

#### Phase 2a: Proof of Concept (PoC Gate)

Before building all 12+ components, validate the approach with 3 critical components:

- [ ] Register Inter font files with `@react-pdf/renderer`
- [ ] Build `CoverPage.tsx` — dark background, logos, school name, service name
- [ ] Build `DarkSection.tsx` — full-bleed dark bg with white text, gold accents
- [ ] Build `ConsultantCard.tsx` — photo + bio grid card with rounded corners

**PoC Gate:** Generate a test PDF with these 3 components. Compare visually against existing proposals. If the visual quality is acceptable, proceed to Phase 2b. If not, evaluate whether layout adjustments can fix it, or whether a different approach is needed. **Do not proceed to 2b until the PoC passes visual review.**

#### Phase 2b: Full Component Library

- [ ] Implement `Typography.tsx` — Inter font with heading/body/caption variants
- [ ] Implement `LightSection.tsx` — white bg with near-black text
- [ ] Implement `ContentBlock.tsx` — renders structured JSON content as styled PDF pages
- [ ] Implement `ModuleTable.tsx` — session schedule tables
- [ ] Implement `PricingTable.tsx` — economic proposal table (supports both per-hour and fixed)
- [ ] Implement `TimelineBar.tsx` — visual calendar/Gantt
- [ ] Implement `BrandElements.tsx` — logos, page numbers, decorative elements
- [ ] Implement `Layout.tsx` — page margins, columns, grids
- [ ] Implement `TableOfContents.tsx` — auto-generated from block order
- [ ] Build `EvolucionaTemplate.tsx` — assembles all blocks for Evoluciona proposals
- [ ] Build `PreparacionTemplate.tsx` — assembles all blocks for Preparación proposals
- [ ] Build `generator.ts` — orchestrator: config → React-PDF render → pdf-lib merge → upload
- [ ] Handle malformed/password-protected PDFs in merge step (try/catch with skip + warning)
- [ ] Test with real data from existing proposals for visual comparison
- [ ] Unit tests: Vitest tests for `generator.ts` (config → PDF buffer), `mergeSupportingDocs` (merge logic, malformed PDF handling), and individual component rendering (each component produces valid PDF nodes)

**Acceptance criteria:** Generate a complete Evoluciona and Preparación proposal PDF. Visual comparison with manual proposals shows comparable quality. Merged supporting documents render correctly. All unit tests green.

### Phase 3: API Layer
**Estimated effort: Medium**

- [ ] Implement all CRUD API routes for consultants, documents, blocks, templates, fichas
- [ ] Implement `POST /api/licitaciones/[id]/generate-propuesta` with:
  - MINEDUC validation (Rules 1-5, expired cert blocking)
  - Estado tracking (pendiente → generando → completada/error)
  - SHA-256 hash computation
  - Malformed PDF handling with skip + warning
  - `maxDuration: 60` config for Vercel
- [ ] Implement proposal listing and download endpoints (signed URLs from storage paths)
- [ ] Unit tests: Vitest tests for every CRUD route (auth gate, role gate, validation, happy path), MINEDUC validation rules 1-5 + 7 (each rule tested with passing and failing input), generation endpoint (estado transitions, error handling, hash computation), and signed URL generation

**Acceptance criteria:** All endpoints return correct responses for valid/invalid inputs. MINEDUC validation rejects non-compliant configs. Generation creates a valid PDF in Supabase storage. All unit tests green. All quality gates pass.

### Phase 4: Admin UI
**Estimated effort: Medium-High**

- [ ] Build `/admin/licitaciones/consultores` page (CRUD with soft delete)
- [ ] Build `/admin/licitaciones/documentos-propuesta` page (CRUD with expiry tracking)
- [ ] Build MINEDUC compliance panel (top of config form, side-by-side objective comparison)
- [ ] Build Proposal Configuration panel in licitación detail page (admin-only visibility)
- [ ] Hour configuration form with live MINEDUC validation
- [ ] Pricing section (per-hour OR fixed UF toggle)
- [ ] Multi-select consultant picker with profile previews
- [ ] Document checklist with expiry warnings (red = expired, blocks generation)
- [ ] Module/activity configurator (sortable, editable)
- [ ] Client-side `<PDFViewer>` preview (proposal body only, no merged docs)
- [ ] "Generate" button with loading state + estado feedback
- [ ] Generated proposal history with download links and error details
- [ ] Install Playwright (`npm install -D @playwright/test`) and configure for CLI-based headless testing
- [ ] Playwright E2E tests:
  - Admin can see proposal panel on licitación detail page; non-admin cannot
  - Consultant CRUD page: create, edit, soft-delete a consultant
  - Document library page: upload document, verify expiry warning shows
  - Proposal config: fill form → preview renders in `<PDFViewer>` → generate → download link appears
  - MINEDUC validation: configure non-compliant hours → verify error blocks generation
  - Certificate expiry: select expired cert → verify generation blocked
  - Version history: generate twice → both versions appear in history

**Acceptance criteria:** Admin can configure and generate a proposal end-to-end. Non-admins cannot see the panel. MINEDUC violations prevent generation. Preview works in-browser. Generated PDF downloads correctly. All Playwright E2E tests pass in headless mode.

### Phase 5: Visual QA & Hardening
**Estimated effort: Medium**

Note: Unit tests (Vitest) are written per-phase alongside implementation. Playwright E2E tests are written in Phase 4. This phase focuses on visual quality, cross-environment testing, and edge case hardening.

- [ ] Visual QA — compare generated PDFs against manual proposals (side by side, pixel-level review)
- [ ] Test PDF output in Chrome PDF viewer, Adobe Reader, and macOS Preview
- [ ] Test PDF merging with edge-case documents (scanned PDFs, large file sizes, unusual page sizes)
- [ ] Test with all consultant combinations (1 consultant, max consultants, international-only)
- [ ] Mobile/tablet responsiveness of admin UI (target: 1024x768 minimum, tested on older Chromebook-class hardware)
- [ ] Error handling for edge cases: missing data, network failures, storage errors, concurrent generation
- [ ] Run full quality gates: `npx tsc --noEmit && npm run lint && npm test && npm run build`
- [ ] Run full Playwright suite in CI-equivalent headless mode
- [ ] Full E2E walkthrough: create licitación → configure proposal → preview → generate → download → verify PDF content

**Acceptance criteria:** All quality gates pass. All Vitest + Playwright tests green. No visual regressions vs. manual proposals. PDF renders correctly in Chrome, Adobe Reader, macOS Preview. E2E flow works without errors on 1024x768 viewport.

---

## 11. Content Block Seeding Strategy

The methodology content from existing proposals needs to be extracted and stored as structured content blocks:

| Block Key | Source | Pages (approx) |
|---|---|---|
| `educacion_relacional` | William Taylor proposal, p.2 | 1 page |
| `modelo_consultoria_fases` | William Taylor proposal, p.6-7 | 2 pages |
| `modelo_consultoria_elementos` | William Taylor proposal, p.8-9 | 2 pages |
| `generacion_tractor` | William Taylor proposal, p.9-10 | 2 pages |
| `proyecto_innova` | William Taylor proposal, p.11-12 | 2 pages |
| `liderazgo_cambio` | William Taylor proposal, p.13-14 | 2 pages |
| `acompanamiento_tecnico` | William Taylor proposal, p.15-16 | 2 pages |
| `comunidades_crecimiento` | William Taylor proposal, p.17-18 | 2 pages |
| `inspira_estadias` | William Taylor proposal, p.19-20 | 2 pages |
| `plataforma_crecimiento` | William Taylor proposal, p.16 | 1 page |
| `mec7` | Llolleo proposal (MEC7 section) | 2-3 pages |
| `horizonte_cambio` | Llolleo proposal (5 trajectories) | 2-3 pages |
| `supuestos` | Llolleo proposal (9 supuestos) | 1-2 pages |

**Total static content:** ~20-25 pages of methodology, pre-styled with infographic PNGs.

Each block is stored as structured JSON:
```json
{
  "sections": [
    { "type": "heading", "text": "Generación Tractor", "level": 1 },
    { "type": "paragraph", "text": "Cambia la mentalidad y las actitudes desde la educación inicial..." },
    { "type": "image", "key": "gt_diagram", "width": 300, "position": "right" },
    { "type": "bullet_list", "items": ["Estudiantes que no han sido escolarizados...", "..."] }
  ]
}
```

---

## 12. Key Technical Decisions

### Why React-PDF over other approaches?

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **React-PDF** | Already installed, component model, server-side, good font support | Learning curve for complex layouts, no CSS grid | ✅ **Best fit** |
| **Puppeteer + HTML** | Full CSS power, easier to style | Heavy dependency, Chrome headless needed, slow | ❌ Too heavy |
| **jsPDF** | Simple, lightweight | Terrible for complex layouts, no component model | ❌ Too limited |
| **Pre-designed template + fill** | Perfect design control | Rigid, hard to make dynamic variable-length sections | ❌ Too rigid |
| **LaTeX** | Beautiful output | Nobody on team knows LaTeX, complex toolchain | ❌ Wrong stack |

### Why NOT an async job queue?

Codex suggested background jobs with a polling status endpoint. This is overkill because:
- PDF generation (React-PDF render + pdf-lib merge) takes 5-15 seconds, not minutes
- Vercel's `maxDuration: 60` gives ample headroom
- Adding Bull/Redis or a job queue would massively increase infrastructure complexity for a feature used by 1-2 admins
- If generation ever exceeds 60s, we can revisit — but the synchronous approach is the pragmatic starting point

### Why NOT full versioning on content blocks/templates?

Gemini suggested version-tracking on plantillas and bloques. Unnecessary because:
- Content blocks represent FNE's methodology which changes at most yearly
- The `propuesta_generadas.configuracion` JSONB column already snapshots the full config at generation time, preserving historical state
- Adding version columns, audit tables, and diff UIs adds complexity with no practical benefit for this use case
- If a block changes, the old proposals still have their snapshot — that's the versioning that matters

### Storage: Paths, Not URLs

All file references in the database store **Supabase storage paths** (e.g., `propuestas/consultores/arnoldo-cv.pdf`), not full URLs. Signed URLs are generated at download time via `supabase.storage.from('propuestas').createSignedUrl(path, 3600)`. This avoids broken URLs when storage configuration changes.

### PDF Merging: Handling Edge Cases

```typescript
async function mergeSupportingDocs(
  proposalBuffer: Buffer,
  docPaths: string[]
): Promise<{ merged: Buffer; skipped: string[] }> {
  const mergedPdf = await PDFDocument.create();
  const skipped: string[] = [];

  // Add proposal pages
  const proposalDoc = await PDFDocument.load(proposalBuffer);
  const proposalPages = await mergedPdf.copyPages(proposalDoc, proposalDoc.getPageIndices());
  proposalPages.forEach(page => mergedPdf.addPage(page));

  // Add each supporting document
  for (const path of docPaths) {
    try {
      const { data } = await supabase.storage.from('propuestas').download(path);
      const bytes = await data.arrayBuffer();
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await mergedPdf.copyPages(doc, doc.getPageIndices());
      pages.forEach(page => mergedPdf.addPage(page));
    } catch (err) {
      // Malformed or password-protected PDF — skip and report
      skipped.push(path);
      console.error(`Skipping ${path}: ${err.message}`);
    }
  }

  return {
    merged: Buffer.from(await mergedPdf.save()),
    skipped,
  };
}
```

### Image Assets Required

| Asset | Source | Format |
|---|---|---|
| `fne-logo-gold.png` | FNE website / brand files | PNG, transparent bg |
| `fne-logo-white.png` | FNE website / brand files | PNG, transparent bg |
| `fne-sunburst-outline.png` | William Taylor cover (top-right decorative) | PNG, transparent bg |
| `decorative-vine.png` | William Taylor TOC page (bottom-right) | PNG, transparent bg |
| `mc-elements-diagram.png` | William Taylor p.8 (4 gold circles) | PNG, ~600px |
| `mc-fases-diagram.png` | William Taylor p.6 (INICIA/INSPIRA/EVOLUCIONA arrows) | PNG, ~800px |
| `mec7-diagram.png` | Llolleo proposal (MEC7 visualization) | PNG, ~600px |
| `gt-innova-diagram.png` | William Taylor p.5 (MEC7 + MC relationship) | PNG, ~800px |

---

## 13. Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| React-PDF layout limitations | Medium | PoC gate in Phase 2a validates approach before building all components. Pre-rendered PNGs for complex infographics. |
| PDF file size too large | Low | Compress images, use pdf-lib optimization. Typical proposal ~40 pages should be manageable. |
| Font rendering issues | Medium | Bundle Inter .ttf files, test on Chrome PDF viewer, Adobe Reader, macOS Preview. |
| Content blocks become stale | Low | Admin UI for editing blocks; content rarely changes. Snapshots in propuesta_generadas preserve history. |
| Certificate expires (30 days) | Medium | Expiry warnings in UI. **Expired certificates block generation** — admin must upload fresh certificate. |
| School logos not available | Low | Graceful fallback — show school name only if no logo. |
| Malformed supporting PDFs | Low | Try/catch in merge step. Skip and report in response. Generation still succeeds with warning. |
| Vercel timeout on large proposals | Low | `maxDuration: 60` config. If needed, optimize image sizes first. Async queue is a last resort. |
| 2026 hours (188) exceed Ficha (148) | Medium | System flags the overage. Async hours are above-and-beyond and don't count against Ficha. Human review required. |

---

## 14. Open Questions (with Recommendations)

| # | Question | Recommendation |
|---|---|---|
| 1 | **School logos** — stored in system or uploaded per-licitación? | Recommend: Add optional `logo_url` field to `schools` table. Upload once per school. Fall back to name-only if absent. |
| 2 | **Asesor Internacional selection** — include Barcelona-based advisors? | Recommend: Yes, include as selectable option. The website lists them and proposals reference international advisory. Tag them with `categoria = 'asesor_internacional'`. |
| 3 | **Module templates** — pre-configured sets or built from scratch? | Recommend: Pre-configured sets per service type stored in `propuesta_plantillas.configuracion_default`. Admin can modify per proposal. Gives a fast starting point without locking things down. |
| 4 | **Content block editing** — admin UI or developer-only? | Recommend: Phase 1 = developer-only (SQL seeds). Phase 4 = add basic admin editing UI for text content. Infographic PNGs remain developer-managed. |
| 5 | **Versioning** — auto-increment or replace? | Recommend: Auto-increment. The `UNIQUE(licitacion_id, version)` constraint and version history in the UI makes this clean. Never delete old versions. |
| 6 | **Offline capability** — needed? | Recommend: No. This is an admin tool used at FNE offices with reliable internet. Out of scope for v1. |

---

## 15. Dependencies & Prerequisites

Before implementation begins:

- [ ] **Brand assets** — FNE logo files (PNG, high-res, transparent backgrounds)
- [ ] **Infographic PNGs** — Source files or high-quality exports of methodology diagrams
- [ ] **Inter font files** — .ttf files for Regular, Bold, ExtraBold, MediumItalic (from Google Fonts)
- [ ] **Remaining recommendation letters** — Brent to provide 2 more
- [ ] **Content extraction** — Text from existing proposals structured into JSON blocks (Phase 0)
- [ ] **Decision on open questions** — Confirm or override recommendations in Section 14
- [ ] **Install pdf-lib** — `npm install pdf-lib` (not yet in project)

---

## Appendix A: Consultant Profiles (Extracted)

### Arnoldo Cisternas Chávez
- **Role:** Director del Programa y Asesor Directivo
- **Category:** Comité Internacional
- **Education:** PhD© Management Sciences (ESADE, 2006), Licenciado en Psicología (U. Central, 1996)
- **Key:** Creator of the Relational Approach, co-author of "Relaciones Poderosas" and "Educación Relacional: 10 Claves". Director of Instituto Relacional (Barcelona-Chile). President of FNE. Leads programs in 14 schools across 2 foundations.
- **References:** José Luis Casanova (Fundación Súmate), Sandra de la Parra (EDUCADES-SEPADE)

### María Gabriela Naranjo Armas
- **Role:** Directora de la FNE – IR Chile
- **Category:** Equipo FNE
- **Education:** Psicoterapeuta Corporal Neoreichiana (IIBS Heiden, Suiza, 2008-2011), Master en Gestión y Dirección de RR.HH. (U. Blanquerna / Ramon Llull, Barcelona, 2004-2006), Psicología Titulada (U. Central de Chile, 1997-2002)
- **Key:** Created the ATE entity for FNE (MINEDUC-certified). Clinical and organizational psychologist. Former consultant at Fundación Súmate (5 schools).
- **Reference:** José Luis Casanova Rivera (Colegio Padre Álvaro Lavín de Maipú)

### Ignacio Andrés Pavez Barrio
- **Role:** Director de Investigación
- **Category:** Equipo FNE
- **Education:** PhD Organizational Behavior (Case Western Reserve, 2011-2017), Magíster en Ciencias de la Ingeniería (PUC Chile, 2003-2007), Ingeniero Civil (PUC Chile, 1998-2003). Additional: Appreciative Inquiry Certificate, Weatherhead Coaching Certificate, CTT Certified Consultant, Coach Ontológico (ICF).
- **Key:** Professor at U. de Chile FEN. Director of Relaciona Consultores. Co-creator of IDeIA. Research Fellow at Fowler Center for Business (World Benefit). Steering Committee member of World Positive Education Accelerator.
- **References:** Gladys Cisternas Chávez (Colegio Getsemaní), Sandra de la Parra (EDUCADES-SEPADE)

---

## Appendix B: Supporting Document Inventory

| Document | File | Status | Expiry |
|---|---|---|---|
| Certificado de Pertenencia (= Vigencia) | `certificado_pertenencia.pdf` | ✅ Current | ~30 days from emission. Must re-download from MINEDUC for each proposal. |
| Ficha de Servicio | `Ficha Servicio.pdf` | ✅ Current | No expiry (lists all 9 Folios) |
| Evaluaciones Clientes | `Evaluaciones Clientes.pdf` | ✅ Current | No expiry |
| Carta de Recomendación #1 | `Carta de Recomendación N.E.pdf` | ✅ Available | Colegio Santa Marta de Valdivia, 2025-01-20 |
| Carta de Recomendación #2 | — | ❌ Pending | Brent to provide |
| Carta de Recomendación #3 | — | ❌ Pending | Brent to provide |
| CV Arnoldo Cisternas | `CV Arnoldo formato ate (1).pdf` | ✅ Available | MINEDUC format |
| CV Gabriela Naranjo | `CV Gabriela Naranjo (1).pdf` | ✅ Available | MINEDUC format |
| CV Ignacio Pavez | `CV Ignacio Pavez_Formato ATE (1).pdf` | ✅ Available | MINEDUC format |

---

## Appendix C: FNE Registered ATE Services (from Ficha Servicio)

| # | Folio | Service Name | Dimension | Category | Hours |
|---|---|---|---|---|---|
| 1 | 45450 | Fortalecimiento del Clima Relacional para Mejorar la Gestión Educativa | Liderazgo | Asesoría | 48 |
| 2 | 45451 | Liderazgo para el cambio de la cultura organizacional | Liderazgo | Asesoría | 20 |
| 3 | 45615 | Capacitación Fortalecimiento de equipos para plasmar el PEI y viabilizar el PME | Liderazgo | Capacitación | 20 |
| 4 | 46064 | Capacitación para liderar una cultura de innovación educativa en la escuela | Liderazgo | Capacitación | 88 |
| 5 | 46729 | Herramientas Psicoemocionales para Promover en los Estudiantes la Motivación hacia el Aprendizaje | Gestión Pedagógica | Capacitación | 20 |
| 6 | 47849 | Implementación de Aprendizaje Basado en Proyectos (ABP) | Gestión Pedagógica | Capacitación | 80 |
| 7 | 47940 | Adquisición de estrategias para disponer corporal y emocionalmente al aprendizaje | Gestión Pedagógica | Capacitación | 25 |
| 8 | 48083 | Introducción a la metodología ABP para Líderes y Docentes | Gestión Pedagógica | Capacitación | 32 |
| 9 | 52244 | Asesoría Integral para Desarrollar una Cultura de Innovación Educativa Centrada en el Aprendizaje | Liderazgo | Capacitación | 148 |

---

## Appendix D: Feedback Disposition (v1 → v2 Changes)

Summary of what was incorporated from model reviews and what was intentionally rejected.

### Incorporated

| Source | Feedback | What Changed in v2 |
|---|---|---|
| Gemini | Phase 0 parallel workstream for content/asset extraction | Added Phase 0 with clear deliverables |
| Gemini | Resolve open questions with recommendations | Section 14 now has recommendations per question |
| Codex | PoC gate before building all components | Phase 2 split into 2a (PoC) and 2b (full library) |
| Codex | Acceptance criteria per phase | Each phase now has explicit acceptance criteria |
| All three | Soft deletes on library tables | All tables use `activo = false`, DELETE endpoints do soft delete |
| Claude Code | Explicit `ficha_id` FK on plantillas and generadas | Added `ficha_id UUID REFERENCES propuesta_fichas_servicio(id)` |
| Claude Code | Store paths not URLs | Changed `archivo_url` → `archivo_path`, `foto_url` → `foto_path`, etc. |
| Claude Code | Estado + error tracking on propuesta_generadas | Added `estado`, `error_message`, `pdf_sha256` columns |
| Claude Code | Unique version constraint | Added `UNIQUE(licitacion_id, version)` |
| Claude Code | Certificate blocking (not just warning) | Expired certificates now block generation |
| Claude Code | Malformed PDF handling | Try/catch in merge step, skip + warning in response |
| Gemini | PDFViewer for client-side preview | Added preview flow using `<PDFViewer>` (body only) |
| Claude Code | pdf-lib installation requirement | Documented in Phase 1 and Prerequisites |
| Codex | Vercel maxDuration config | Added `maxDuration: 60` in generation endpoint detail |
| Claude Code | Pricing model supports both per-hour and fixed | Added `pricing_model` toggle in UI and config |

### Incorporated (v2.1 — post-review corrections)

| Source | Feedback | What Changed |
|---|---|---|
| Claude | Wrong directory path `src/lib/` | Changed to `lib/propuestas/` (matches project convention) |
| Claude | `schools` table needs `logo_url` | Added `ALTER TABLE schools ADD COLUMN logo_url TEXT` to Phase 1 migration |
| Claude | TOC page numbers require two-pass render | TOC now lists section titles only (no page numbers in v1) |
| Claude | Module hours sum not validated | Added RULE 7: `SUM(modules[].hours) === proposal.total_hours` (client-side) |
| Claude | Soft delete pattern should note convention | Added note that `activo BOOLEAN` follows `programas`-table pattern |
| Gemini | Define "older school hardware" target | Noted for Phase 5 — define target resolution/devices before QA |
| Gemini | Scope content block editor | Phase 4 editor limited to simple text fields within JSON |

### Intentionally Rejected

| Source | Suggestion | Why Rejected |
|---|---|---|
| Codex | Async job queue with polling | Overkill. Generation takes 5-15s. `maxDuration: 60` is sufficient. 1-2 admin users. |
| Gemini | Full versioning on plantillas/bloques | Unnecessary. `propuesta_generadas.configuracion` already snapshots state. Methodology changes yearly at most. |
| Codex | Rule 6 (objective alignment) as machine-testable | Impossible. Compares Spanish prose for semantic alignment. UI shows side-by-side for human review. |
| Codex | "Pricing model contradictory" | Not contradictory. Both models exist: per-hour for shorter engagements, fixed UF for Evoluciona. UI supports both. |
