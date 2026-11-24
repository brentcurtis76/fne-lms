# Sitio público (nuevaeducacion.org pages; not part of the platform redesign)

Area `20-sitio-publico`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `02daebb57` (2026-11-25).

Redesigned separately and live since 12 Nov 2026. Listed so that every file under pages/ has a place.

8 screen files, 1 API files, 29 pieces.

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| `/equipo` | `pages/equipo.tsx` | 31 | — |  |
| `/` | `pages/index.tsx` | 511 | — |  |
| `/nosotros` | `pages/nosotros.tsx` | 110 | — |  |
| `/noticias` | `pages/noticias.tsx` | 249 | — |  |
| `/noticias/[slug]` | `pages/noticias/[slug].tsx` | 157 | — |  |
| `/pasantias` | `pages/pasantias.tsx` | 1341 | — |  |
| `/privacidad` | `pages/privacidad.tsx` | 46 | — |  |
| `/programas` | `pages/programas.tsx` | 202 | — |  |

## /equipo

File `pages/equipo.tsx` · 31 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: no role rule. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: yes.
- In the page: no access check found by the script.
- Linked from: `components/DynamicFavicon.tsx:38`, `components/Footer.tsx:95`, `components/layout/FooterNuevo.tsx:19`, `components/site/SiteLayout.tsx:176`, `lib/auth/forced-password-change.ts:148`, `lib/look.ts:105`, `middleware.ts:349`
- Tests: browser tests that CI runs: `tests/e2e/footer-heading-order.spec.ts`; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Una red de personas que cambian la escuela» | h1 |  | EquipoPage · l.16 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «← Conoce la fundación» | `/nosotros` |  | `testid=equipo-nosotros` | EquipoPage · l.23 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SiteLayout` | active: nosotros · title: Equipo · Fundación Nueva Educación · description: El equipo de la Fundación Nueva Educación: comité internacional, equipo FNE y asesores y asesoras internacionales. |  |  | EquipoPage · l.9 |
| `PageHero` |  |  |  | EquipoPage · l.14 |
| `TeamSection` |  |  |  | EquipoPage · l.27 |

**Other texts on screen** (2)

- «Equipo» — EquipoPage · l.15
- «Profesionales de la educación, la dirección escolar y la investigación, de Chile y Catalunya, que acompañan a cada comunidad educativa en su proceso de transformación.» — EquipoPage · l.20

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `components/site/PageHero.tsx`
- `components/site/SiteLayout.tsx`
- `components/site/TeamSection.tsx`
- `components/site/teamData.ts`
- `components/site/useSiteEffects.ts`
- `lib/legal/privacy-notice.ts`

## /

File `pages/index.tsx` · 511 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/Footer.tsx:96`, `components/layout/Header.tsx:62`, `components/site/SiteLayout.tsx:47`, `pages/403.tsx:21`, `pages/admin/course-builder/new.tsx:49`, `pages/admin/news.tsx:312`, `pages/admin/transformation.tsx:60`, `pages/admin/transformation/assessments.tsx:118`, `pages/directivo/assessments/dashboard.tsx:167`, `pages/login.tsx:371`, `pages/login.tsx:390`, `pages/login.tsx:612` and 11 more
- Tests: no browser test that CI runs; unit tests of the page: `__tests__/pages/home-contact-form.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (17)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{word.text}» | h1 |  | HomePage · l.140 |
| «Nadie aprende solo.» | h2 |  | HomePage · l.194 |
| «Treinta años cuidando vínculos» | h2 |  | HomePage · l.262 |
| «Motivación compartida» | h3 |  | HomePage · l.283 |
| «Convivencia como motor» | h3 |  | HomePage · l.287 |
| «Identidad colectiva» | h3 |  | HomePage · l.291 |
| «Aprendizaje cooperativo» | h3 |  | HomePage · l.295 |
| «Pasantías en Barcelona» | h2 |  | HomePage · l.314 |
| «Próximas Expediciones» | h3 |  | HomePage · l.326 |
| «¿Qué incluye la experiencia?» | h3 |  | HomePage · l.335 |
| «Codocencia en Aulas» | h4 |  | HomePage · l.340 |
| «Visitas a Escuelas Innovadoras» | h4 |  | HomePage · l.347 |
| «Talleres Especializados» | h4 |  | HomePage · l.354 |
| «Intercambio con las Escuelas» | h4 |  | HomePage · l.361 |
| «Bitácora de Aprendizajes» | h4 |  | HomePage · l.368 |
| «Empecemos por una conversación.» | h2 |  | HomePage · l.413 |
| «Cuéntanos sobre tu proyecto» | h3 |  | HomePage · l.428 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Enviando... / Enviar Mensaje [→]» (submits the form) |  |  | `{isSubmitting}` | `testid=contact-submit` | HomePage · l.500 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Conversemos tu escuela →» | `#contacto` |  | `testid=hero-cta-contacto` | HomePage · l.159 |
| «Ver los programas» | `/programas` |  | `testid=hero-cta-programas` | HomePage · l.162 |
| «Conoce las Pasantías en Barcelona» | `/pasantias` |  | `testid=inspira-pasantias-cta` | HomePage · l.376 |
| «info@nuevaeducacion.org» | `mailto:info@nuevaeducacion.org` |  |  | HomePage · l.421 |

**Fields** (7)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Nombre *» | text | `nombre` · «Tu nombre completo» · required |  |  | `id=nombre (id used by code)` | HomePage · l.444 |
| «Email *» | email | `email` · «tu@email.com» · required |  |  | `id=email (id used by code)` | HomePage · l.448 |
| «Institución *» | text | `institucion` · «Nombre de tu institución» · required |  |  | `id=institucion (id used by code)` | HomePage · l.452 |
| «Cargo» | text | `cargo` · «Tu cargo o función» |  |  | `id=cargo (id used by code)` | HomePage · l.456 |
| «¿Qué te interesa? *» | select | `interes` · required | «Selecciona una opción», «Inspira (Pasantía en Barcelona)», «Inicia», «Evoluciona», «Aula Generativa», «Otro Proyecto» |  | `id=interes (id used by code)` | HomePage · l.460 |
| «Mensaje *» | textarea | `mensaje` · «Cuéntanos sobre tu institución y cómo podemos ayudarte a transformar la educación...» · required |  |  | `id=mensaje (id used by code)` | HomePage · l.471 |
| «Sitio web» | text | `website` |  |  | `testid=contact-website id=website (id used by code)` | HomePage · l.489 |

**Embedded media** (8)

| What | Shown when | Hook | Where |
|---|---|---|---|
| video · /sitio/hero.mp4 |  |  | HomePage · l.132 |
| img · alt Cinco estudiantes abrazados en círculo, vistos desde arriba · /sitio/abrazo.jpg |  |  | HomePage · l.229 |
| img · alt Estudiantes juegan al aire libre durante una actividad de Aula Generativa · /aula-generativa-activity.jpg |  |  | HomePage · l.251 |
| img · alt Grupo de pasantes frente a la Escola Virolai, en Barcelona · /images/pasantias/pasantes-virolai.jpg |  |  | HomePage · l.384 |
| img · alt Educadoras chilenas en la biblioteca de una escuela de Barcelona · /images/pasantias/educadores-biblioteca.jpg |  |  | HomePage · l.387 |
| img · alt Niños observan con microscopios en un aula de Barcelona · /sitio/bcn-microscopios.jpg |  |  | HomePage · l.390 |
| img · alt Vista aérea de Barcelona · /images/pasantias/bcn-skyline.jpg |  |  | HomePage · l.393 |
| img · alt Aula de aprendizaje con trabajo por ambientes · /sitio/bcn-ambientes.jpg |  |  | HomePage · l.396 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleContactSubmit}` |  | HomePage · l.441 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «¡Mensaje enviado exitosamente! Te responderemos pronto.» | `setSubmitMessage` | `response.ok` | handleContactSubmit · l.108 |
| «Error al enviar el mensaje. Por favor intenta nuevamente.» | `setSubmitError` | `!(response.ok)` | handleContactSubmit · l.112 |
| «Error de conexión. Por favor verifica tu conexión a internet e intenta nuevamente.» | `setSubmitError` |  | handleContactSubmit · l.116 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!('ResizeObserver' in window)` | HomePage · l.38 |

