# DESIGN BRIEF — Landing page `/pasantias` · Fundación Nueva Educación

**Deliverable:** one self-contained HTML file, ready to port into a Next.js page.
**You already have the FNE brand system** — palette, Mont scale, tracking, icons,
photography criteria. This brief covers only what the brand kit doesn't: the page,
the content, and two exceptions.

---

## The job

Redesign the landing page for **Pasantías INSPIRA Barcelona · Octubre 2026** — a
two-week study visit where Chilean school leaders live inside seven leading schools
in Barcelona.

The page exists at **https://nuevaeducacion.org/pasantias**. Content correct,
design not. **Take the content from it. Replace the design entirely.**

Reader: a Chilean school director deciding whether to spend two weeks and real money.
It should feel like an invitation into a movement, not a brochure.

---

## Non-negotiable

1. **Do not change a single fact, name, date or word below.** It's been through owner
   review and repeated verification. Re-set it typographically, re-order sections,
   split or combine blocks — but the strings are fixed. A line that reads badly is
   something to flag, not rewrite.
2. **No prices anywhere.** Not a number, not a range, not "desde". Pricing lives only
   in a PDF sent after contact. There's an automated check behind this.

## Two brand exceptions

- **`#B45309` is the only yellow that may carry text on a light background.** The
  kit's `#FBBF24` and `#F59E0B` measure 1.66:1 and 2.14:1 on white — both fail WCAG
  AA at body size. We hit 15 real contrast violations on this page and added
  `#B45309` (5.02:1) to fix them. Use it for accent text; the kit's yellows stay on
  surfaces.
- **Declare the palette using these exact token names**, which already exist in the
  codebase: `brand_primary` `brand_accent` `brand_accent_hover` `brand_accent_light`
  `brand_accent_text` `brand_gray_dark` `brand_gray_medium`. Matching them makes the
  port mechanical.

---

## Site coherence

The page must read as part of nuevaeducacion.org, not a separate microsite.

**Header** — replicate it; go look at the live site. White bar, FNE logo top-left.
Nav in small caps, medium weight, dark grey: **PASANTÍAS · PROGRAMAS · NOTICIAS Y
EVENTOS · NOSOTROS · CONTACTO**. Far right, a pill-shaped outlined button: **HUB DE
TRANSFORMACIÓN**. Drawer on mobile.

**Footer** — the site already has one. Don't design a new one.

---

## Photography

Use the kit's canonical treatment for the hero, and reuse the pattern for section
breaks. The current page is a wall of white cards — photography is what gives it
rhythm and heat, and the owner specifically wants **more Barcelona**.

Photos will be attached. Your HTML can't load them, so reference them as
`/images/pasantias/<name>.jpg` and note in a comment what each slot needs. Broken
images in your preview are expected; the real files get wired in on port.

| slot | what it wants |
|---|---|
| Hero | Barcelona from above, golden hour |
| after *dos semanas* | school interior, in use |
| before *las 7 escuelas* | street-level Barcelona, architectural scale |
| before *el equipo* | people mid-conversation, not posed |
| closing (optional) | Barcelona wide, evening |

Four or five total. One hero photograph per section — more becomes a slideshow.

---

## The content

### Hero

- Eyebrow: `PASANTÍAS INTERNACIONALES`
- Headline: **VIVE UNA ESCUELA POR DENTRO, NO LA VISITES**
- Date chip: **Octubre, 5 al 16 · 2026** — must read as **one** span. It previously
  read as two separate trips, which was a real problem.
- Summary: **9 días de visitas · 7 escuelas**
- Primary CTA: *Solicita el programa completo* → `#programa`
- Secondary: *Descarga la ficha* → `/api/pasantias/ficha`

### Trust strip

`400+ pasantes` · `40+ colegios` · `12 escuelas de Barcelona en la red` ·
`7 escuelas en esta cohorte`

### Dos semanas, dos modos — the central idea, give it weight

**Semana 1 — inmersión · lunes 5 a viernes 9 de octubre.** Semana completa de
inmersión: cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.

**Fin de semana largo · sábado 10 a lunes 12.** Libre. El lunes 12 es Fiesta Nacional
de España y los colegios están cerrados: día libre en Barcelona o para conocer Europa.
*Present as a feature, not a gap.*

**Semana 2 — visitas · martes 13 a viernes 16 de octubre.** Una o dos escuelas por día.

### Cómo es un día

- **Mañana 1** — Presentación del proyecto educativo y entrevista con la dirección.
- **Mañana 2** — Visita guiada, entrevistas con estudiantes y educadores.
- **Tarde** — Talleres con expertos en las temáticas centrales del movimiento de Nueva
  Educación, en las dependencias de las escuelas visitadas y/o en las oficinas del
  Instituto Relacional, barrio de Eixample, Barcelona.

### Las 7 escuelas — two tiers

**Escuelas de inmersión** (2,5 días cada una):

- **Escola Virolai** — Infantil, primaria, ESO y Bachillerato — *Organización y espacios
  · Evaluación formativa, portfolios · Personalización y plan personal · Gestión del
  equipo docente*
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

Headshots exist and are black and white — the one place b&w is correct here.

### Los 13 objetivos

**The hardest layout problem on the page.** Thirteen long paragraphs that currently
read as a wall. Solve it — numbered pairs, accordion, grouped themes, whatever earns
its place. Text is fixed:

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

Headed *Solicita el programa completo*: the full programme arrives by email. Today the
action is a mail link to `info@nuevaeducacion.org`, but **design it as a form** — name,
email, institution, role, number of people, message, plus two checkboxes — because a
real form replaces it in the next round.

### FAQ

Six questions, accordion: who it's for, what a day looks like, whether Spanish is
needed, group bookings, how to reserve, the free weekend. **No prices in any answer.**

### Closing CTA

WhatsApp → `+56 9 4162 3577`.

---

## Deliverable

**One self-contained HTML file** that opens in a browser with no build step.

- Tailwind via CDN is fine — I port it to the real build.
- Palette declared under the token names above.
- Mont isn't available to you: use a geometric stand-in and mark where Mont goes.
  Don't design around another typeface's personality.
- Images referenced as `/images/pasantias/<name>.jpg` with a comment per slot.
- Stable `id` on each major section. One `<h1>`, no skipped heading levels, real
  `<section>` elements — these are checked automatically downstream.
- **Must work at 390px.** Many readers are on phones, some on older school hardware.

Show desktop and phone.
