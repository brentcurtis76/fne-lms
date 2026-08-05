# DESIGN BRIEF — Landing page `/pasantias` · Fundación Nueva Educación

**For:** Claude Design · **From:** Fundación Nueva Educación (nuevaeducacion.org)
**Deliverable:** one self-contained HTML file, ready to be ported into a Next.js page.

---

## The job

Redesign the landing page for **Pasantías INSPIRA Barcelona · Octubre 2026** — a
two-week study visit where Chilean school leaders live inside seven leading schools
in Barcelona.

A version of this page exists at **https://nuevaeducacion.org/pasantias**. Its
content is correct and approved; its design is not. **Look at it for the content
and structure. Replace the visual design entirely.**

The reader is a Chilean school director or pedagogical lead deciding whether to
spend two weeks and a significant budget. The page should feel like an invitation
into a movement, not a brochure. Warm, confident, concrete.

---

## Three non-negotiables

1. **Do not change a single fact, name, date or word of the content below.** It has
   been through owner review and repeated verification. You may re-set it
   typographically, re-order sections, or split and combine blocks — but the strings
   are fixed. If something reads badly, flag it; don't rewrite it.
2. **No prices anywhere.** Not a number, not a range, not "desde". Pricing lives only
   in a PDF sent after someone makes contact. This is a hard rule with an automated
   check behind it.
3. **Spanish (Chile), and accents survive in capitals** — PASANTÍAS, FUNDACIÓN,
   EDUCACIÓN. Dropping an accent in a headline is an error, not a style choice.

---

## Site coherence

The page must read as part of nuevaeducacion.org, not a separate microsite.

**Header** (replicate — go look at the live site): white bar, FNE logo top-left
(gold twelve-pointed flower + "FUNDACIÓN NUEVA EDUCACIÓN" stacked). Nav in small
caps, medium weight, dark grey: **PASANTÍAS · PROGRAMAS · NOTICIAS Y EVENTOS ·
NOSOTROS · CONTACTO**. Far right, a pill-shaped outlined button: **HUB DE
TRANSFORMACIÓN**. Collapses to a drawer on mobile.

**Footer**: keep the site's existing footer. Don't design a new one.

---

## Brand system (from the FNE brand manual, v1.0)

### Colour

| | hex | use |
|---|---|---|
| Negro FNE | `#0A0A0A` | primary |
| Amarillo FNE | `#FBBF24` | accent — **surfaces only** |
| Blanco | `#FFFFFF` | default background |
| Ámbar | `#F59E0B` | hover |
| Amarillo claro | `#FCD34D` | soft highlights |
| Gris oscuro | `#1F1F1F` | body text |
| Gris medio | `#6B7280` | secondary text |
| Ámbar oscuro | `#B45309` | **the only yellow that may carry text on white** |
| Degradado dorado | `#FDB833 → #B47410`, 135° | brand gradient |

**Rules that are not suggestions:**

- **Proportion: 60% white · 30% black · 10% yellow.** If the page reads "yellow,"
  there's too much — cut it to an accent and give the weight back to black.
- **One solid-yellow element per surface.** Not two.
- **Black text on yellow. Never white on yellow.**
- `#FBBF24` and `#F59E0B` measure 1.66:1 and 2.14:1 on white — they **cannot** carry
  small text on a light background. Use `#B45309` (5.02:1) for accent text.
- **The gradient is brand, not decoration.** Outside the logo it appears as a rule or
  an accent — never as a full background, never as a tint over a photo.

### Typography — Mont (Fontfabric) only

| role | size / weight | notes |
|---|---|---|
| Display | 44 / 900 | ALWAYS UPPERCASE, tracking **−0.02em** (tight, not expanded) |
| H1 | 32 / 800 | |
| H2 | 24 / 700 | section titles, sentence case |
| H3 | 18 / 700 | |
| Body | 15 / 400 | line-height 1.6 |
| Small | 13 / 400 | captions |
| Eyebrow | 11 / 600 | UPPERCASE, tracking 0.08em |

Display headlines and short labels in caps; section titles in sentence case; never
English Title Case. Only four tracking values exist: 0.20em (logo), 0.15em
(descriptor), 0.08em (eyebrows/labels), normal (everything else).

### Icons and ornament

Lucide icons, **1.75px stroke at every size**, rounded caps, monochrome inheriting
the text colour. No filled or two-colour icons. The only permitted ornaments: a gold
rule as a section separator, a short yellow bar under a title, and the outlined
flower symbol as a watermark at **≤12% opacity**.

---

## Photography — this is the heart of the redesign

The current page is a wall of white cards. **Photography is the only place this brand
allows abundant colour**, and it's the mechanism for giving the page rhythm and heat.
Use it generously: a hero, and image breaks between major sections.

**The canonical treatment**, straight from the manual — use it for the hero and reuse
the pattern for section breaks:

> Full-bleed photograph · a **black gradient veil** rising from the edge where the
> text sits, reaching **85% opacity under the text and dissolving before the photo's
> centre of interest** · a **yellow eyebrow** in caps · a **white headline in Black
> 900**, uppercase.