**Pieces placed here, with the texts and settings handed to them** (7)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SiteLayout` | active: inicio · title: Fundación Nueva Educación · Educación relacional para transformar la escuela · description: Acompañamos a comunidades educativas en un cambio cultural profundo, desde la calidad de sus relaciones. Programas Inicia, Inspira, Evoluciona y Aula Generativa. ATE certificada por RPA Mineduc. |  |  | HomePage · l.125 |
| `RedAliada` |  |  |  | HomePage · l.187 |
| `Sociograma` |  |  |  | HomePage · l.245 |
| `ViasEje` |  |  |  | HomePage · l.303 |
| `Puertas` |  |  |  | HomePage · l.305 |
| `MapaChile` |  |  |  | HomePage · l.402 |
| `Novedades` |  |  |  | HomePage · l.405 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `HERO_WORDS` | «La» | l.16 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (12)

| Kind | What | Where |
|---|---|---|
| scroll | `target.scrollIntoView()` | hold · l.49 |
| timer | `setTimeout(…, 8000)` | hold · l.51 |
| listener | `window.addEventListener('hashchange')` | HomePage · l.68 |
| mark | `id=inicio` | HomePage · l.131 |
| mark | `id=relacional` | HomePage · l.190 |
| mark | `id=origen` | HomePage · l.248 |
| mark | `id=pasantias` | HomePage · l.309 |
| mark | `testid=cohort-headline` | HomePage · l.328 |
| mark | `testid=cohort-programs` | HomePage · l.329 |
| mark | `id=contacto` | HomePage · l.408 |
| role | `role=status` | HomePage · l.431 |
| role | `role=alert` | HomePage · l.436 |

**Values shown from data** (4)

- `{COHORT_HEADLINE}` — HomePage · l.328
- `{COHORT_PROGRAMS.map((program) => pr…}` — HomePage · l.329
- `{submitMessage}` — HomePage · l.432, when `submitMessage`
- `{submitError}` — HomePage · l.437, when `submitError`

**Other texts on screen** (54)

- «Fundación Nueva Educación · ATE certificada por RPA Mineduc» — HomePage · l.138
- «La nueva educación es relacional» — HomePage · l.152
- «Acompañamos a comunidades educativas en un cambio cultural profundo. Empieza donde empieza todo aprendizaje: en la calidad de las relaciones entre estudiantes, docentes, directivos y familias.» — HomePage · l.155
- «Colegios en programas de transformación» — HomePage · l.170
- «Ciudades de Chile, de Iquique a Osorno» — HomePage · l.174
- «Pasantes internacionales en Barcelona» — HomePage · l.178
- «Escuelas colaboradoras en Barcelona» — HomePage · l.182
- «Por qué relacional» — HomePage · l.193
- «Se aprende con otros, de otros y para otros. Por eso una escuela no cambia de verdad cuando cambia sus horarios, sus muebles o su tecnología. Cambia cuando cambia la manera en que sus personas se relacionan.» — HomePage · l.198
- «A eso lo llamamos Educación Relacional: poner la calidad de los vínculos en el centro del proyecto educativo y dejar que desde ahí se ordenen el aprendizaje, la evaluación, el liderazgo y la relación con las familias.» — HomePage · l.203
- «Entre» — HomePage · l.210
- «estudiantes» — HomePage · l.210
- «: pares que se cuidan y aprenden juntos» — HomePage · l.210
- «Entre» — HomePage · l.214
- «estudiantes y docentes» — HomePage · l.214
- «: confianza para atreverse» — HomePage · l.214
- «Entre» — HomePage · l.218
- «docentes» — HomePage · l.218
- «: equipos que crean en vez de trabajar a solas» — HomePage · l.218
- «Entre» — HomePage · l.222
- «la escuela y sus familias» — HomePage · l.222
- «: aliadas del proyecto educativo» — HomePage · l.222
- «en relación» — HomePage · l.240
- «el espíritu de Los Pellines» — HomePage · l.258
- «De dónde venimos» — HomePage · l.261
- «En Los Pellines nos hemos dedicado por más de 30 años al cuidado y fortalecimiento de la calidad de las relaciones. Hoy llevamos ese espíritu a la sala de clases con el Aula Generativa, una propuesta que pone en el centro el Aprendizaje con Sentido.» — HomePage · l.266
- «años de experiencia» — HomePage · l.273
- «niños y niñas» — HomePage · l.277
- «Características de un Aula Generativa» — HomePage · l.280
- «Estudiantes y docentes altamente motivados trabajando juntos.» — HomePage · l.284
- «Las relaciones saludables impulsan el aprendizaje significativo.» — HomePage · l.288
- «Cultura de curso fortalecida, con una identidad positiva compartida.» — HomePage · l.292
- «Los estudiantes enseñan, explican y reflexionan entre pares.» — HomePage · l.296
- «Programa Inspira» — HomePage · l.313
- «Transforma tu visión educativa con una experiencia única de innovación en el corazón de Europa» — HomePage · l.318
- «CUPOS POR» — HomePage · l.323
- «ORDEN DE RESERVA» — HomePage · l.324
- «Próxima cohorte» — HomePage · l.327
- «Participa activamente en aulas de Nueva Educación como co-docente» — HomePage · l.341
- «Conoce de primera mano las metodologías más vanguardistas de Europa» — HomePage · l.348
- «Participa en workshops con expertos internacionales en educación» — HomePage · l.355
- «Conversa con los equipos directivos, educadores y estudiantes de las escuelas que te reciben» — HomePage · l.362
- «Recibe bibliografía recomendada, una bitácora y un sistema de registro de tus aprendizajes al menos un mes antes del viaje» — HomePage · l.369
- «Contáctanos» — HomePage · l.412
- «¿Quieres transformar tu institución educativa? Conversemos sobre cómo podemos acompañar tu proceso de transformación.» — HomePage · l.417
- «Santiago, Chile» — HomePage · l.422
- «ATE certificada por RPA Mineduc» — HomePage · l.423
- «Nombre *» (label) — HomePage · l.443
- «Email *» (label) — HomePage · l.447
- «Institución *» (label) — HomePage · l.451
- «Cargo» (label) — HomePage · l.455
- «¿Qué te interesa? *» (label) — HomePage · l.459
- «Mensaje *» (label) — HomePage · l.470
- «Sitio web» (label) — HomePage · l.488

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `components/site/MapaChile.tsx`
- `components/site/NewsCard.tsx`
- `components/site/Novedades.tsx`
- `components/site/Puertas.tsx`
- `components/site/RedAliada.tsx`
- `components/site/SiteLayout.tsx`
- `components/site/Sociograma.tsx`
- `components/site/ViasEje.tsx`
- `components/site/chilePath.ts`
- `components/site/news.ts`
- `components/site/programsData.ts`
- `components/site/useSiteEffects.ts`
- `lib/legal/privacy-notice.ts`
- `lib/pasantias/cohort-public.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/contact` | POST | `pages/index.tsx:97` |
| `/api/news` | GET | `components/site/news.ts:55` |

## /nosotros

File `pages/nosotros.tsx` · 110 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/Footer.tsx:94`, `components/layout/FooterNuevo.tsx:18`, `components/site/SiteLayout.tsx:175`, `components/site/SiteLayout.tsx:26`, `lib/look.ts:104`, `pages/equipo.tsx:23`
- Tests: browser tests that CI runs: `tests/e2e/footer-heading-order.spec.ts`; browser tests CI skips: `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (5)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Somos una red que reflexiona y crea soluciones para la educación del siglo XXI» | h1 |  | NosotrosPage · l.34 |
| «Lo que hacemos» | h2 |  | NosotrosPage · l.46 |
| «{verb.name}» | h3 | `each VERBS` | NosotrosPage · l.51 |
| «Una red que ya está cambiando escuelas» | h2 |  | NosotrosPage · l.64 |
| «La escuela se transforma desde sus vínculos» | h2 |  | NosotrosPage · l.93 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Conversemos →» | `/#contacto` |  | `testid=nosotros-cierre-contacto` | NosotrosPage · l.98 |
| «Ver los programas» | `/programas` |  | `testid=nosotros-cierre-programas` | NosotrosPage · l.101 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SiteLayout` | active: nosotros · title: Nosotros · Fundación Nueva Educación · description: Somos una red que reflexiona y crea soluciones para la educación del siglo XXI: un equipo multidisciplinario experto en procesos de cambio cultural en el mundo de la educación. |  |  | NosotrosPage · l.27 |
| `PageHero` |  |  |  | NosotrosPage · l.32 |
| `TeamSection` |  |  |  | NosotrosPage · l.88 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `VERBS` | «Transformar», «Acompañamos a las comunidades educativas en procesos profundos de transformación cultural, facilitando el cambio desde adentro. Trabajamos codo a codo con dire…», «Conectar», «Sinergizamos redes vivas de colaboración entre escuelas innovadoras de Chile, España y América Latina. Estas redes permiten que las comunidades educativas comp…», «Innovar», «Desarrollamos herramientas e instrumentos propios para implementar, medir y ejecutar procesos de transformación educativa. Creamos metodologías de diagnóstico,…» | l.7 |

**Other texts written in the code (safety net: not tied to an element by the script)** (3)

| Text | Where |
|---|---|
| «Acompañamos a las comunidades educativas en procesos profundos de transformación cultural, facilitando el cambio desde adentro. Trabajamos codo a codo con directivos, docentes, estudiantes y familias para co-crear una nueva cultura escolar centrada en el desarrollo integral y el bienestar de toda l…» | VERBS · l.11 |
| «Sinergizamos redes vivas de colaboración entre escuelas innovadoras de Chile, España y América Latina. Estas redes permiten que las comunidades educativas compartan sus experiencias, aprendan unas de otras y co-construyan soluciones a desafíos comunes. A través de pasantías internacionales, encuent…» | VERBS · l.16 |
| «Desarrollamos herramientas e instrumentos propios para implementar, medir y ejecutar procesos de transformación educativa. Creamos metodologías de diagnóstico, matrices de evaluación, protocolos de implementación y sistemas de seguimiento que permiten a las escuelas gestionar su cambio de manera si…» | VERBS · l.21 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| mark | `id=que-hacemos` | NosotrosPage · l.44 |
| mark | `id=impacto` | NosotrosPage · l.60 |

**Values shown from data** (2)

- `{String(index + 1).padStart(2, '0')}` — NosotrosPage · l.50, when `each VERBS`
- `{verb.text}` — NosotrosPage · l.52, when `each VERBS`

**Other texts on screen** (8)

- «Nosotros» — NosotrosPage · l.33
- «Un equipo multidisciplinario experto en facilitar procesos de Cambio Cultural en el mundo de la educación, pionero en la aplicación de los principios de la Nueva Educación en programas de formación para estudiantes y programas de cambio en equipos directivos y docentes.» — NosotrosPage · l.38
- «Nuestro impacto» — NosotrosPage · l.63
- «Escuelas de vanguardia colaboradoras en Barcelona» — NosotrosPage · l.70
- «Colegios han pasado por nuestros programas de transformación» — NosotrosPage · l.74
- «Pasantes internacionales a Barcelona» — NosotrosPage · l.78
- «Colegios han confiado en nuestros programas de pasantías internacionales» — NosotrosPage · l.82
- «Conversemos sobre cómo podemos acompañar a tu comunidad educativa.» — NosotrosPage · l.96

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `components/site/PageHero.tsx`
- `components/site/SiteLayout.tsx`
- `components/site/TeamSection.tsx`
- `components/site/teamData.ts`
- `components/site/useSiteEffects.ts`
- `lib/legal/privacy-notice.ts`

## /noticias

File `pages/noticias.tsx` · 249 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/Footer.tsx:93`, `components/layout/FooterNuevo.tsx:17`, `components/panel/PanelClasico.tsx:273`, `components/panel/PanelClasico.tsx:274`, `components/panel/PanelNuevo.tsx:290`, `components/site/Novedades.tsx:35`, `components/site/SiteLayout.tsx:174`, `components/site/SiteLayout.tsx:25`, `lib/look.ts:107`, `pages/noticias/[slug].tsx:103`, `pages/noticias/[slug].tsx:126`, `pages/noticias/[slug].tsx:76`
- Tests: browser tests that CI runs: `tests/e2e/footer-heading-order.spec.ts`; browser tests CI skips: `tests/e2e/panel-pin.spec.ts`, `tests/e2e/urgent-anonymous-boundaries.spec.ts`, `tests/e2e/urgent-anonymous-current.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (7)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Lo que está pasando en la Nueva Educación» | h1 |  | NewsPage · l.121 |
| «Próximos eventos» | h2 | `upcoming.length > 0` | NewsPage · l.135 |
| «{event.title}» | h3 | `upcoming.length > 0 && each upcoming` | NewsPage · l.144 |
| «Noticias» | h2 |  | NewsPage · l.162 |
| «{lead.title}» | h2 | `!(loading) && !(error) && !(articles.length === 0)` | NewsPage · l.198 |
| «Eventos anteriores» | h2 | `events.pastEvents.length > 0` | NewsPage · l.215 |
| «{event.title}» | h3 | `events.pastEvents.length > 0 && each events.pastEvents.slice(0, pastShown)` | NewsPage · l.222 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Leer menos / Leer más» | `{() => setOpen((value) => !value)}` | `long` |  | `testid=evento-leer-mas` | EventText · l.45 |
| «Intentar nuevamente» | `{() => { setLoading(true); fetchArticles(); }}` | `!(loading) && error` |  | `testid=noticias-reintentar` | NewsPage · l.172 |
| «Ver más eventos» | `{() => setPastShown((count) => count + PAST_EVENTS_STEP)}` | `events.pastEvents.length > 0 && events.pastEvents.length > pastShown` |  | `testid=eventos-ver-mas` | NewsPage · l.233 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{event.link_display} / Más información →» | `{event.link_url}` (new tab) | `upcoming.length > 0 && each upcoming && event.link_url` |  | NewsPage · l.151 |
| «{articleDate(lead)} {lead.title} {excerpt(lead.content_html, 220)} Leer la noticia →» | `/noticias/[*]` | `!(loading) && !(error) && !(articles.length === 0)` | `testid=noticia-{lead.slug}` | NewsPage · l.191 |
| «{event.link_display} / Más información →» | `{event.link_url}` (new tab) | `events.pastEvents.length > 0 && each events.pastEvents.slice(0, pastShown) && event.link_url` |  | NewsPage · l.225 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {lead.title} · {lead.featured_image} | `!(loading) && !(error) && !(articles.length === 0) && lead.featured_image` |  | NewsPage · l.193 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «La solicitud tardó demasiado en responder. Por favor, intenta nuevamente.» | `setError` | `caught instanceof Error && caught.name === 'AbortError'` | fetchArticles · l.72 |
| «No pudimos cargar las noticias. Por favor, intenta nuevamente.» | `setError` | `!(caught instanceof Error && caught.name === 'AbortError')` | fetchArticles · l.74 |
| «Error loading events» | `throw (shown by whoever catches it)` | `!response.ok` | fetchEvents · l.86 |

**Pieces placed here, with the texts and settings handed to them** (3)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SiteLayout` | active: noticias · title: Noticias y eventos · Fundación Nueva Educación · description: Mantente informado sobre las últimas actividades y eventos de la Fundación Nueva Educación |  |  | NewsPage · l.114 |
| `PageHero` |  |  |  | NewsPage · l.119 |
| `NewsCard` |  | `!(loading) && !(error) && !(articles.length === 0) && each rest` |  | NewsPage · l.207 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `SHORT_MONTHS` | «ENE», «FEB», «MAR», «ABR», «MAY», «JUN», «JUL», «AGO», «SEP», «OCT», «NOV», «DIC» | l.16 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 10000)` | fetchArticles · l.65 |
| role | `role=status` | NewsPage · l.164 |
| role | `role=alert` | NewsPage · l.169 |

**Values shown from data** (6)

- `{text}` — EventText · l.43
- `{eventDays(event)}` — NewsPage · l.140, when `upcoming.length > 0 && each upcoming`
- `{eventMonth(event)}` — NewsPage · l.141, when `upcoming.length > 0 && each upcoming`
- `{event.location} · {event.time}` — NewsPage · l.145, when `upcoming.length > 0 && each upcoming`
- `{error}` — NewsPage · l.171, when `!(loading) && error`
- `{eventRange(event)} · {event.location}` — NewsPage · l.219, when `events.pastEvents.length > 0 && each events.pastEvents.slice(0, pastShown)`

**Other texts on screen** (4)

- «Noticias y eventos» — NewsPage · l.120
- «Mantente informado sobre las últimas actividades, eventos y transformaciones que estamos impulsando en el mundo de la educación. Historias de cambio, innovación pedagógica y el impacto de nuestros programas en comunidades educativas.» — NewsPage · l.125
- «Cargando noticias…» — NewsPage · l.166, when `loading`
- «Pronto publicaremos nuestras primeras noticias.» — NewsPage · l.187, when `!(loading) && !(error) && articles.length === 0`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `components/site/NewsCard.tsx`
- `components/site/PageHero.tsx`
- `components/site/SiteLayout.tsx`
- `components/site/news.ts`
- `components/site/useSiteEffects.ts`
- `lib/legal/privacy-notice.ts`
- `utils/dateUtils.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/news` | GET | `components/site/news.ts:55` |
| `/api/public/events` | GET | `pages/noticias.tsx:85` |

## /noticias/[slug]

File `pages/noticias/[slug].tsx` · 157 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/NewsSlider.tsx:169`, `components/NewsSlider.tsx:194`, `components/NewsSlider.tsx:213`, `components/NewsSlider.tsx:214`, `components/panel/PanelClasico.tsx:294`, `components/panel/PanelClasico.tsx:296`, `components/panel/PanelNuevo.tsx:309`, `components/panel/PanelNuevo.tsx:311`, `components/site/NewsCard.tsx:15`, `components/site/NewsCard.tsx:17`, `lib/look.ts:108`, `pages/noticias.tsx:191`
- Tests: browser tests that CI runs: `tests/e2e/footer-heading-order.spec.ts`; browser tests CI skips: `tests/e2e/panel-pin.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{error} / Artículo no encontrado» | h1 | `(loading \|\| error \|\| !article) && !(loading)` | ArticlePage · l.74 |
| «{article.title}» | h1 |  | ArticlePage · l.106 |
| «Más historias de transformación» | h2 | `others.length > 0` | ArticlePage · l.143 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Enlace copiado / Copiar enlace» | `{copyLink}` |  |  | `testid=articulo-copiar` | ArticlePage · l.130 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «← Volver a noticias» | `/noticias` | `(loading \|\| error \|\| !article) && !(loading)` | `testid=articulo-volver` | ArticlePage · l.76 |
| «← Noticias» | `/noticias` |  | `testid=articulo-volver` | ArticlePage · l.103 |
| «← Ver todas las noticias» | `/noticias` |  | `testid=articulo-todas` | ArticlePage · l.126 |
| «Contactar con FNE» | `/#contacto` |  | `testid=articulo-contacto` | ArticlePage · l.133 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {article.title} · {article.featured_image} | `article.featured_image` |  | ArticlePage · l.117 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Artículo no encontrado» | `setError` | `!found` | ArticlePage · l.29 |
| «Error al cargar el artículo» | `setError` |  | ArticlePage · l.38 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!slug` | ArticlePage · l.19 |
| `cancelled` | ArticlePage · l.25 |
| `cancelled` | ArticlePage · l.36 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SiteLayout` | active: noticias · title: {loading ? 'Cargando artícul…} · Fundación Nueva Educación · description: Noticias de la Fundación Nueva Educación | `loading \|\| error \|\| !article` |  | ArticlePage · l.60 |
| `SiteLayout` | active: noticias · title: {article.title} · Fundación Nueva Educación |  |  | ArticlePage · l.92 |
| `ArticleContent` |  |  |  | ArticlePage · l.123 |
| `NewsCard` |  | `others.length > 0 && each others` |  | ArticlePage · l.148 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `author` | «Equipo FNE» | ArticlePage · l.87 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 2500)` | copyLink · l.52 |
| role | `role=status` | ArticlePage · l.71 |
| address value | `[slug] (part of the address)` | l.1 |

**Values shown from data** (1)

- `{articleDate(article)}` — ArticlePage · l.108

**Other texts on screen** (3)

- «Cargando artículo…» — ArticlePage · l.71, when `(loading \|\| error \|\| !article) && loading`
- «El artículo que buscas no existe o ya no está disponible.» — ArticlePage · l.75, when `(loading \|\| error \|\| !article) && !(loading)`
- «Por {author}» — ArticlePage · l.109, when `author`

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/ArticleContent.tsx`
- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `components/site/NewsCard.tsx`
- `components/site/SiteLayout.tsx`
- `components/site/news.ts`
- `components/site/useSiteEffects.ts`
- `lib/legal/privacy-notice.ts`
- `lib/sanitize.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/news` | GET | `components/site/news.ts:55` |

## /pasantias

File `pages/pasantias.tsx` · 1341 lines · frame: none · getServerSideProps

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/Footer.tsx:91`, `components/layout/FooterNuevo.tsx:15`, `components/site/SiteLayout.tsx:172`, `components/site/SiteLayout.tsx:23`, `lib/look.ts:109`, `lib/pasantias/pdf/contact.ts:22`, `pages/index.tsx:376`, `pages/programas.tsx:157`
- Tests: browser tests that CI runs: `tests/e2e/footer-heading-order.spec.ts`, `tests/e2e/pasantias-flow.spec.ts`, `tests/e2e/pasantias-form.spec.ts`, `tests/e2e/pasantias-page.spec.ts`; unit tests of the page: `__tests__/pages/pasantias-hardcoded-cohort.test.ts`, `__tests__/pages/pasantias.test.tsx`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (19)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{title}» | h2 |  | SectionHeader · l.347 |
| «{program.name}» | h3 | screen size: `lg:grid` | ProgramCalendar · l.436 |
| «Vive una escuela por dentro, no la visites» | h1 |  | PasantiasPage · l.589 |
| «{program.name}» | h3 | `each [inspira, mirada]` | PasantiasPage · l.721 |
| «{heading}» | h3 | `each COHORT_DAY_STRUCTURE && heading` · screen size: `lg:block` | PasantiasPage · l.894 |
| «{inspira.name}» | h3 |  | PasantiasPage · l.949 |
| «{inspira.weeks[0].label}» | h4 |  | PasantiasPage · l.961 |
| «{school.name}» | h5 | `each inspira.immersionSchools` | PasantiasPage · l.971 |
| «{inspira.weeks[1].label}» | h4 |  | PasantiasPage · l.986 |
| «{name}» | h5 | `each inspira.visits.candidates` | PasantiasPage · l.1004 |
| «{mirada.name}» | h3 |  | PasantiasPage · l.1023 |
| «{name}» | h4 | `each mirada.schools` | PasantiasPage · l.1045 |
| «Antes del viaje» | h3 |  | PasantiasPage · l.1069 |
| «Cierre · {closingDate}» | h3 |  | PasantiasPage · l.1075 |
| «Seguimiento» | h3 |  | PasantiasPage · l.1081 |
| «{host.name}» | h3 | `each COHORT_HOSTS` | PasantiasPage · l.1139 |
| «Incluye» | h2 |  | PasantiasPage · l.1160 |
| «No incluye» | h2 |  | PasantiasPage · l.1193 |
| «Conversemos antes de que se cierre la cohorte» | h2 |  | PasantiasPage · l.1320 |

**Links** (8)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «formulario de contacto» | `/#contacto` |  |  | PasantiasPage · l.524 |
| «{COHORT_CONTACT.email}» | `mailto:[*]` |  |  | PasantiasPage · l.528 |
| «Ver los programas» | `#programas` |  | `testid=pasantias-cta-programas` | PasantiasPage · l.617 |
| «Registra tu interés» | `#programa` |  | `testid=pasantias-cta-programa` | PasantiasPage · l.627 |
| «Descarga la ficha» | `{FICHA_HREF}` |  | `testid=pasantias-cta-ficha` | PasantiasPage · l.630 |
| «Me interesa {program.shortName}» | `#programa` | `each [inspira, mirada]` | `testid=pasantias-cta-program-{program.id}` | PasantiasPage · l.758 |
| «Descarga la ficha (PDF)» | `{FICHA_HREF}` |  | `testid=pasantias-cta-ficha-programa` | PasantiasPage · l.1250 |
| «WhatsApp {COHORT_CONTACT.whatsapp}» | `{whatsappHref()}` (new tab) |  | `testid=pasantias-cta-whatsapp` | PasantiasPage · l.1326 |

**Embedded media** (5)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · {src} |  |  | PhotoBreak · l.398 |
| img · alt Barcelona, sede de las Pasantías INSPIRA · {photos.hero} | `photos.hero` |  | PasantiasPage · l.569 |
| img · alt {DAY_PHOTO_ALT} · {photos.unDia} | `photos.unDia` | `testid=pasantias-dia-photo` | PasantiasPage · l.855 |
| img · {portraits[index] as string} | `each COHORT_HOSTS && portraits[index]` | `testid=pasantias-host-portrait-{index}` | PasantiasPage · l.1113 |
| img · {photos.barcelonaTarde} | `photos.barcelonaTarde` |  | PasantiasPage · l.1307 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!src` | PhotoBreak · l.395 |

**Pieces placed here, with the texts and settings handed to them** (12)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SiteLayout` | active: pasantias |  |  | PasantiasPage · l.538 |
| `SectionHeader` | eyebrow: Por qué {COHORT_CITY} · titleId: barcelona-title |  |  | PasantiasPage · l.678 |
| `Ecosistema` |  |  |  | PasantiasPage · l.699 |
| `SectionHeader` | eyebrow: Elige tu programa · titleId: programas-title |  |  | PasantiasPage · l.711 |
| `SectionHeader` | title: El calendario · titleId: calendario-title |  |  | PasantiasPage · l.781 |
| `SectionHeader` | eyebrow: Dentro de la escuela · title: Cómo es un día · titleId: dia-title |  |  | PasantiasPage · l.836 |
| `SectionHeader` | eyebrow: {COHORT_CITY} · {COHORT_LABEL} · title: Las escuelas · titleId: escuelas-title |  |  | PasantiasPage · l.938 |
| `SectionHeader` | title: {mirada.name}: antes, durante y después · titleId: mirada-title |  |  | PasantiasPage · l.1062 |
| `SectionHeader` | eyebrow: En las escuelas · title: Quién te recibe · titleId: equipo-title |  |  | PasantiasPage · l.1099 |
| `SectionHeader` | title: Registra tu interés · titleId: programa-title |  |  | PasantiasPage · l.1224 |
| `LeadForm` |  |  |  | PasantiasPage · l.1256 |
| `SectionHeader` | eyebrow: Antes de decidir · title: Preguntas frecuentes · titleId: faq-title |  |  | PasantiasPage · l.1268 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (9)