**Yes:** real situations — classrooms, workshops, conversation, the city. Natural
light, golden hour, warm saturated colour. People *doing something*, not posing.
Architectural scale and urban context — this is Barcelona and it should feel like it.

**No:** generic stock. Black and white. Heavy grain, vignette, colour filters.
**Duotones or yellow tints over images** (called out explicitly in the manual).
Collages, decorative frames, overlaid textures.

**Mechanics:** 16:9 for headers, 1:1, 4:5 for portraits. **12px radius** on contained
cards; **no radius** when an image bleeds to the edge. Crop, never distort — centre
the crop on the subject. Text over an image **always** needs the veil, at ≥4.5:1
contrast. One hero photograph per section. Every image needs descriptive alt text in
Spanish. Over a photo, the logo is the **white** version, never the gradient.

Barcelona photographs will be supplied. Reference them as
`/images/pasantias/<name>.jpg` and note what each slot needs.

---

## The content

### Hero

- Eyebrow: `PASANTÍAS INTERNACIONALES`
- Headline: **VIVE UNA ESCUELA POR DENTRO, NO LA VISITES**
- Date chip: **Octubre, 5 al 16 · 2026** — must read as **one** span. It previously
  read as two separate trips and that was a real problem.
- Summary: **9 días de visitas · 7 escuelas**
- Primary CTA: *Solicita el programa completo* → anchors to `#programa`
- Secondary CTA: *Descarga la ficha* → `/api/pasantias/ficha`

### Trust strip

`400+ pasantes` · `40+ colegios` · `12 escuelas de Barcelona en la red` ·
`7 escuelas en esta cohorte`

### Dos semanas, dos modos (the central idea — give it weight)

**Semana 1 — inmersión · lunes 5 a viernes 9 de octubre.**
Semana completa de inmersión: cada pasante vive 2,5 días en Escola Virolai y 2,5 días
en Escola Sadako.

**Fin de semana largo · sábado 10 a lunes 12.** Libre. El lunes 12 es Fiesta Nacional
de España y los colegios están cerrados: día libre en Barcelona o para conocer Europa.
*Present this as a feature, not a gap.*

**Semana 2 — visitas · martes 13 a viernes 16 de octubre.** Una o dos escuelas por día.

### Cómo es un día

- **Mañana 1** — Presentación del proyecto educativo y entrevista con la dirección.
- **Mañana 2** — Visita guiada, entrevistas con estudiantes y educadores.
- **Tarde** — Talleres con expertos en las temáticas centrales del movimiento de Nueva
  Educación, en las dependencias de las escuelas visitadas y/o en las oficinas del
  Instituto Relacional, barrio de Eixample, Barcelona.

### Las 7 escuelas — two tiers

**Escuelas de inmersión** (2,5 días cada una):

- **Escola Virolai** — Infantil, primaria, ESO y Bachillerato — *Organización y
  espacios · Evaluación formativa, portfolios · Personalización y plan personal ·
  Gestión del equipo docente*
- **Escola Sadako** — Infantil, primaria y ESO — *Organización y espacios · Evaluación
  formativa, portfolios · Secuenciación y co-docencia · Organización y participación
  estudiantil*

**Escuelas de visita:**

- **Institut Escola El Puig** — día completo, fuera de Barcelona — Infantil, primaria y
  ESO — *Incorporación de la naturaleza y el arte · Gobierno estudiantil · Trabajo de
  estudiantes internivel · Metaprendizaje*
- **Escola La Maquinista** — Infantil y primaria — *Organización y espacios · Evaluación
  formativa, rúbricas y autoevaluación · Cajas de aprendizaje · Organización
  participativa de los alumnos*
- **Escola Octavio Paz** — Infantil y primaria — *Organización y espacios · Evaluación
  formativa, diarios de aprendizaje · Proyecto anual temático y cajas de aprendizaje ·
  Trabajo por comunidades de alumnos*
- **Institut Angeleta Ferrer** — ESO — *Organización y espacios · Evaluación formativa,
  portfolios · Autonomía del alumnado · Vinculación de la escuela con la comunidad*
- **Institut Escola Les Vinyes** — día completo, fuera de Barcelona — Infantil, primaria
  y ESO — *Trabajo interdisciplinario · Aprendizaje Basado en Proyectos · Autonomía del
  estudiante · Coherencia escolar · Codocencia*

*El orden de las visitas puede variar y está sujeto a la disponibilidad de las escuelas.*

### El equipo

| | |
|---|---|
| **Coral Regí** | Directora del programa INSPIRA |
| **Mora del Fresno** | Coordinadora INSPIRA |
| **Jordi Musons** | Director, Escola Sadako — *anfitrión semana 1* |
| **Sandra Entrena** | Encargada de Innovación, Escola Virolai — *anfitriona semana 1* |
| **Boris Mir** | Ex-director adjunto, Institut Angeleta Ferrer y Escola Nova 21; fundador del Institut Angeleta Ferrer |
| **Sergi del Moral** | Director, Institut Escola Les Vinyes |
| **Pepe Menéndez** | Consultor en transformación pedagógica |
| **Joan Quintana** | Consultor en procesos de cambio, co-autor de «Educación Relacional» |