| Name | Texts | Where |
|---|---|---|
| `message` | «Hola, quiero información sobre las Pasantías INSPIRA Barcelona ({COHORT_LABEL}).» | whatsappHref · l.107 |
| `PAGE_TITLE` | «Pasantías INSPIRA Barcelona · {COHORT_HEADLINE} \| Fundación Nueva Educación» | l.114 |
| `SHELL` | «wrap w-full» | l.289 |
| `EYEBROW` | «pas-k block» | l.291 |
| `BUTTON_ACCENT` | «btn mag» | l.304 |
| `BUTTON_GHOST_DARK` | «btn ghost» | l.305 |
| `DAY_MOMENT_HEADINGS` | «Conocer», «Observar y Preguntar», «Profundizar» | l.323 |
| `DAY_PHOTO_ALT` | «Una mano coloca una tarjeta sobre un muro de vidrio.» | l.329 |
| `faqs` | «¿Qué programa me corresponde?», «¿Necesito hablar catalán?», «¿Viajan juntos los programas?», «¿Cómo reservo mi cupo?», «¿Podemos ir como delegación de un colegio?» | PasantiasPage · l.486 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «{COHORT_HEADLINE}. {inspira.name}: {inspira.audience}, {formatNumber( inspira.schoo…} días en escuelas. {mirada.name}: {mirada.audience}, {formatNumber( mirada.school…} días en escuelas. {COHORT_TOGETHER}.» | buildMetaDescription · l.123 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (47)

| Kind | What | Where |
|---|---|---|
| mark | `testid=pasantias-calendar-{program.id}` | ProgramCalendar · l.431 |
| mark | `testid=pasantias-week-{program.id}-{week.id}` | ProgramCalendar · l.438 |
| mark | `testid=pasantias-hero id=hero` | PasantiasPage · l.567 |
| mark | `testid=pasantias-date-chip` | PasantiasPage · l.592 |
| mark | `testid=pasantias-hero-stats` | PasantiasPage · l.595 |
| mark | `testid=pasantias-hero-routes` | PasantiasPage · l.607 |
| mark | `testid=pasantias-hero-route-{index}` | PasantiasPage · l.612 |
| mark | `testid=pasantias-claims` | PasantiasPage · l.638 |
| mark | `testid=pasantias-claim-{index}` | PasantiasPage · l.648 |
| mark | `testid=pasantias-accreditation` | PasantiasPage · l.660 |
| mark | `testid=pasantias-barcelona id=barcelona` | PasantiasPage · l.670 |
| mark | `testid=pasantias-programas id=programas` | PasantiasPage · l.705 |
| mark | `testid=pasantias-program-{program.id}` | PasantiasPage · l.715 |
| mark | `id=escuela-interior` | PasantiasPage · l.771 |
| mark | `testid=pasantias-calendario id=calendario` | PasantiasPage · l.774 |
| mark | `testid=pasantias-finde` | PasantiasPage · l.798 |
| mark | `testid=pasantias-free-weekend-dates` | PasantiasPage · l.804 |
| mark | `testid=pasantias-dia-tipo id=un-dia` | PasantiasPage · l.823 |
| mark | `testid=pasantias-dia-lead` | PasantiasPage · l.841 |
| mark | `testid=pasantias-day-block-{index}` | PasantiasPage · l.880 |
| mark | `testid=pasantias-day-block-{index}-numeral` | PasantiasPage · l.886 |
| mark | `testid=pasantias-day-block-{index}-text` | PasantiasPage · l.898 |
| mark | `id=barcelona-calle` | PasantiasPage · l.912 |
| mark | `testid=pasantias-escuelas id=escuelas` | PasantiasPage · l.932 |
| mark | `testid=pasantias-escuelas-{inspira.id}` | PasantiasPage · l.944 |
| mark | `testid=pasantias-escuelas-{inspira.id}-{inspira.weeks[0].id}` | PasantiasPage · l.957 |
| mark | `testid=pasantias-school-inmersion-{index}` | PasantiasPage · l.966 |
| mark | `testid=pasantias-escuelas-{inspira.id}-{inspira.weeks[1].id}` | PasantiasPage · l.982 |
| mark | `testid=pasantias-visit-count` | PasantiasPage · l.989 |
| mark | `testid=pasantias-school-visita-{index}` | PasantiasPage · l.999 |
| mark | `testid=pasantias-full-day` | PasantiasPage · l.1010 |
| mark | `testid=pasantias-escuelas-{mirada.id}` | PasantiasPage · l.1018 |
| mark | `testid=pasantias-mirada-days` | PasantiasPage · l.1029 |
| mark | `testid=pasantias-school-mirada-{index}` | PasantiasPage · l.1039 |
| mark | `testid=pasantias-mirada-extra id=antes-durante-despues` | PasantiasPage · l.1055 |
| mark | `id=equipo-foto` | PasantiasPage · l.1090 |
| mark | `testid=pasantias-equipo id=equipo` | PasantiasPage · l.1093 |
| mark | `testid=pasantias-host-{index}` | PasantiasPage · l.1107 |
| mark | `testid=pasantias-host-initials-{index}` | PasantiasPage · l.1126 |
| mark | `testid=pasantias-incluye id=incluye` | PasantiasPage · l.1153 |
| mark | `testid=pasantias-lunches-{index}` | PasantiasPage · l.1171 |
| mark | `testid=pasantias-programa id=programa` | PasantiasPage · l.1215 |
| mark | `testid=pasantias-places` | PasantiasPage · l.1234 |
| mark | `testid=pasantias-registration-note` | PasantiasPage · l.1242 |
| mark | `testid=pasantias-faq id=faq` | PasantiasPage · l.1261 |
| mark | `testid=pasantias-faq-{index}` | PasantiasPage · l.1275 |
| mark | `testid=pasantias-cierre id=cierre` | PasantiasPage · l.1299 |

**Values shown from data** (31)

- `{eyebrow}` — SectionHeader · l.344
- `{week.label}` — ProgramCalendar · l.444, when `each program.weeks`, screen size: `lg:grid`
- `{ranges[index]}` — ProgramCalendar · l.447, when `each program.weeks`, screen size: `lg:grid`
- `{week.summary}` — ProgramCalendar · l.454, when `each program.weeks`, screen size: `lg:grid`
- `{COHORT_HEADLINE}` — PasantiasPage · l.592
- `{COHORT_TOGETHER}` — PasantiasPage · l.595
- `{route.program}` — PasantiasPage · l.614, when `each COHORT_ROUTING`
- `{figure}` — PasantiasPage · l.654, when `each COHORT_CLAIMS`
- `{caption}` — PasantiasPage · l.655, when `each COHORT_CLAIMS`
- `{COHORT_ACCREDITATION}` — PasantiasPage · l.660
- `{program.audience}` — PasantiasPage · l.728, when `each [inspira, mirada]`
- `{programRanges[index]}` — PasantiasPage · l.735, when `each [inspira, mirada]`
- `{program.overview}` — PasantiasPage · l.743, when `each [inspira, mirada]`
- `{program.takeaway}` — PasantiasPage · l.746, when `each [inspira, mirada]`
- `{spanRange} · {COHORT_TOGETHER}.` — PasantiasPage · l.782
- `{String(index + 1).padStart(2, '0')}` — PasantiasPage · l.886, when `each COHORT_DAY_STRUCTURE`, screen size: `lg:block`
- `{block}` — PasantiasPage · l.898, when `each COHORT_DAY_STRUCTURE`, screen size: `lg:block`
- `{inspira.overview}` — PasantiasPage · l.951
- `{inspira.visits.selection}` — PasantiasPage · l.1009
- `{mirada.orderCaveat}` — PasantiasPage · l.1049
- `{mirada.preparation}` — PasantiasPage · l.1070
- `{mirada.closing.text}` — PasantiasPage · l.1076
- `{mirada.followUp}` — PasantiasPage · l.1082
- `{host.name .split(' ') .filter((word…}` — PasantiasPage · l.1126, when `each COHORT_HOSTS && !(portraits[index])`
- `{host.note}` — PasantiasPage · l.1144, when `each COHORT_HOSTS`
- `{item}` — PasantiasPage · l.1167, when `each COHORT_INCLUDES`
- `{item}` — PasantiasPage · l.1179, when `each [inspira.lunches, mirada.lunches]`
- `{mirada.name}: {item}` — PasantiasPage · l.1187, when `each mirada.extraIncludes`
- `{item}` — PasantiasPage · l.1200, when `each COHORT_EXCLUDES`
- `{COHORT_PLACES}` — PasantiasPage · l.1234
- `{faq.answer}` — PasantiasPage · l.1290, when `each faqs`

**Other texts on screen** (27)

- «{COHORT_ROUTING[0].question} {COHORT_ROUTING[0].program}: {inspira.audience}. {COHORT_ROUTING[1].question} {COHORT_ROUTING[1].program}: {mirada.audience}.» — PasantiasPage · l.491
- «No. Las sesiones del programa se desarrollan en español: las presentaciones, las entrevistas y los talleres. En las escuelas vas a escuchar una mezcla de catalán y español, y el equipo de FNE acompaña las visitas.» — PasantiasPage · l.499
- «Sí. {COHORT_TOGETHER}. Los programas comparten el fin de semana libre: {COHORT_FREE_WEEKEND.label}.» — PasantiasPage · l.508
- «{COHORT_PLACES} Registra tu interés más abajo y descarga la ficha y el programa completo con los valores.» — PasantiasPage · l.515
- «Sí. Para cotizaciones grupales escríbenos por el» — PasantiasPage · l.523
- «o a» — PasantiasPage · l.527
- «y coordinamos una propuesta para tu equipo.» — PasantiasPage · l.531
- «Pasantías internacionales» — PasantiasPage · l.588
- «{route.question}» — PasantiasPage · l.613, when `each COHORT_ROUTING`
- «La red INSPIRA en cifras» (aria-label) — PasantiasPage · l.638
- «Un ecosistema,» — PasantiasPage · l.682
- «no una escuela suelta» — PasantiasPage · l.683
- «Cataluña lleva años sosteniendo una transformación educativa en red: escuelas muy distintas entre sí que comparten preguntas, herramientas y una manera de mirar al estudiante. Por eso la pasantía no es un tour por un colegio ejemplar, sino un recorrido por un ecosistema que se explica a sí mismo.» — PasantiasPage · l.689
- «Vas a entrar a las aulas, conversar con los equipos directivos, entrevistar a estudiantes y docentes, y cerrar cada día con un taller que ordena lo que viste.» — PasantiasPage · l.695
- «{formatNumber(program.school…} días en escuelas · {formatNumber( program.schoo…} escuelas» — PasantiasPage · l.738, when `each [inspira, mirada]`
- «Fin de semana libre» — PasantiasPage · l.803
- «{freeWeekendDates[0]} al {freeWeekendDates[1]}» — PasantiasPage · l.804
- «La escuela, contada por quienes la hacen.» — PasantiasPage · l.845
- «{formatNumber(school.days)} días por pasante» — PasantiasPage · l.974, when `each inspira.immersionSchools`
- «Cada cohorte visita {formatNumber(inspira.visits…} de estas {inspira.visits.candidates.l…} escuelas.» — PasantiasPage · l.989
- «{joinEs(inspira.visits.fullD…} están fuera de {COHORT_CITY} y toman el día completo.» — PasantiasPage · l.1010
- «{formatNumber(mirada.daysPer…} días completos por escuela» — PasantiasPage · l.1029
- «{host.role}, {host.school} —» — PasantiasPage · l.1143, when `each COHORT_HOSTS`
- «Elige el programa que te corresponde. Si te interesa más de uno, registra una solicitud por cada programa con el mismo correo.» — PasantiasPage · l.1231
- «Registrar tu interés no reserva un cupo. Después de enviarlo puedes descargar la ficha y el programa completo.» — PasantiasPage · l.1246
- «{faq.question} +» (label) — PasantiasPage · l.1281, when `each faqs`
- «Escríbenos por WhatsApp y te contamos cómo se prepara el viaje con tu equipo.» — PasantiasPage · l.1324

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `components/pasantias/LeadForm.tsx`
- `components/site/Ecosistema.tsx`
- `components/site/SiteLayout.tsx`
- `components/site/useSiteEffects.ts`
- `lib/legal/privacy-notice.ts`
- `lib/pasantias/cohort-public.ts`
- `lib/pasantias/consent.ts`
- `lib/pasantias/leads.ts`
- `lib/utils/app-url.ts`

### API addresses it calls

| Address | Method | Called from |
|---|---|---|
| `/api/pasantias/brochure` | ? | `components/pasantias/LeadForm.tsx:55` |
| `/api/pasantias/ficha` | ? | `components/pasantias/LeadForm.tsx:54`, `pages/pasantias.tsx:111` |
| `/api/pasantias/lead` | ? | `components/pasantias/LeadForm.tsx:52` |

## /privacidad

File `pages/privacidad.tsx` · 46 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `lib/look.ts:106`, `lib/pasantias/consent.ts:28`, `pages/registro-tractor.tsx:400`, `pages/registro-tractor.tsx:401`, `pages/registro.tsx:485`, `pages/registro.tsx:486`
- Tests: no browser test that CI runs.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Política de Privacidad» | h1 |  | PrivacidadPage · l.33 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Genera · Hub de Transformación · /genera/logo-horizontal-on-dark.svg |  |  | PrivacidadPage · l.25 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `PrivacyPolicyContent` |  |  |  | PrivacidadPage · l.36 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Política de privacidad de la plataforma Genera de la Fundación Nueva Educación (Ley 21.719).» | PrivacidadPage · l.17 |

**Other texts on screen** (2)

- «Política de Privacidad · Genera» — PrivacidadPage · l.14
- «© 2026 Fundación Nueva Educación · Santiago, Chile» — PrivacidadPage · l.40

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PrivacyPolicyContent.tsx`
- `lib/legal/privacy-notice.ts`

## /programas

File `pages/programas.tsx` · 202 lines · frame: none

### Who reaches it

- Menu: no entry.
- Middleware: not covered. Signed-out visitor: not stopped by the middleware. Forced password change holds this page: no.
- In the page: no access check found by the script.
- Linked from: `components/Footer.tsx:92`, `components/layout/FooterNuevo.tsx:16`, `components/site/Puertas.tsx:25`, `components/site/Puertas.tsx:28`, `components/site/SiteLayout.tsx:173`, `components/site/SiteLayout.tsx:24`, `lib/look.ts:103`, `pages/index.tsx:162`, `pages/nosotros.tsx:101`
- Tests: browser tests that CI runs: `tests/e2e/footer-heading-order.spec.ts`, `tests/e2e/pasantias-page.spec.ts`.

| Role | Sees it in the menu | Middleware |
|---|---|---|
| admin | — | pass |
| consultor | — | pass |
| equipo_directivo | — | pass |
| lider_generacion | — | pass |
| lider_comunidad | — | pass |
| supervisor_de_red | — | pass |
| community_manager | — | pass |
| docente | — | pass |
| encargado_licitacion | — | pass |

### What the page file itself draws

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Programas de evolución educativa» | h1 |  | ProgramasPage · l.66 |
| «Un modelo para armar tu propio viaje» | h2 |  | ProgramasPage · l.90 |
| «{step.name}» | h3 |  | ProgramasPage · l.128 |
| «¿Comenzamos este viaje de evolución?» | h2 |  | ProgramasPage · l.178 |

**Tabs** (2)

| Text | Does | Shown when | Where |
|---|---|---|---|
| «{item.name} {item.stage} · {item.detail}» | `{() => setCurrent(index)}` | `each JOURNEY` | ProgramasPage · l.103 |
| «{TAB_LABELS[key]}» | `{() => setTab(key)}` | `each tabs` | ProgramasPage · l.136 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Programa Estratégico para Directivos →» | `{() => setShowFlipbook(true)}` |  |  | `testid=directivos-flipbook-cta` | ProgramasPage · l.164 |

**Links** (4)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Conoce las Pasantías en Barcelona» | `/pasantias` | `step.id === 'inspira'` | `testid=inspira-pasantias-cta` | ProgramasPage · l.157 |
| «Contáctanos →» | `/#contacto` |  | `testid=programa-contacto` | ProgramasPage · l.161 |
| «Contáctanos →» | `/#contacto` |  | `testid=programas-cierre-contacto` | ProgramasPage · l.183 |
| «Accede a la plataforma» | `/login` |  | `testid=programas-cierre-plataforma` | ProgramasPage · l.186 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `FlipbookDialog` | component | `{showFlipbook}` | title: Programa Estratégico Para Directivos | ProgramasPage · l.193 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `current === shown` | ProgramasPage · l.43 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SiteLayout` | active: programas · title: Programas · Fundación Nueva Educación · description: Inicia, Inspira, Aula Generativa y Evoluciona: cuatro programas que se combinan para acompañar a cada comunidad educativa en su viaje hacia una educación de vanguardia. |  |  | ProgramasPage · l.59 |
| `PageHero` |  |  |  | ProgramasPage · l.64 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `TAB_LABELS` | «Objetivos», «Actividades», «Resultados» | l.11 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| scroll | `fichaRef.current.scrollIntoView()` | fromHash · l.34 |
| listener | `window.addEventListener('hashchange')` | ProgramasPage · l.37 |
| mark | `id=viaje` | ProgramasPage · l.85 |
| role | `role=tablist` | ProgramasPage · l.100 |
| role | `role=tablist` | ProgramasPage · l.134 |

**Values shown from data** (4)

- `{step.stage} · {step.detail}` — ProgramasPage · l.125
- `{program.subtitle}` — ProgramasPage · l.129
- `{program.description}` — ProgramasPage · l.133
- `{item}` — ProgramasPage · l.151, when `each items`

**Other texts on screen** (8)

- «Programas» — ProgramasPage · l.65
- «Descubre nuestros programas, diseñados para acompañar a las comunidades educativas en su viaje hacia una educación de vanguardia.» — ProgramasPage · l.70
- «La evolución de la cultura de una escuela se basa en la conservación de su identidad, en la elevación de sus fortalezas y en la creación colectiva de una nueva mirada y nuevas habilidades.» — ProgramasPage · l.79
- «El viaje de evolución» — ProgramasPage · l.89
- «Estos programas son autónomos y pueden combinarse según las necesidades de tu institución. Te presentamos un orden sugerido para iniciar y profundizar el cambio educativo.» — ProgramasPage · l.95
- «Programas» (aria-label) — ProgramasPage · l.100
- «El primer paso» — ProgramasPage · l.177
- «Comienza hoy el camino hacia una educación de vanguardia para tu institución.» — ProgramasPage · l.181

### Pieces it uses (each is listed once, under "Pieces" below)

- `components/PrivacyPolicyContent.tsx`
- `components/PrivacyPolicyModal.tsx`
- `components/TermsOfUseModal.tsx`
- `components/site/FlipbookDialog.tsx`
- `components/site/PageHero.tsx`
- `components/site/SiteLayout.tsx`
- `components/site/programsData.ts`
- `components/site/useSiteEffects.ts`
- `lib/legal/privacy-notice.ts`

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/ArticleContent.tsx

Used by: `/noticias/[slug]`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Play video» | `{() => setIsPlaying(true)}` | `!isPlaying` |  |  | VideoPlayer · l.31 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {title \|\| "Video thumbnail"} · {thumbnailUrl} | `!isPlaying` |  | VideoPlayer · l.18 |
| iframe · {title \|\| "YouTube video"} · {`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`} |  |  | VideoPlayer · l.69 |

**Other texts on screen** (2)

- «YouTube» — VideoPlayer · l.58, when `!isPlaying`
- «.article-content { line-height: 1.8; } .article-content p { margin-bottom: 1.5rem; color: #374151; text-indent: 2rem; } .article-content h1, .article-content h2, .article-content h3, .article-content h4, .article-content h5, .article-conte…» — ArticleContent · l.187

### components/PrivacyPolicyContent.tsx

Used by: `/equipo`, `/`, `/nosotros`, `/noticias`, `/noticias/[slug]`, `/pasantias`, `/privacidad`, `/programas`

**Titles** (10)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «1. Información que Recopilamos» | h3 |  | PrivacyPolicyContent · l.37 |
| «2. Uso de la Información» | h3 |  | PrivacyPolicyContent · l.50 |
| «3. Protección de Datos» | h3 |  | PrivacyPolicyContent · l.63 |
| «4. Compartir Información» | h3 |  | PrivacyPolicyContent · l.74 |
| «5. Retención de Datos» | h3 |  | PrivacyPolicyContent · l.85 |
| «6. Sus Derechos» | h3 |  | PrivacyPolicyContent · l.90 |
| «7. Cookies y Tecnologías Similares» | h3 |  | PrivacyPolicyContent · l.103 |
| «8. Menores de Edad» | h3 |  | PrivacyPolicyContent · l.108 |
| «9. Cambios a esta Política» | h3 |  | PrivacyPolicyContent · l.113 |
| «10. Contacto» | h3 |  | PrivacyPolicyContent · l.118 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{LEGAL_IDENTITY.contactEmail}» | `mailto:[*]` |  |  | PrivacyPolicyContent · l.127 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| mark | `testid=privacy-notice-version` | PrivacyPolicyContent · l.26 |
| mark | `testid=privacy-controller-identity` | PrivacyPolicyContent · l.30 |
| mark | `testid=privacy-contact-block` | PrivacyPolicyContent · l.122 |

**Values shown from data** (1)

- `{LEGAL_IDENTITY.brandName}` — PrivacyPolicyContent · l.123

**Other texts on screen** (41)

- «Última actualización: {PRIVACY_NOTICE_UPDATED_LABEL} · Versión {PRIVACY_NOTICE_VERSION}» — PrivacyPolicyContent · l.26
- «El responsable del tratamiento de sus datos personales es {LEGAL_IDENTITY.brandName} (razón social: {LEGAL_IDENTITY.legalName} , {LEGAL_IDENTITY.taxId} ), con domicilio en {LEGAL_IDENTITY.streetAddress} , {LEGAL_IDENTITY.city} , {LEGAL_IDE…» — PrivacyPolicyContent · l.30
- «En FNE recopilamos información que usted nos proporciona directamente, tales como:» — PrivacyPolicyContent · l.39
- «Nombre y apellidos» — PrivacyPolicyContent · l.42
- «Dirección de correo electrónico» — PrivacyPolicyContent · l.43
- «Institución educativa a la que pertenece» — PrivacyPolicyContent · l.44
- «Cargo o rol dentro de la institución» — PrivacyPolicyContent · l.45
- «Información de contacto profesional» — PrivacyPolicyContent · l.46
- «Contenido de mensajes y consultas enviadas a través de nuestros formularios» — PrivacyPolicyContent · l.47
- «Utilizamos la información recopilada para los siguientes propósitos:» — PrivacyPolicyContent · l.52
- «Responder a sus consultas y solicitudes de información» — PrivacyPolicyContent · l.55
- «Proporcionar acceso a nuestra plataforma educativa» — PrivacyPolicyContent · l.56
- «Enviar comunicaciones sobre nuestros programas y servicios educativos» — PrivacyPolicyContent · l.57
- «Mejorar nuestros servicios y desarrollar nuevos programas» — PrivacyPolicyContent · l.58
- «Cumplir con obligaciones legales y regulatorias» — PrivacyPolicyContent · l.59
- «Generar estadísticas agregadas sobre el uso de nuestros servicios» — PrivacyPolicyContent · l.60
- «Implementamos medidas de seguridad técnicas y organizativas apropiadas para proteger su información personal contra acceso no autorizado, alteración, divulgación o destrucción. Estas medidas incluyen:» — PrivacyPolicyContent · l.65
- «Encriptación de datos en tránsito y en reposo» — PrivacyPolicyContent · l.68
- «Acceso restringido a información personal» — PrivacyPolicyContent · l.69
- «Monitoreo regular de nuestros sistemas» — PrivacyPolicyContent · l.70
- «Capacitación del personal en protección de datos» — PrivacyPolicyContent · l.71
- «No vendemos, alquilamos ni compartimos su información personal con terceros, excepto en los siguientes casos:» — PrivacyPolicyContent · l.76
- «Con su consentimiento explícito» — PrivacyPolicyContent · l.79
- «Para cumplir con requerimientos legales» — PrivacyPolicyContent · l.80
- «Con proveedores de servicios que nos ayudan a operar nuestra plataforma (bajo acuerdos de confidencialidad)» — PrivacyPolicyContent · l.81
- «Para proteger los derechos y seguridad de FNE, nuestros usuarios o el público» — PrivacyPolicyContent · l.82
- «Conservamos su información personal durante el tiempo necesario para cumplir con los propósitos descritos en esta política, a menos que la ley requiera o permita un período de retención más largo.» — PrivacyPolicyContent · l.87
- «Usted tiene derecho a:» — PrivacyPolicyContent · l.92
- «Acceder a su información personal» — PrivacyPolicyContent · l.95
- «Corregir datos inexactos o incompletos» — PrivacyPolicyContent · l.96
- «Solicitar la eliminación de sus datos» — PrivacyPolicyContent · l.97
- «Oponerse al procesamiento de sus datos» — PrivacyPolicyContent · l.98
- «Solicitar la portabilidad de sus datos» — PrivacyPolicyContent · l.99
- «Retirar su consentimiento en cualquier momento» — PrivacyPolicyContent · l.100
- «Utilizamos cookies y tecnologías similares para mejorar su experiencia en nuestro sitio web, analizar el tráfico y personalizar el contenido. Puede configurar su navegador para rechazar cookies, aunque esto podría afectar algunas funcionalidades del sitio.» — PrivacyPolicyContent · l.105
- «Nuestros servicios están dirigidos a profesionales de la educación. No recopilamos intencionalmente información personal de menores de 18 años sin el consentimiento de sus padres o tutores.» — PrivacyPolicyContent · l.110
- «Podemos actualizar esta política de privacidad periódicamente. Le notificaremos sobre cambios significativos publicando la nueva política en nuestro sitio web y actualizando la fecha de &quot;última actualización&quot;.» — PrivacyPolicyContent · l.115
- «Si tiene preguntas sobre esta política de privacidad o sobre el tratamiento de sus datos personales, puede contactarnos en:» — PrivacyPolicyContent · l.120
- «Razón social: {LEGAL_IDENTITY.legalName} · {LEGAL_IDENTITY.taxId}» — PrivacyPolicyContent · l.124
- «Email:» — PrivacyPolicyContent · l.126
- «Dirección: {LEGAL_IDENTITY.streetAddress} , {LEGAL_IDENTITY.city} , {LEGAL_IDENTITY.country}» — PrivacyPolicyContent · l.134

### components/PrivacyPolicyModal.tsx

Used by: `/equipo`, `/`, `/nosotros`, `/noticias`, `/noticias/[slug]`, `/pasantias`, `/programas`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Política de Privacidad» | h2 |  | PrivacyPolicyModal · l.25 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
|  | `{onClose}` |  |  |  | PrivacyPolicyModal · l.26 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` |  | PrivacyPolicyModal · l.15 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Política de Privacidad» | written in this file |  |  | PrivacyPolicyModal · l.13 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | PrivacyPolicyModal · l.10 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `PrivacyPolicyContent` |  |  |  | PrivacyPolicyModal · l.38 |

### components/TermsOfUseModal.tsx

Used by: `/equipo`, `/`, `/nosotros`, `/noticias`, `/noticias/[slug]`, `/pasantias`, `/programas`

**Titles** (15)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Términos de Uso» | h2 |  | TermsOfUseModal · l.24 |
| «1. Aceptación de los Términos» | h3 |  | TermsOfUseModal · l.40 |
| «2. Descripción del Servicio» | h3 |  | TermsOfUseModal · l.45 |
| «3. Registro y Cuenta de Usuario» | h3 |  | TermsOfUseModal · l.57 |
| «4. Uso Apropiado» | h3 |  | TermsOfUseModal · l.68 |
| «5. Propiedad Intelectual» | h3 |  | TermsOfUseModal · l.82 |
| «6. Contenido del Usuario» | h3 |  | TermsOfUseModal · l.90 |
| «7. Privacidad y Protección de Datos» | h3 |  | TermsOfUseModal · l.101 |
| «8. Limitación de Responsabilidad» | h3 |  | TermsOfUseModal · l.106 |
| «9. Indemnización» | h3 |  | TermsOfUseModal · l.117 |
| «10. Modificaciones del Servicio» | h3 |  | TermsOfUseModal · l.122 |
| «11. Terminación» | h3 |  | TermsOfUseModal · l.127 |
| «12. Ley Aplicable y Jurisdicción» | h3 |  | TermsOfUseModal · l.132 |
| «13. Disposiciones Generales» | h3 |  | TermsOfUseModal · l.137 |
| «14. Contacto» | h3 |  | TermsOfUseModal · l.142 |

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
|  | `{onClose}` |  |  |  | TermsOfUseModal · l.25 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «info@nuevaeducacion.org» | `mailto:info@nuevaeducacion.org` |  |  | TermsOfUseModal · l.148 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onClose}` |  | TermsOfUseModal · l.14 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «Términos de Uso» | written in this file |  |  | TermsOfUseModal · l.12 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | TermsOfUseModal · l.9 |

**Other texts on screen** (44)

- «Última actualización: {new Date().toLocaleDateString('es-C…}» — TermsOfUseModal · l.38
- «Al acceder y utilizar el sitio web de Fundación Nueva Educación (FNE) y su Hub de Transformación, usted acepta y se compromete a cumplir con estos Términos de Uso. Si no está de acuerdo con estos términos, no debe utilizar nuestros servicios.» — TermsOfUseModal · l.42
- «FNE proporciona una plataforma educativa digital y servicios de acompañamiento para la transformación educativa, incluyendo:» — TermsOfUseModal · l.47
- «Acceso a recursos educativos y materiales de formación» — TermsOfUseModal · l.50
- «Herramientas de colaboración para comunidades educativas» — TermsOfUseModal · l.51
- «Cursos y rutas de aprendizaje personalizadas» — TermsOfUseModal · l.52
- «Espacios de trabajo colaborativo» — TermsOfUseModal · l.53
- «Sistemas de evaluación y seguimiento del progreso» — TermsOfUseModal · l.54
- «Para acceder a ciertas funcionalidades de la plataforma, debe crear una cuenta proporcionando información precisa y completa. Usted es responsable de:» — TermsOfUseModal · l.59
- «Mantener la confidencialidad de su contraseña» — TermsOfUseModal · l.62
- «Todas las actividades que ocurran bajo su cuenta» — TermsOfUseModal · l.63
- «Notificar inmediatamente cualquier uso no autorizado» — TermsOfUseModal · l.64
- «Actualizar su información cuando sea necesario» — TermsOfUseModal · l.65
- «Usted se compromete a utilizar nuestros servicios de manera responsable y no deberá:» — TermsOfUseModal · l.70
- «Violar leyes locales, nacionales o internacionales» — TermsOfUseModal · l.73
- «Transmitir contenido ilegal, ofensivo, difamatorio o discriminatorio» — TermsOfUseModal · l.74
- «Intentar acceder sin autorización a otros sistemas o cuentas» — TermsOfUseModal · l.75
- «Interferir con el funcionamiento normal de la plataforma» — TermsOfUseModal · l.76
- «Usar la plataforma para enviar spam o contenido no solicitado» — TermsOfUseModal · l.77
- «Compartir credenciales de acceso con terceros no autorizados» — TermsOfUseModal · l.78
- «Realizar ingeniería inversa o intentar extraer el código fuente» — TermsOfUseModal · l.79
- «Todo el contenido presente en la plataforma, incluyendo textos, gráficos, logos, imágenes, videos, y software, es propiedad de FNE o de sus licenciantes y está protegido por las leyes de propiedad intelectual.» — TermsOfUseModal · l.84
- «Usted puede descargar y utilizar los materiales educativos proporcionados únicamente para fines educativos no comerciales, respetando siempre la atribución correspondiente.» — TermsOfUseModal · l.87
- «Al publicar contenido en nuestra plataforma, usted:» — TermsOfUseModal · l.92
- «Conserva sus derechos de propiedad intelectual» — TermsOfUseModal · l.95
- «Otorga a FNE una licencia no exclusiva para usar, reproducir y distribuir dicho contenido dentro de la plataforma» — TermsOfUseModal · l.96
- «Garantiza que tiene los derechos necesarios sobre el contenido que comparte» — TermsOfUseModal · l.97
- «Acepta que FNE puede moderar o eliminar contenido que viole estos términos» — TermsOfUseModal · l.98
- «El tratamiento de sus datos personales se rige por nuestra Política de Privacidad. Al usar nuestros servicios, acepta las prácticas descritas en dicha política.» — TermsOfUseModal · l.103
- «FNE proporciona la plataforma &quot;tal como está&quot; y no garantiza que el servicio sea ininterrumpido o libre de errores. En la máxima medida permitida por la ley, FNE no será responsable por:» — TermsOfUseModal · l.108
- «Daños indirectos, incidentales o consecuentes» — TermsOfUseModal · l.111
- «Pérdida de datos o información» — TermsOfUseModal · l.112
- «Interrupciones del servicio» — TermsOfUseModal · l.113
- «Contenido de terceros accesible a través de la plataforma» — TermsOfUseModal · l.114
- «Usted acepta indemnizar y mantener indemne a FNE, sus directores, empleados y colaboradores de cualquier reclamo, daño o gasto derivado de su uso de la plataforma o violación de estos términos.» — TermsOfUseModal · l.119
- «FNE se reserva el derecho de modificar, suspender o discontinuar cualquier aspecto del servicio en cualquier momento, con o sin previo aviso.» — TermsOfUseModal · l.124
- «FNE puede suspender o terminar su acceso a la plataforma si viola estos términos o por cualquier otra razón a nuestra discreción. Usted puede cancelar su cuenta en cualquier momento contactándonos.» — TermsOfUseModal · l.129
- «Estos términos se rigen por las leyes de la República de Chile. Cualquier disputa será resuelta en los tribunales competentes de Santiago, Chile.» — TermsOfUseModal · l.134
- «Si alguna disposición de estos términos es declarada inválida o inaplicable, las demás disposiciones continuarán en pleno vigor. Estos términos constituyen el acuerdo completo entre usted y FNE respecto al uso de nuestros servicios.» — TermsOfUseModal · l.139
- «Para consultas sobre estos Términos de Uso, puede contactarnos en:» — TermsOfUseModal · l.144
- «Fundación Nueva Educación» — TermsOfUseModal · l.147
- «Email:» — TermsOfUseModal · l.148
- «Dirección: Santiago, Chile» — TermsOfUseModal · l.149
- «ATE certificada por RPA Mineduc» — TermsOfUseModal · l.150

### components/pasantias/LeadForm.tsx

Used by: `/pasantias`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{SUCCESS_TITLE}» | h3 | `submittedProgram !== null` | LeadForm · l.493 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Registrar interés en {other.name}» | `{() => startSubmission(other.id)}` | `submittedProgram !== null && other` |  | `testid=pasantias-lead-other-program` | LeadForm · l.520 |
| «Enviando… / Registrar mi interés» (submits the form) |  |  | `{isSubmitting}` | `testid=pasantias-lead-submit` | LeadForm · l.821 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{PRIVACY_POLICY_LINK_LABEL}» | `{PRIVACY_POLICY_PATH}` (new tab) |  | `testid=pasantias-consent-privacy-link` | ProcessingConsentLabel · l.255 |
| «Ficha de los programas (PDF)» | `{FICHA_HREF}` | `submittedProgram !== null` | `testid=pasantias-lead-ficha` | LeadForm · l.502 |
| «Programa completo con valores (PDF)» | `{BROCHURE_HREF}` | `submittedProgram !== null` | `testid=pasantias-lead-brochure` | LeadForm · l.509 |

**Fields** (12)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «{program.name} {program.audience}» | radio | `program` |  | `each COHORT_PROGRAMS` | `testid=pasantias-lead-program-{program.id}` | LeadForm · l.571 |
| «Sitio web» | text | `website` |  |  | `testid=pasantias-lead-website id=website (id used by code)` | LeadForm · l.608 |
| «firstName» | text | `firstName` · `maxLength={LEAD_FIELD_LIMITS.firstName}` |  |  | `testid=pasantias-lead-first-name id=firstName` | LeadForm · l.622 |
| «lastName» | text | `lastName` · `maxLength={LEAD_FIELD_LIMITS.lastName}` |  |  | `testid=pasantias-lead-last-name id=lastName` | LeadForm · l.638 |
| «email» | email | `email` · `maxLength={LEAD_FIELD_LIMITS.email}` |  |  | `testid=pasantias-lead-email id=email` | LeadForm · l.654 |
| «institution» | text | `institution` · `maxLength={LEAD_FIELD_LIMITS.institution}` |  |  | `testid=pasantias-lead-institution id=institution` | LeadForm · l.670 |
| «roleTitle» | text | `roleTitle` · `maxLength={LEAD_FIELD_LIMITS.roleTitle}` |  |  | `testid=pasantias-lead-role-title id=roleTitle` | LeadForm · l.686 |
| «phone» | tel | `phone` · `maxLength={LEAD_FIELD_LIMITS.phone}` |  |  | `testid=pasantias-lead-phone id=phone` | LeadForm · l.702 |
| «numPeople» | number | `numPeople` · `min={LEAD_NUM_PEOPLE_MIN} max={LEAD_NUM_PEOPLE_MAX}` |  |  | `testid=pasantias-lead-num-people id=numPeople` | LeadForm · l.718 |
| «message» | textarea | `message` |  |  | `testid=pasantias-lead-message id=message` | LeadForm · l.746 |
| «[icon ProcessingConsentLabel]» | checkbox | `consent` |  |  | `testid=pasantias-consent id=consent (id used by code)` | LeadForm · l.767 |
| «{CONSENT_MARKETING_TEXT}» | checkbox | `marketingOptIn` |  |  | `testid=pasantias-marketing-optin id=marketingOptIn (id used by code)` | LeadForm · l.797 |

**Forms** (1)

| On submit | Shown when | Where |
|---|---|---|
| `{handleSubmit}` |  | LeadForm · l.537 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!requestedProgram` | LeadForm · l.320 |
| `typeof window === 'undefined'` | LeadForm · l.339 |

**Pieces placed here, with the texts and settings handed to them** (8)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Field` | label: Nombre |  | `id=firstName` | LeadForm · l.621 |
| `Field` | label: Apellido |  | `id=lastName` | LeadForm · l.637 |
| `Field` | label: Correo electrónico |  | `id=email` | LeadForm · l.653 |
| `Field` | label: Colegio o institución |  | `id=institution` | LeadForm · l.669 |
| `Field` | label: Cargo |  | `id=roleTitle` | LeadForm · l.685 |
| `Field` | label: Teléfono |  | `id=phone` | LeadForm · l.701 |
| `Field` | label: Personas que viajarían |  | `id=numPeople` | LeadForm · l.717 |
| `Field` | label: Mensaje |  | `id=message` | LeadForm · l.734 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `GENERIC_ERROR` | «No pudimos enviar tu solicitud. Intenta nuevamente en unos minutos o escríbenos por WhatsApp.» | l.154 |
| `UNRENDERABLE_ERROR` | «No pudimos procesar tu solicitud. Recarga la página e inténtalo nuevamente; si el problema persiste, escríbenos por WhatsApp.» | l.162 |
| `PRE_SUBMIT_COPY` | «Elige tu programa y completa tus datos para registrar tu interés. Al enviarlo podrás descargar de inmediato la ficha y el programa completo.» | l.169 |
| `SUCCESS_TITLE` | «Solicitud registrada» | l.173 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (12)

| Kind | What | Where |
|---|---|---|
| mark | `testid=pasantias-lead-error-{id} id={id}-error` | Field · l.229 |
| focus | `document.getElementById(id).focus()` | focusFirstInvalid · l.369 |
| focus | `successRef.current.focus()` | LeadForm · l.477 |
| role | `role=status` | LeadForm · l.486 |
| mark | `testid=pasantias-lead-success` | LeadForm · l.486 |
| mark | `testid=pasantias-lead-success-program` | LeadForm · l.494 |
| mark | `testid=pasantias-lead-intro` | LeadForm · l.543 |
| mark | `testid=pasantias-lead-program` | LeadForm · l.553 |
| mark | `testid=pasantias-lead-error-program id=program-error` | LeadForm · l.590 |
| mark | `testid=pasantias-lead-error-consent id=consent-error` | LeadForm · l.783 |
| role | `role=alert` | LeadForm · l.811 |
| mark | `testid=pasantias-lead-form-error` | LeadForm · l.811 |

**Values shown from data** (5)

- `{error}` — Field · l.229, when `error`
- `{PRE_SUBMIT_COPY}` — LeadForm · l.543
- `{errors.program}` — LeadForm · l.590, when `errors.program`
- `{errors.consent}` — LeadForm · l.783, when `errors.consent`
- `{formError}` — LeadForm · l.811, when `formError`

**Other texts on screen** (9)

- «{label} [(opcional)]» (label) — Field · l.223
- «Gracias. Registramos tu interés en {chosen?.name} . Descarga ahora la información de los programas:» — LeadForm · l.494, when `submittedProgram !== null`
- «¿También te interesa» — LeadForm · l.519, when `submittedProgram !== null && other`
- «? Registra otra solicitud con el mismo correo.» — LeadForm · l.519, when `submittedProgram !== null && other`
- «Programa» (label) — LeadForm · l.558
- «{program.name} {program.audience}» (label) — LeadForm · l.563, when `each COHORT_PROGRAMS`
- «Sitio web» (label) — LeadForm · l.607
- «[icon ProcessingConsentLabel]» (label) — LeadForm · l.763
- «{CONSENT_MARKETING_TEXT}» (label) — LeadForm · l.793

### components/site/Ecosistema.tsx

Used by: `/pasantias`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `ROUTE_PATH` | «M{ROUTE.map((index) => NODES[…}» | l.20 |

**Other texts on screen** (1)

- «en red» — Ecosistema · l.76

### components/site/FlipbookDialog.tsx

Used by: `/programas`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Cerrar ✕» | `{onClose}` | `open` |  | `testid=flipbook-cerrar` | FlipbookDialog · l.50 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Abrir en nueva pestaña →» | `{externalHref}` (new tab) | `open && externalHref` |  | FlipbookDialog · l.46 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `dialog` | «[[Abrir en nueva pestaña →] Cerrar ✕]» · aria «{title}» | `{(event) => { if (event.target === ref.current) onClose(); }}` |  | FlipbookDialog · l.34 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| iframe · {title} · {src} | `open` |  | FlipbookDialog · l.53 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!dialog` | FlipbookDialog · l.24 |

### components/site/MapaChile.tsx

Used by: `/`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «De Iquique a Osorno» | h2 |  | MapaChile · l.254 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{city.name}» |  | `each ZONES && each CITIES.filter((city) => city.zone === zone)` |  | `testid=mapa-ciudad-{city.id}` | MapaChile · l.281 |
| «↻ Ver de nuevo» |  |  |  | `testid=mapa-ver-de-nuevo` | MapaChile · l.302 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «¿Tu escuela es la próxima? →» | `#contacto` |  | `testid=mapa-cta` | MapaChile · l.299 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `!section \|\| typeof IntersectionObserver === 'undefined'` | MapaChile · l.58 |
| `!box \|\| !svg \|\| !list` | MapaChile · l.64 |
| `!entries[0].isIntersecting` | MapaChile · l.192 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (4)

| Name | Texts | Where |
|---|---|---|
| `CITIES` | «Iquique», «Región de Tarapacá», «Norte», «Alto Hospicio», «Vallenar», «Región de Atacama», «Coquimbo», «Región de Coquimbo», «Valparaíso», «Región de Valparaíso», «Centro», «Santiago», «Región Metropolitana», «Llolleo», «Quinta de Tilcoco», «Región de O’Higgins», «Curicó», «Región del Maule», «Talca», «Chillán», «Región de Ñuble», «Sur», «Valdivia», «Región de Los Ríos», «Osorno», «Región de Los Lagos» | l.26 |
| `ZONES` | «Norte», «Centro», «Sur» | l.42 |
| `ROUTE` | «M{CITIES.map((city) => `${cit…}» | l.45 |
| `IDLE_HINT` | «Pasa por una ciudad para ubicarla en el mapa.» | l.47 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Mapa de Chile con las {CITIES.length} ciudades donde hay escuelas que forman parte de la transformación: {CITIES.map((city) => city.n…}» | MapaChile · l.311 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (24)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelector(.mapbox)` | MapaChile · l.59 |
| lookup | `querySelector(svg.m)` | MapaChile · l.60 |
| lookup | `querySelector(.zonas)` | MapaChile · l.61 |
| lookup | `querySelector(.det)` | MapaChile · l.62 |
| lookup | `querySelector(.again)` | MapaChile · l.63 |
| lookup | `querySelector([data-c="ciudades"])` | MapaChile · l.68 |
| lookup | `querySelector([data-c="regiones"])` | MapaChile · l.69 |
| lookup | `querySelector([data-c="km"])` | MapaChile · l.70 |
| lookup | `querySelectorAll([data-city="{id}"])` | each · l.74 |
| lookup | `querySelectorAll([data-parallel])` | layout · l.95 |
| timer | `setTimeout(…, ms)` | later · l.113 |
| lookup | `querySelectorAll([data-city].in)` | reset · l.122 |
| scroll | `box.scrollIntoView()` | replay · l.178 |
| listener | `again.addEventListener('click')` | MapaChile · l.199 |
| listener | `window.addEventListener('resize')` | MapaChile · l.207 |
| lookup | `querySelectorAll([data-city].on)` | highlight · l.212 |
| lookup | `querySelector(.cities)` | MapaChile · l.223 |
| listener | `layer.addEventListener('pointerover')` | MapaChile · l.225 |
| listener | `layer.addEventListener('pointerleave')` | MapaChile · l.226 |
| listener | `layer.addEventListener('click')` | MapaChile · l.227 |
| listener | `list.addEventListener('focusin')` | MapaChile · l.229 |
| listener | `list.addEventListener('focusout')` | MapaChile · l.230 |
| mark | `id=mapa` | MapaChile · l.250 |
| role | `role=img` | MapaChile · l.308 |

**Values shown from data** (7)

- `{CITIES.length}` — MapaChile · l.263
- `{REGION_COUNT}` — MapaChile · l.267
- `{SPAN_KM.toLocaleString('es-CL')}` — MapaChile · l.271
- `{zone}` — MapaChile · l.278, when `each ZONES`
- `{IDLE_HINT}` — MapaChile · l.295
- `{parallel}° S` — MapaChile · l.322, when `each PARALLELS`
- `{city.name}` — MapaChile · l.354, when `each CITIES`

**Other texts on screen** (5)

- «Dónde está pasando» — MapaChile · l.253
- «Trece ciudades tienen hoy escuelas que forman parte de la transformación. Una red que recorre Chile de norte a sur y que aprende junto a las escuelas de vanguardia de Barcelona.» — MapaChile · l.258
- «ciudades» — MapaChile · l.264
- «regiones» — MapaChile · l.268
- «km de norte a sur» — MapaChile · l.272

### components/site/NewsCard.tsx

Used by: `/`, `/noticias`, `/noticias/[slug]`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{article.title}» | h3 |  | NewsCard · l.30 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{articleDate(article)} {article.title} [{summary}] Leer →» | `/noticias/[*]` |  | `testid=noticia-{article.slug}` | NewsCard · l.15 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {article.title} · {article.featured_image} | `article.featured_image` |  | NewsCard · l.23 |

### components/site/Novedades.tsx

Used by: `/`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Lo que está pasando» | h2 |  | Novedades · l.31 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Todas las noticias y eventos →» | `/noticias` |  | `testid=novedades-todas` | Novedades · l.35 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `articles.length === 0` | Novedades · l.23 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `NewsCard` |  | `each articles` |  | Novedades · l.41 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `id=noticias` | Novedades · l.26 |

**Other texts on screen** (1)

- «Noticias» — Novedades · l.30

### components/site/PageHero.tsx

Used by: `/equipo`, `/nosotros`, `/noticias`, `/programas`

**Values shown from data** (1)

- `{children}` — PageHero · l.15

### components/site/Puertas.tsx

Used by: `/`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Arma tu propio viaje de evolución» | h2 |  | Puertas · l.14 |
| «{step.name}» | h3 | `each JOURNEY` | Puertas · l.40 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{String(index + 1).padStart(2, '0')} {step.stage} · {step.detail} {step.name} {step.summary} Ver el programa →» · also `onMouseEnter={() => setOpen(index)} · onFocus={() => setOpen(index)}` | `/programas#[*]` | `each JOURNEY` | `testid=puerta-{step.id}` | Puertas · l.25 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `id=programas` | Puertas · l.10 |

**Other texts on screen** (2)

- «Programas» — Puertas · l.13
- «Cuatro programas autónomos que se combinan según las necesidades de cada institución. Este es el orden que sugerimos para iniciar y profundizar el cambio.» — Puertas · l.19

### components/site/RedAliada.tsx

Used by: `/`

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{ally.name}» | `{ally.href}` (new tab) | `each [0, 1] && each ALLIES` |  | RedAliada · l.36 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {copy === 0 ? ally.name : ''} · {ally.logo} | `each [0, 1] && each ALLIES` |  | RedAliada · l.45 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `ALLIES` | «Instituto Relacional», «Escola Virolai», «International Positive Education Network», «Los Pellines», «Escola Sadako», «David L. Cooperrider Center for Appreciative Inquiry», «Relaciona Consultores», «Institut Angeleta Ferrer», «Els Futurs de l’Educació», «Conserva Tu Bosque», «Institut Escola Les Vinyes», «Fundació Jaume Bofill», «Lodge Los Pellines», «Escola Octavio Paz», «STEAM Conference Barcelona», «Escola La Maquinista», «Innovamat», «Escola El Puig» | l.6 |

**Other texts on screen** (2)

- «Nuestra red» (aria-label) — RedAliada · l.30
- «Una red que piensa la escuela con nosotros» — RedAliada · l.31

### components/site/SiteLayout.tsx

Used by: `/equipo`, `/`, `/nosotros`, `/noticias`, `/noticias/[slug]`, `/pasantias`, `/programas`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Navegación» | h2 |  | SiteLayout · l.170 |
| «Contacto» | h2 |  | SiteLayout · l.181 |

**Buttons** (3)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{menuOpen ? 'Cerrar menú' : 'Abrir menú'}» | `{() => setMenuOpen((open) => !open)}` |  |  | `testid=site-nav-burger` | SiteLayout · l.137 |
| «Política de Privacidad» | `{() => setShowPrivacy(true)}` |  |  | `testid=site-footer-privacidad` | SiteLayout · l.210 |
| «Términos de Uso» | `{() => setShowTerms(true)}` |  |  | `testid=site-footer-terminos` | SiteLayout · l.213 |

**Links** (14)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Fundación Nueva Educación» · aria «Fundación Nueva Educación, inicio» | `/` |  |  | Logo · l.47 |
| «{item.label}» | `{item.href}` | `each NAV` | `testid=site-nav-{item.id}` | SiteLayout · l.113 |
| «Contacto» | `{contactHref}` |  | `testid=site-nav-contacto` | SiteLayout · l.124 |
| «Hub de Transformación →» | `/login` |  | `testid=site-nav-hub-movil` | SiteLayout · l.129 |
| «Hub de Transformación →» | `/login` |  | `testid=site-nav-hub` | SiteLayout · l.134 |
| «{network.label}» | `{network.href}` (new tab) | `each SOCIAL` |  | SiteLayout · l.163 |
| «Pasantías» | `/pasantias` |  |  | SiteLayout · l.172 |
| «Programas» | `/programas` |  |  | SiteLayout · l.173 |
| «Noticias y Eventos» | `/noticias` |  |  | SiteLayout · l.174 |
| «Nosotros» | `/nosotros` |  |  | SiteLayout · l.175 |
| «Equipo» | `/equipo` |  |  | SiteLayout · l.176 |
| «Contacto» | `{contactHref}` |  |  | SiteLayout · l.177 |
| «info@nuevaeducacion.org» | `mailto:info@nuevaeducacion.org` |  |  | SiteLayout · l.183 |
| «Hub de Transformación» | `/login` |  |  | SiteLayout · l.186 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `Logo` |  | `{closeMenu}` |  | SiteLayout · l.109 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `PrivacyPolicyModal` | component | `{showPrivacy}` |  | SiteLayout · l.222 |
| `TermsOfUseModal` | component | `{showTerms}` |  | SiteLayout · l.223 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!menuOpen` | SiteLayout · l.70 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `NAV` | «Pasantías», «Programas», «Noticias», «Nosotros» | l.22 |
| `SOCIAL` | «Instagram», «Facebook» | l.29 |
| `FAMILY` | «Los Pellines», «Nueva Educación», «Lodge», «Summer Camp», «Empresa», «Relaciona», «Consultores» | l.37 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| listener | `window.addEventListener('keydown')` | SiteLayout · l.74 |
| mark | `testid=site-header` | SiteLayout · l.108 |

**Values shown from data** (3)

- `{title}` — SiteLayout · l.85
- `{children}` — SiteLayout · l.150
- `{member.strong}` — SiteLayout · l.201, when `each FAMILY`

**Other texts on screen** (8)

- «Acompañamos a las comunidades educativas a dar el salto hacia una Nueva Educación basada en la autonomía y la colaboración, para la expresión plena del potencial de cada estudiante.» — SiteLayout · l.158
- «Redes sociales» (aria-label) — SiteLayout · l.161
- «Santiago, Chile» — SiteLayout · l.184
- «ATE certificada por RPA Mineduc» — SiteLayout · l.185
- «Grupo Nueva Educación» (aria-label) — SiteLayout · l.190
- «Fundación» — SiteLayout · l.194
- «Nueva Educación» — SiteLayout · l.194
- «© {new Date().getFullYear()} Fundación Nueva Educación. Todos los derechos reservados.» — SiteLayout · l.208

### components/site/Sociograma.tsx

Used by: `/`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Así cambia una escuela» | h2 |  | Sociograma · l.406 |
| «{step.title}» | h3 | `each STEPS` | Sociograma · l.438 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «Quiero esto para mi escuela →» | `#contacto` | `each STEPS && index === STEPS.length - 1` | `testid=sociograma-cta` | Sociograma · l.442 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| canvas |  |  | Sociograma · l.416 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!canvas \|\| !stage \|\| !stepsBox \|\| typeof IntersectionObserver === 'undefined'` | Sociograma · l.226 |
| `!ctx` | Sociograma · l.228 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `STEPS` | «El punto de partida», «La escuela que heredamos», «Filas mirando al frente. Cada docente a solas con su curso. La dirección arriba y las familias afuera. Los vínculos existen, pero corren en una sola dirección.», «En el aula», «El aula se vuelve generativa», «Las filas se abren. Los estudiantes se explican, se preguntan y se cuidan entre pares. La convivencia deja de competir con el aprendizaje y se convierte en su …», «En el equipo», «Nadie enseña solo», «Los docentes salen de su sala y forman comunidades de crecimiento. El liderazgo se distribuye y la dirección acompaña en vez de controlar.», «En la comunidad», «Una comunidad que aprende», «Las familias entran al proyecto educativo. La escuela completa funciona como un ecosistema de relaciones saludables, capaz de sostener su propio cambio.» | l.5 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Las filas se abren. Los estudiantes se explican, se preguntan y se cuidan entre pares. La convivencia deja de competir con el aprendizaje y se convierte en su motor.» | STEPS · l.14 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll(.paso)` | Sociograma · l.232 |
| listener | `window.addEventListener('scroll')` | Sociograma · l.390 |
| listener | `window.addEventListener('resize')` | Sociograma · l.391 |
| mark | `id=escuela` | Sociograma · l.403 |

**Values shown from data** (3)

- `{STEPS[0].title}` — Sociograma · l.422
- `{step.when}` — Sociograma · l.437, when `each STEPS`
- `{step.text}` — Sociograma · l.439, when `each STEPS`

**Other texts on screen** (8)

- «Leemos la escuela como un sistema de relaciones» — Sociograma · l.405
- «Cada punto es una persona. Cada línea, un vínculo. Sigue bajando y mira lo que pasa cuando una comunidad educativa pone sus relaciones en el centro.» — Sociograma · l.410
- «vínculos activos» — Sociograma · l.424
- «Ilustración del modelo. No son datos de una escuela real.» — Sociograma · l.425
- «Estudiantes» — Sociograma · l.428
- «Docentes» — Sociograma · l.429
- «Dirección» — Sociograma · l.430
- «Familias» — Sociograma · l.431

### components/site/TeamSection.tsx

Used by: `/equipo`, `/nosotros`

**Titles** (3)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Las personas detrás del cambio» | h2 |  | TeamSection · l.42 |
| «{group.title} {String(group.members.length).padSta…}» | h3 | `each TEAM_GROUPS` | TeamSection · l.52 |
| «{selected.name}» | h3 | `selected` | TeamSection · l.112 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «{portrait}» | `{() => setSelected(member)}` | `each TEAM_GROUPS && each group.members && member.description` |  | `testid=equipo-{key}` | TeamSection · l.71 |
| «Cerrar ✕» | `{() => setSelected(null)}` | `selected` |  | `testid=equipo-bio-cerrar` | TeamSection · l.103 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `dialog` | «[Cerrar ✕ {selected.role} {selected.name} {selected.description}]» · aria «{selected ? selected.name : 'Biografía'}» | `{(event) => { if (event.target === dialogRef.current) setSelected(null); }}` |  | TeamSection · l.92 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt {member.name} · {member.image} |  |  | Portrait · l.19 |

**Draws nothing when** (2)

| Condition | Where |
|---|---|
| `!dialog` | TeamSection · l.29 |
| `!member` | TeamSection · l.58 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| role | `role=img` | Portrait · l.14 |
| mark | `id=equipo` | TeamSection · l.39 |

**Values shown from data** (6)

- `{initials}` — Portrait · l.14, when `failed \|\| !member.image`
- `{member.name}` — TeamSection · l.65, when `each TEAM_GROUPS && each group.members`
- `{member.role}` — TeamSection · l.66, when `each TEAM_GROUPS && each group.members`
- `{portrait}` — TeamSection · l.82, when `each TEAM_GROUPS && each group.members && !(member.description)`
- `{selected.role}` — TeamSection · l.111, when `selected`
- `{selected.description}` — TeamSection · l.113, when `selected`

**Other texts on screen** (3)

- «Nuestro equipo» — TeamSection · l.41
- «Un equipo experto y comprometido con la innovación educativa y el desarrollo de metodologías que potencian el crecimiento de cada estudiante.» — TeamSection · l.46
- «Ver más» — TeamSection · l.63, when `each TEAM_GROUPS && each group.members && member.description`

### components/site/ViasEje.tsx

Used by: `/`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Siete vías, un mismo eje» | h2 |  | ViasEje · l.69 |
| «{via.name}» | h3 | `each VIAS` | ViasEje · l.85 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!list` | ViasEje · l.25 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `VIAS` | «Propósito», «Un para qué compartido, construido por toda la comunidad.», «Crecimiento», «Cada estudiante es conocido, mirado y acompañado.», «Aprendizaje», «Se aprende con otros: cooperando, explicando, creando.», «Evaluación», «Una conversación que ayuda a crecer, no un veredicto.», «Liderazgo», «Distribuido: líderes que cuidan los vínculos de su equipo.», «Familias», «Aliadas del proyecto educativo, no espectadoras.», «Trabajo docente», «En equipo y por etapas, nunca en soledad.» | l.5 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (4)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll(li)` | ViasEje · l.26 |
| listener | `window.addEventListener('scroll')` | ViasEje · l.52 |
| listener | `window.addEventListener('resize')` | ViasEje · l.53 |
| mark | `id=vias` | ViasEje · l.62 |

**Values shown from data** (2)

- `{String(index + 1).padStart(2, '0')}` — ViasEje · l.84, when `each VIAS`
- `{via.says}` — ViasEje · l.88, when `each VIAS`

**Other texts on screen** (4)

- «El mapa del cambio» — ViasEje · l.68
- «La transformación de una escuela avanza por siete vías a la vez. Lo que las mantiene unidas es el eje relacional: en cada una, cambiar significa relacionarse de otra manera.» — ViasEje · l.73
- «Eje relacional» — ViasEje · l.79
- «primero el vínculo» — ViasEje · l.94

### components/site/chilePath.ts

Used by: `/`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `CHILE_MAIN` | «M541 31L542 42L555 61L558 78L561 76L570 83L575 82L576 84L575 88L570 94L574 103L576 120L580 128L580 145L586 167L583 175L590 187L597 191L610 207L623 218L627 223L622 227L607 252L607 255L618 264L620 272L616 286L611 285L599 291L600 293L605 295L604 303L609 313L602 316L601 322L608 332L624 342L617 354L618 …» | l.5 |
| `CHILE_ISLANDS` | «M611 3760L610 3769L588 3758L585 3758L592 3761L604 3770L600 3772L577 3775L530 3762L528 3759L532 3756L532 3749L528 3756L525 3749L523 3760L520 3759L520 3752L517 3761L509 3762L504 3758L504 3748L502 3753L502 3764L494 3765L495 3758L493 3761L490 3760L488 3765L482 3766L477 3764L475 3760L482 3751L483 3750L4…» | l.8 |

### components/site/news.ts

Used by: `/`, `/noticias`, `/noticias/[slug]`

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error loading news: {response.status}» | `throw (shown by whoever catches it)` | `!response.ok` | fetchNews · l.60 |
| «Invalid response format - articles is not an array» | `throw (shown by whoever catches it)` | `!Array.isArray(articles)` | fetchNews · l.63 |

### components/site/programsData.ts

Used by: `/`, `/programas`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «Unknown program: {id}» | `throw (shown by whoever catches it)` | `!found` | programById · l.202 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `PROGRAMS` | «AULA GENERATIVA», «Ecosistema de relaciones saludables para el crecimiento», «El aula generativa busca optimizar los procesos y elevar los resultados en el crecimiento y aprendizaje de cada estudiante, fortaleciendo la calidad de los vín…», «Construcción de ecosistema de relaciones saludables en el aula», «Desarrollo de autonomía, interdependencia y trabajo colaborativo», «Orientación al crecimiento individual y colectivo», «Desarrollo de mentalidad de crecimiento y valores», «Programa de educación relacional», «Programa de innovación pedagógica en el aula», «Programa de crecimiento personal», «Programa de prácticas generativas», «Programa de comunidades de crecimiento», «Calidad de vida para educadores y educadoras con aulas con motor propio», «Vínculos seguros y prosociales entre pares», «Conexión positiva con las familias», «Superación de la dicotomía Convivencia/Aprendizaje», «Síntesis hacia la mirada generativa», «INSPIRA», «Viaja y sumérgete en escuelas de vanguardia educativa», «2 semanas», «INSPIRA es una experiencia diseñada para ampliar la mirada pedagógica y entregar respuestas concretas sobre cómo alcanzar paso a paso una educación de vanguard…», «Conversatorios con Expertos y Expertas: Sesiones de diálogo con especialistas en educación de Cataluña», «Talleres de síntesis: Síntesis de aprendizajes y recursos compartidos», «Plataforma de registro: Bitácora de viaje compartida con documentación del cambio», «Visitas Pedagógicas: Jornadas en colegios de vanguardia para conocer el proyecto educativo», «Estadía Pedagógica: Trabajo pedagógico en aula junto a educadores y educadoras de vanguardia», «Diálogos con especialistas en educación», «Síntesis de aprendizajes y desafíos», «Registro multimedia del viaje», «INICIA», «Introducción a la Nueva Educación», «40-80 horas», «Programa diseñado para establecimientos educacionales que desean conocer y discernir el inicio de un largo y profundo proceso de transformación de su cultura e…», «Asesorar y formar al director o directora y su equipo en liderazgo del cambio», «Acompañamiento al equipo de gestión para el proceso cultural», «Favorecer la emergencia de un sentido de urgencia compartido», «Visualizar un horizonte de transformación compartido», «Construir una línea base participativa rápida», «Identificar necesidades para implementación futura», «Asesoría Directiva y al equipo de gestión», «Talleres de formación con líderes de base», «Visitas internacionales a la escuela», «Plataforma de formación con cursos introductorios», «Creación colectiva de proyecto de transformación», «Construcción de línea base de cambio», «Diseño de plan general para el primer año», «Elección de personas para INSPIRA en BCN», «EVOLUCIONA», «Hacia una transformación profunda de la cultura educativa», «5 años», «Programa de evolución progresiva, estimado en 5 años de duración. Se deberá considerar el tamaño de la comunidad educativa, la velocidad de implementación y la…», «Transformar la mirada pedagógica y generar un alto sentido de urgencia respecto de la imperiosa necesidad de una educación nueva», «Visualizar y ambicionar juntos un nuevo horizonte pedagógico», «Construir y recorrer una ruta de evolución cultural que en las 7 vías de evolución declaradas: Propósito, Personalización, Aprendizaje, Evaluación, Liderazgo, …», «Alcanzar un diseño a la medida, progresivo y basado en victorias tempranas», «Evolucionar a partir de las fortalezas preexistentes», «Formar líderes capaces de conducir el cambio», «Comunicar el proceso interna y externamente», «Construir equipos de cambio misionarios y de alto desempeño», «Soñar, diseñar, implementar, evaluar y rediseñar junto a los equipos de terreno», «Institucionalizar los cambios y arraigar la nueva cultura», «Asesoría directiva para diseñar y liderar el cambio», «Visitas de asesores y asesoras internacionales en terreno», «Asesoría técnica para la implementación de prácticas», «Plataforma de formación asincrónica, individual y en equipos», «Formación y acompañamiento de líderes de base», «Formación y acompañamiento de Comunidades de Crecimiento», «Implementación de Hub de Transformación», «Migración completa de pre-kinder a 4 medio en nivel de profundidad diverso», «Amplia y apropiada implementación de nuevas prácticas y proceso pedagógicos», «Estudiantes autónomos, colaborativos y generativos», «Convivencia prosocial elevada», «Familias integradas al proyecto educativo, disposición creativa y de apoyo constante», «Una organización que ha hecho propio su proceso de cambio», «Líderes de base potentes movilizando la evolución constante», «Profesoras, profesores, profesionales y asistentes formados, integrados en equipos sinérgicos por etapas del desarrollo», «Clima laboral lleno de sentido, empuje y auto realización», «Procesos y recursos pedagógicos optimizados» | l.20 |
| `JOURNEY` | «Inicia», «Preparación», «40 a 80 horas», «Introducción a la Nueva Educación. Para establecimientos que quieren conocer y discernir el inicio de un proceso profundo de transformación de su cultura educa…», «Inspira», «Despegue», «2 semanas en Barcelona», «Viaja y sumérgete en escuelas de vanguardia. Una experiencia para ampliar la mirada pedagógica, con respuestas concretas para Chile.», «Aula Generativa», «Cambio en el aula», «Vínculos entre pares», «Un ecosistema de relaciones saludables que eleva el crecimiento y el aprendizaje de cada estudiante, fortaleciendo la calidad de los vínculos entre pares.», «Evoluciona», «Cambio en todo el colegio», «5 años», «Una transformación profunda de la cultura educativa: una ruta por las siete vías, a la medida, progresiva y basada en victorias tempranas.» | l.157 |

**Other texts written in the code (safety net: not tied to an element by the script)** (6)

| Text | Where |
|---|---|
| «El aula generativa busca optimizar los procesos y elevar los resultados en el crecimiento y aprendizaje de cada estudiante, fortaleciendo la calidad de los vínculos entre pares.» | PROGRAMS · l.25 |
| «INSPIRA es una experiencia diseñada para ampliar la mirada pedagógica y entregar respuestas concretas sobre cómo alcanzar paso a paso una educación de vanguardia para Chile.» | PROGRAMS · l.52 |
| «Programa diseñado para establecimientos educacionales que desean conocer y discernir el inicio de un largo y profundo proceso de transformación de su cultura educativa.» | PROGRAMS · l.71 |
| «Programa de evolución progresiva, estimado en 5 años de duración. Se deberá considerar el tamaño de la comunidad educativa, la velocidad de implementación y la claridad de propósito del centro para avanzar.» | PROGRAMS · l.98 |
| «Construir y recorrer una ruta de evolución cultural que en las 7 vías de evolución declaradas: Propósito, Personalización, Aprendizaje, Evaluación, Liderazgo, Familias y Trabajo Docente» | PROGRAMS · l.102 |
| «Introducción a la Nueva Educación. Para establecimientos que quieren conocer y discernir el inicio de un proceso profundo de transformación de su cultura educativa.» | JOURNEY · l.164 |

### components/site/teamData.ts

Used by: `/equipo`, `/nosotros`

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `TEAM_MEMBERS` | «Arnoldo Cisternas», «Psicólogo dedicado al diseño y gestión de procesos de evolución cultural. Es asesor directivo para el fortalecimiento de lideres y equipos en organizaciones qu…», «Joan Quintana», «Psicólogo especializado en Comportamiento y Desarrollo Organizacional y en Coaching Relacional, aplicándolo en las organizaciones públicas y privadas, en la ed…», «Mora Del Fresno», «Dirige las operaciones de la Fundación en Barcelona y Chile. Es licenciada y profesora en Ciencias de la Educación (Universidad de San Andrés, Argentina), Mást…», «Gabriela Naranjo», «Es la directora de la Fundación Nueva Educación, conduce el equipo de trabajo en Chile para alcanzar los objetivos estratégicos de la FNE. Es psicóloga clínica…», «Brent Curtis», «Brent es Teólogo y está a cargo del diseño y la elaboración de los instrumentos tecnológicos que usamos para implementar nuestros procesos de cambio. Lidera la…», «Coral Regí», «Ha sido directora de la Escuela Virolai y actualmente es asesora internacional para la impulsar el desarrollo de escuelas de vanguardia en España y América Lat…», «Anna Comas», «Fue la directora de la escuela de La Maquinista un proyecto educativo innovador que se ha transformado en un referente de cambio. Formó parte de los centros im…», «Sandra Entrena», «Encargada de Innovación de la Escuela Virolai, una de las escuelas líderes del cambio hacia el nuevo paradigma educativo en Europa. Es una educadora de larga t…», «Pepe Menéndez», «Fue director adjunto de Jesuitas Educació y ha promovido la experiencia del proyecto Horizonte 2020, para la transformación profunda de la educación de las esc…», «Sergi Del Moral», «Licenciado en matemáticas y, desde el 2024, director del Institut-Escola Les Vinyes (Castellbisbal), un centro deliberadamente innovador cuya trayectoria ha si…», «Betlem Cuesta», «Es coordinadora pedagógica del Institut Escola Les Vinyes, un centro deliberadamente innovador reconocido por el Departament d'Educació, ha recibido los premio…», «Jordi Mussons», «Jordi es maestro y director de la escuela Sadako de Barcelona, institución referente en innovación educativa a nivel internacional. Su tenacidad, perseverancia…», «Marcelo Ruiz», «Licenciado en Educación con mención en Educación Física y Diplomado en Habilidades Directivas. Fundador y Director de Los Pellines, un centro de educación rela…», «Ignacio Pavéz», «PhD en Comportamiento Organizacional por Case Western Reserve University (USA) e Ingeniero Civil de la Pontificia Universidad Católica de Chile. Profesor del D…», «Marcela Molina», «Candidata a Doctora y Magíster en Economía de Negocios de la Universidad del Desarrollo. Socióloga de la Pontificia Universidad Católica de Chile. Su investiga…», «Andrés Bustamante», «Psicólogo Social y Coach relacional especializado en habilidades relacionales y gestión de equipos. Fundador de www.cruzadasur.cl, con más de 15 años de experi…», «Joaquín Aguirre», «Doctor en Ciencias de la Educación con 54 años de experiencia en el Ministerio de Educación como Supervisor Técnico Pedagógico. Especializado en Diseño Curricu…», «Abraham de la Fuente», «Doctor en Didáctica de las Matemáticas e investigador sobre la formación del profesorado. Es director del Institut Angeleta Ferrer, donde impulsa líneas de inn…», «Ana Vicálvaro», «Directora de la Escola Octavio Paz de Barcelona, una escuela pública emblemática del barrio de Navas que lidera procesos de transformación educativa. Graduada …», «Raúl Martínez», «Director de la Escola La Maquinista de Barcelona desde 2020, donde lidera procesos de innovación educativa centrados en el aprendizaje del alumnado. Graduado c…», «Jorge Parra», «Profesor de Educación Física y Magíster en Educación. Miembro del equipo de formación y gestión en el Centro de Experiencias de Aprendizaje Los Pellines, con m…», «Juan José Flores», «Profesor de Educación Física y Salud, Licenciado en Educación, actualmente cursando el Magíster en Ciencias de la Educación en la Universidad Católica de la Sa…», «Carol de Britos», «Es profesora de Primaria en Escola Virolai, donde además he sido coordinadora pedagógica, y actualmente ejerce de Jefa de Estudios de la etapa. Su ámbito es el…», «Marta Cárdenas», «Es coordinadora de la etapa de Educación Infantil en Virolai Reina Elisenda. Es educadora especializada en el trabajo con niños y niñas con necesidades educati…», «Maite Pino», «Es directora adjunta de la Escola Virolai y maestra. Se formó como Maestra de Educación Infantil en la UAB y ha trabajado en distintos centros públicos y conce…», «Claudia López de Lamadrid», «Es coordinadora y responsable pedagógica de la escuela infantil de Virolai (Virolai Petit), donde trabaja desde 2003. Ha sido maestra de inglés y tutora en Edu…», «Enrique Vergara», «Es educador y director adjunto de la Escola Virolai, donde forma parte del equipo desde 2018. Licenciado en Ciencias Ambientales por la UAB, ha combinado su tr…», «Laia Garcés», «Es coordinadora de la etapa de primaria en la Escuela Sadako de Barcelona, donde también ha sido tutora, es especialista de inglés y ha formado parte del equip…», «Marta Ortega», «Cristina Montes», «Profesora y tutora de primaria en la Escuela La Maquinista en Barcelona desde el año 2016. Es graduada en Magisterio de Educación Física, en Magisterio de Educ…», «Estefanía del Ramón», «Es profesora de la Escuela Octavio Paz de Barcelona, una de las escuelas públicas más reconocidas y valoradas en Cataluña por su capacidad de innovación y camb…», «Gemma Pariente», «María Latre», «Coordinadora de la etapa de Primaria en la Escola Virolai Reina Elisenda, donde trabaja desde hace más de una década. Graduada en Educación Primaria por UNIR y…», «Andreu Basolí», «Maestro de Educación Primaria en la Escola Sadako de Barcelona, donde ejerce como tutor con una pedagogía centrada en el acompañamiento activo y la educación e…», «Neus Colomer», «Miembro del equipo directivo de la Escola Sadako de Barcelona, donde también ejerce como maestra de Educación Primaria. Graduada en Educación Primaria con menc…», «Begonya Folch», «Profesora de Educación Secundaria y formadora del Departamento de Educación de Catalunya, comprometida con la transformación del sistema educativo. Experta en …», «Laura Carmona», «Coordinadora del equipo docente y profesora de secundaria en el Institut Angeleta Ferrer, centro público de referencia en formación e investigación docente. Li…», «Cristina Romanos», «Coordinadora pedagógica de Virolai Grimm, el centro del ecosistema Virolai dedicado exclusivamente a Educación Infantil. Lidera procesos pedagógicos centrados …» | l.13 |
| `TEAM_GROUPS` | «Comité Internacional», «Equipo FNE», «Asesores y Asesoras Internacionales» | l.258 |

### components/site/useSiteEffects.ts

Used by: `/equipo`, `/`, `/nosotros`, `/noticias`, `/noticias/[slug]`, `/pasantias`, `/programas`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (15)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelector(img)` | fetchNow · l.50 |
| listener | `image.addEventListener('load')` | show · l.61 |
| listener | `image.addEventListener('error')` | show · l.62 |
| lookup | `querySelectorAll(.rv,.clip,.mv)` | watch · l.115 |
| lookup | `querySelectorAll([data-n])` | watch · l.122 |
| lookup | `querySelector(.nav)` | useSiteEffects · l.133 |
| lookup | `querySelector(.prog)` | useSiteEffects · l.134 |
| lookup | `querySelectorAll([data-img-par])` | onScroll · l.149 |
| listener | `window.addEventListener('scroll')` | useSiteEffects · l.160 |
| listener | `window.addEventListener('resize')` | useSiteEffects · l.172 |
| listener | `el.addEventListener('mousemove')` | useSiteEffects · l.178 |
| listener | `el.addEventListener('mouseout')` | useSiteEffects · l.190 |
| lookup | `querySelector(.cur)` | useSiteEffects · l.199 |
| lookup | `querySelector(.hero .iso, .phero .iso, .pas-hero .iso)` | useSiteEffects · l.200 |
| listener | `window.addEventListener('mousemove')` | useSiteEffects · l.206 |

### lib/legal/privacy-notice.ts

Used by: `/equipo`, `/`, `/nosotros`, `/noticias`, `/noticias/[slug]`, `/pasantias`, `/privacidad`, `/programas`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LEGAL_IDENTITY` | «Fundación Nueva Educación», «Fundación Instituto Relacional», «RUT 65.166.503-5», «Carlos Silva Vildósola 10448», «La Reina, Santiago», «Chile» | l.46 |

### lib/pasantias/cohort-public.ts

Used by: `/`, `/pasantias`

**Texts kept in lists and helpers in the code (labels, options, status names)** (13)

| Name | Texts | Where |
|---|---|---|
| `COHORT_LABEL` | «Cohorte Enero 2027» | l.46 |
| `COHORT_TOGETHER` | «Todos viajan juntos a Barcelona» | l.68 |
| `COHORT_ROUTING` | «¿Primera vez?», «Pasantía INSPIRA», «¿Ya viajaste?», «Mirada Profunda» | l.81 |
| `COHORT_PLACES` | «Los cupos de la cohorte de enero se confirman por orden de reserva.» | l.87 |
| `COHORT_ACCREDITATION` | «Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.» | l.103 |
| `COHORT_CLAIMS` | «400+ Pasantes han viajado con FNE», «40+ Colegios participantes», «12 Escuelas catalanas en la red» | l.110 |
| `COHORT_FREE_WEEKEND` | «Sábado 23 y domingo 24 de enero» | l.127 |
| `INSPIRA_PROGRAM` | «Pasantía INSPIRA», «INSPIRA», «Equipos que viajan por primera vez», «6 escuelas: una semana de inmersión en dos escuelas y una semana de visitas a cuatro», «Inspiración y un mapa de lo posible», «Semana 1 — inmersión», «Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.», «Semana 2 — visitas», «Una escuela por día.», «Almuerzos: en la Pasantía INSPIRA, durante la primera semana (Escola Virolai y Escola Sadako).», «Escola Virolai», «Escola Sadako», «Institut Escola El Puig», «Escola La Maquinista», «Escola Octavio Paz», «Institut Angeleta Ferrer», «Institut Escola Les Vinyes», «La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela.» | l.231 |
| `MIRADA_PROFUNDA_PROGRAM` | «INSPIRA Mirada Profunda», «Mirada Profunda», «Quienes ya viajaron con INSPIRA», «Son diez días, cinco escuelas y dos días completos en cada una.», «Cómo se hace por dentro, y una hoja de ruta para marzo», «Semana 1», «Cinco jornadas en escuelas.», «Semana 2», «En Mirada Profunda, todos los días del programa.», «Escola Virolai», «Escola Sadako», «Institut Angeleta Ferrer», «Institut Escola El Puig», «Institut Escola Les Vinyes», «El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lu…», «Cada participante define, con el equipo FNE, un desafío real de su colegio.», «El viernes 29 cada participante presenta qué va a mover en marzo y cómo.», «En abril, una sesión online para revisar qué se implementó y ajustar el rumbo.», «acompañamiento para definir tu pregunta antes del viaje», «sesión online de seguimiento en abril» | l.281 |
| `COHORT_DAY_STRUCTURE` | «Presentación del proyecto educativo y entrevista con la dirección», «Visita guiada, entrevistas con estudiantes y educadores», «Talleres con expertos del movimiento de Nueva Educación» | l.349 |
| `COHORT_INCLUDES` | «El pago de las visitas a las escuelas.», «Los talleres de la tarde con especialistas.», «Los honorarios de la dirección del programa, los relatores y el equipo de facilitadores de FNE que acompañan a los pasantes.», «Bibliografía básica recomendada para preparar el viaje, una bitácora y un sistema de registro de los aprendizajes, presentado al menos un mes antes del viaje.», «Desayuno a media mañana en las escuelas.» | l.356 |
| `COHORT_EXCLUDES` | «Traslados colegio – aeropuerto de Santiago – colegio», «Traslados en Barcelona, incluido el transporte a El Puig y Les Vinyes», «Cenas», «Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)», «Seguros», «Pasajes y alojamiento, salvo que los coordines a través de FNE» | l.365 |
| `COHORT_HOSTS` | «Jordi Musons», «Escola Sadako», «Anfitrión», «Sandra Entrena», «Escola Virolai», «Anfitriona» | l.394 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.» | MIRADA_PROFUNDA_PROGRAM · l.318 |

### lib/pasantias/consent.ts

Used by: `/pasantias`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `PRIVACY_POLICY_LINK_LABEL` | «Política de Privacidad» | l.31 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Autorizo a Fundación Nueva Educación a tratar mis datos personales para responder a esta» | CONSENT_PROCESSING_TEXT · l.19 |
| «solicitud y enviarme el programa completo de la pasantía. He leído la Política de Privacidad.» | CONSENT_PROCESSING_TEXT · l.20 |
| «(Opcional) Quiero recibir novedades de Fundación Nueva Educación sobre sus programas y» | CONSENT_MARKETING_TEXT · l.24 |
| «contenidos educativos por correo electrónico. Puedo darme de baja cuando quiera.» | CONSENT_MARKETING_TEXT · l.25 |

### lib/pasantias/leads.ts

Used by: `/pasantias`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LEAD_VALIDATION_MESSAGES` | «Ingresa tu nombre.», «Ingresa tu apellido.», «Ingresa tu correo electrónico.», «El formato del correo electrónico no es válido.», «Ingresa tu institución.», «Debes autorizar el tratamiento de tus datos para enviar el formulario.», «La cohorte indicada no corresponde a la pasantía vigente.», «Elige un programa.», «El programa indicado no corresponde a la pasantía vigente.», «Indica un número de participantes entre {LEAD_NUM_PEOPLE_MIN} y {LEAD_NUM_PEOPLE_MAX}.» | l.174 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Máximo {max} caracteres.» | LEAD_VALIDATION_MESSAGES · l.185 |

### lib/sanitize.ts

Used by: `/noticias/[slug]`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `postProcessLinks()` | «<a {attrs}>» | postProcessLinks · l.234 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| lookup | `querySelectorAll(iframe)` | filterUnsafeIframes · l.147 |
| lookup | `querySelectorAll(a)` | postProcessLinks · l.212 |

### lib/utils/app-url.ts

Used by: `/pasantias`

**Messages set on the page** (1)

| Text | Set by | When | Where |
|---|---|---|---|
| «No se puede resolver la URL pública de la aplicación en producción. / Configure NEXT_PUBLIC_BASE_URL (o NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL) / con una URL http(s) válida. El encabezado Host no se usa en producción / porque lo controla el cliente.» | `throw (shown by whoever catches it)` | `isProduction()` | getAppBaseUrl · l.97 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `protocol` | «http / https» | getAppBaseUrl · l.113 |

### utils/dateUtils.ts

Used by: `/noticias`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `months` | «ENE», «FEB», «MAR», «ABR», «MAY», «JUN», «JUL», «AGO», «SEP», «OCT», «NOV», «DIC» | formatEventDate · l.35 |

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/contact` | `pages/api/contact.ts` | POST | `/` | `__tests__/api/contact.test.ts`, `__tests__/pages/home-contact-form.test.tsx`, `pages/index.tsx` |