Headshots exist and are black and white — that's the one place b&w is correct.

### Los 13 objetivos

Thirteen long paragraphs. **This is the hardest layout problem on the page** — it
currently reads as a wall. Solve it: numbered pairs, an accordion, grouped themes,
whatever earns its place. Text is fixed:

1. Conocer los proyectos educativos de las principales escuelas de vanguardia en Cataluña y compartir la mirada pedagógica de sus directores.
2. Tomar contacto con las prácticas pedagógicas en terreno y profundizar en su comprensión por medio de entrevistas con estudiantes y docentes.
3. Valorar el profundo peso que ha tenido la evolución del propósito del educar en las escuelas de vanguardia y en las prioridades estratégicas que surgen desde esa nueva jerarquía.
4. Conocer cómo ha tomado forma la evolución del proceso de aprendizaje, con foco en las metodologías activas, colaborativas y centradas en la autonomía y el propósito de los estudiantes.
5. Conectar con la globalización y el uso de herramientas como: cajas de aprendizaje, nubes de preguntas, integración de niveles, diversos tipos de proyectos, momentos públicos, entre muchas otras.
6. Visualizar cómo se organizan los procesos de evaluación, con énfasis en la evaluación formativa y formadora, por medio del uso de herramientas como: portafolios, rúbricas participativas, diarios de aprendizaje, entre otras.
7. Profundizar en la comprensión de los procesos de personalización y su aplicación en terreno. Tanto el uso de planes personales, proyectos de autoconocimiento, inventarios personales de aprendizaje, brújulas y otras herramientas.
8. Apreciar nuevos estilos de liderazgo y de organización para conducir los procesos de cambio y evolución cultural hacia el nuevo paradigma educativo.
9. Conocer y comprender la evolución del trabajo colaborativo docente y la constitución de equipos de alto desempeño.
10. Visualizar el uso del tiempo, los espacios, los materiales y el equipamiento en los diversos proyectos educativos visitados.
11. Comprender el nuevo rol de las familias en las escuelas de Nueva Educación y las dinámicas de crecimiento que de ello surgen.
12. Valorar la apertura y conexión de la escuela con su entorno, el funcionamiento en red y el poder del pensamiento sistémico para diseñar las experiencias de aprendizaje.
13. Comprender y apreciar el giro relacional que implica migrar hacia la Nueva Educación y los beneficios personales y societales que conlleva.

### Qué incluye / qué no incluye

**Incluye:** El pago de las visitas a las escuelas · Los talleres de la tarde con
especialistas · Los honorarios de la dirección del programa, los relatores y el equipo
de facilitadores de FNE que acompañan a los pasantes · Bibliografía básica recomendada,
una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes
antes del viaje · Desayuno a media mañana en las escuelas · Almuerzos de la primera
semana, en Escola Virolai y Escola Sadako

**No incluye:** Desayunos de hotel · Comidas en los días de visita de la segunda semana
· Cenas · Pasajes aéreos y transporte terrestre de llegada y salida · Transporte a El
Puig y Les Vinyes · Seguros

*Alojamiento en Barcelona, coordinado por el equipo FNE.* **No price. No night count.**

### `#programa` — request panel

A panel headed *Solicita el programa completo*, explaining that the full programme
with all details arrives by email. For now the action is an email link to
`info@nuevaeducacion.org`; **design it as a form** — name, email, institution, role,
number of people, message, plus two checkboxes — because a real form replaces it next.

### FAQ

Six questions, accordion. Existing set covers: who it's for, what a day looks like,
whether Spanish is needed, group bookings, how to reserve, what happens on the free
weekend. **No prices in any answer.**

### Closing CTA

WhatsApp button → `+56 9 4162 3577`.

---

## What to deliver

**One self-contained HTML file**, opening in a browser with no build step:

- Tailwind via CDN is fine for the mockup — I'll port it to the real build.
- Declare the brand colours in a `tailwind.config` block using these exact names:
  `brand_primary` `brand_accent` `brand_accent_hover` `brand_accent_light`
  `brand_accent_text` `brand_gray_dark` `brand_gray_medium`. They already exist in
  the codebase under those names, so matching them makes the port near-mechanical.
- Mont isn't available to you — use a geometric sans stand-in and mark clearly where
  Mont goes. Don't design around a different typeface's personality.
- Reference images as `/images/pasantias/<name>.jpg` and note in a comment what each
  slot needs ("16:9 Barcelona aerial, golden hour").
- Give each major section a stable `id` and keep the semantic structure clean: one
  `<h1>`, no skipped heading levels, real `<section>` elements.
- **Must work at 390px.** Many readers are on phones, some on older school hardware.

Design for both a full-width desktop and a phone. If you show one, show the phone too.
