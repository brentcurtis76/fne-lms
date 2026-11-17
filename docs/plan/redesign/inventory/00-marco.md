# Marco (the frame around every screen)

Area `00-marco`. Written by `scripts/redesign/inventory.mjs`; do not edit by hand (hand-written input goes in `annotations.json` and `areas.json`).
Read from commit `9b113df42` (2026-11-17).

The app shell, the menu, the top bar, the bell, the footer and the feedback button. Its pieces are listed here once and not repeated under each screen.

2 screen files, 1 API files, 31 pieces.

## Approved changes (decided by Brent with the mock-ups; not losses)

- Sidebar head: today an icon with «GENERA» / «Hub de Transformación» / «by FNE» (Sidebar.tsx l.1505-1533), icon only when collapsed. Mock-up: G mark + «Genera» + «Hub de Transformación · by FNE»; when collapsed the head is hidden and only the toggle shows. (marco.md, Sidebar table, row 'Logo block'; LEDGER Choices, Phase 1 Frame; frame approved by Brent 13 Nov 2026 00:50)
- The notification bell moves from the sidebar head (shown only when the menu is expanded, Sidebar.tsx l.1537) to the top bar, always visible. (marco.md, Sidebar table, row 'Notification bell'; LEDGER Choices, Phase 1 Frame; frame approved by Brent 13 Nov 2026 00:50)
- Menu entries keep one line. Today's second line (the entry description) becomes a tooltip on hover when expanded, and stays in the flyout header and child lines when collapsed. (marco.md, Sidebar table, row 'Entry description'; LEDGER Choices, Phase 1 Frame; frame approved by Brent 13 Nov 2026 00:50)
- Active entry look: today black fill + yellow bar (child: grey fill); mock-up: bar + lighter fill + coloured icon, child the same. The notes say gold; the colours were later changed to the brand kit (13 Nov 2026 09:13). (marco.md, Sidebar table, row 'Active entry'; frame approved by Brent 13 Nov 2026 00:50)
- The count of new support reports on «Gestión» and «Soporte Técnico» (Sidebar.tsx l.928, 1006, 1051) changes from a red pill to a gold pill, same two places. (marco.md, Sidebar table, row 'Count of new support reports'; frame approved by Brent 13 Nov 2026 00:50)
- Collapsed menu: the number of children on a yellow dot on each group icon (Sidebar.tsx l.948) is dropped. (marco.md, Sidebar table, row 'Collapsed: number of children'; LEDGER Choices, Phase 1 Frame; frame approved by Brent 13 Nov 2026 00:50)
- The empty footer strip of the sidebar (Sidebar.tsx l.1587) gets a new line «Fundación Nueva Educación». (marco.md, Sidebar table, row 'Empty footer strip'; frame approved by Brent 13 Nov 2026 00:50)
- Top bar: today a black bar 80 px high (MainLayout.tsx l.333-384); mock-up: a white bar 56 px high with a hairline. (marco.md, Top bar table, row 'Black bar 80 px'; frame approved by Brent 13 Nov 2026 00:50)
- The QA simulation banner keeps its text and hooks («QA INTERNO — DATOS SINTÉTICOS EN PRODUCCIÓN — NO ES PILOTO REAL», qa-simulation-banner) but is drawn in warning colours. (marco.md, Under the bar table, row 'QA simulation banner'; frame approved by Brent 13 Nov 2026 00:50)
- Breadcrumbs (breadcrumbs prop, 109 call sites) move from a white strip under the bar into the top bar; on phones only the last crumb shows. (marco.md, Under the bar table, row 'Breadcrumbs'; LEDGER Choices, Phase 1 Frame; frame approved by Brent 13 Nov 2026 00:50)
- The page title h1 (pageTitle prop, 57 real titles) becomes a page header with eyebrow, title in Mont, subtitle and actions. (marco.md, Under the bar table, row 'Page title h1'; frame approved by Brent 13 Nov 2026 00:50)
- FunctionalPageHeader's slots (icon, title, subtitle, search box, primary action, children) move into the new page header; the primary action becomes an azul pill, or gold with azul-profundo text (colours since changed to the brand kit, 13 Nov 2026 09:13). (marco.md, Under the bar table, row 'FunctionalPageHeader'; frame approved by Brent 13 Nov 2026 00:50)
- The public site's big footer under every platform page loses its logo, mission paragraph and «Síguenos» social links (LinkedIn, Instagram, Facebook, X, YouTube). (marco.md, Footer table, row 'Logo, mission paragraph'; LEDGER Choices, Phase 1 Frame; frame approved by Brent 13 Nov 2026 00:50)
- The footer becomes one line holding the same six «Navegación» links (Pasantías, Programas, Noticias y Eventos, Nosotros, Equipo, Contacto) and the same three items «Política de Privacidad», «Términos de Uso», «ATE certificada por RPA Mineduc». (marco.md, Footer table, rows 'Navegación' and 'Política de Privacidad'; frame approved by Brent 13 Nov 2026 00:50)
- Footer «Contacto»: «Santiago, Chile» is kept; the address info@nuevaeducacion.org and the «Hub de Transformación» button to /login are dropped (the user is already signed in). (marco.md, Footer table, row 'Contacto'; frame approved by Brent 13 Nov 2026 00:50)
- The floating feedback button keeps its place and labels («¿Encontraste un problema? ¡Cuéntanos!», «Enviar feedback») but is azul and no longer pulses. (marco.md, Feedback button table, row 'Floating round button'; frame approved by Brent 13 Nov 2026 00:50)
- Feedback messages («La imagen no puede superar 5MB», «Por favor describe el problema o sugerencia», «Error al enviar el feedback») use the shared error toast piece. (marco.md, Feedback button table, row 'Messages'; frame approved by Brent 13 Nov 2026 00:50)
- Toasts sit above the feedback button instead of covering it. (marco.md, Feedback button table, row 'Shares the corner with the toasts'; frame approved by Brent 13 Nov 2026 00:50)

## Notes

- The mock-up uses the same NAVIGATION_ITEMS array, ids and test ids, but simplifies the 9 visibility gates (Sidebar.tsx l.1414-1479, childVisibility.ts) for 4 sample users only. The real gates must survive the build. (marco.md, Sidebar table, row 'Menu entries')
- Notification loading, empty and error states («Cargando notificaciones...», «Sin notificaciones» + «Te notificaremos cuando tengas algo nuevo», «Error al cargar») use the foundations' empty and loading pieces; not all are drawn in the frame, but they must survive. (marco.md, Notifications table, row 'Loading / empty / error')
- Not drawn, must survive the build: QAFloatingWidget (lazy, during a QA test run) and the driver.js tours on the five admin/qa pages (styles/tour.css). (marco.md, 'Not drawn, must survive the build', bullet 1)
- Not drawn, must survive the build: DynamicFavicon and the theme-color meta (#0a0a0a today). (marco.md, 'Not drawn, must survive the build', bullet 2)
- Not drawn, must survive the build: the school name fetch, the avatar cache (sessionStorage['fne-avatar-cache']) and the support-count poll. (marco.md, 'Not drawn, must survive the build', bullet 3)

## Screens

| Address | File | Lines | Menu | Marks |
|---|---|---|---|---|
| — | `pages/_app.tsx` | 67 | — |  |
| — | `pages/_document.tsx` | 44 | — |  |

## pages/_app.tsx

File `pages/_app.tsx` · 67 lines · frame: none

### What the page file itself draws

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `AuthProvider` |  |  |  | MyApp · l.33 |
| `LookProvider` |  |  |  | MyApp · l.34 |
| `PermissionProvider` |  |  |  | MyApp · l.35 |
| `DynamicFavicon` |  |  |  | MyApp · l.46 |
| `QASessionProvider` |  |  |  | MyApp · l.47 |
| `Toaster` | containerStyle: var(--toast-stack-bottom, 24px) / var(--toast-stack-right, 24px) |  |  | MyApp · l.49 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Hub de Transformación Educativa - Genera» | MyApp · l.42 |

**Other texts on screen** (1)

- «Genera» — MyApp · l.37

## pages/_document.tsx

File `pages/_document.tsx` · 44 lines · frame: none

### What the page file itself draws

Nothing found by the script.

## Pieces

Components and helpers the screens above draw from. Each is listed once.

### components/Footer.tsx

Used by: `(the frame)`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Navegación» | h2 |  | Footer · l.89 |
| «Contacto» | h2 |  | Footer · l.102 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Política de Privacidad» | `{() => setShowPrivacyPolicy(true)}` |  |  |  | Footer · l.139 |
| «Términos de Uso» | `{() => setShowTermsOfUse(true)}` |  |  |  | Footer · l.145 |

**Links** (13)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «LinkedIn» | `https://cl.linkedin.com/company/fundacion-nueva-educacion` (new tab) |  |  | Footer · l.46 |
| «Instagram» | `https://www.instagram.com/fundacion_nueva_educacion/` (new tab) |  |  | Footer · l.52 |
| «Facebook» | `https://web.facebook.com/nuevaeducacion.org` (new tab) |  |  | Footer · l.58 |
| «X (Twitter)» | `https://x.com/fnuevaeducacion` (new tab) |  |  | Footer · l.64 |
| «YouTube» | `https://www.youtube.com/c/NuevaEducacionFundacion` (new tab) |  |  | Footer · l.70 |
| «Pasantías» | `/pasantias` |  |  | Footer · l.91 |
| «Programas» | `/programas` |  |  | Footer · l.92 |
| «Noticias y Eventos» | `/noticias` |  |  | Footer · l.93 |
| «Nosotros» | `/nosotros` |  |  | Footer · l.94 |
| «Equipo» | `/equipo` |  |  | Footer · l.95 |
| «Contacto» | `/#contacto` |  |  | Footer · l.96 |
| «info@nuevaeducacion.org» | `mailto:info@nuevaeducacion.org` |  |  | Footer · l.105 |
| «Hub de Transformación» | `/login` |  |  | Footer · l.122 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Fundación Nueva Educación · /Logo BW.png?v=3 |  |  | Footer · l.32 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `PrivacyPolicyModal` | component | `{showPrivacyPolicy}` |  | Footer · l.161 |
| `TermsOfUseModal` | component | `{showTermsOfUse}` |  | Footer · l.165 |

**Other texts on screen** (5)

- «Acompañamos a las comunidades educativas a dar el salto hacia una Nueva Educación basada en la autonomía y la colaboración para la expresión plena del potencial de cada estudiante.» — Footer · l.39
- «Síguenos» — Footer · l.44
- «Santiago, Chile» — Footer · l.117
- «© {new Date().getFullYear()} Fundación Nueva Educación. Todos los derechos reservados.» — Footer · l.135
- «ATE certificada por RPA Mineduc» — Footer · l.152

### components/PrivacyPolicyContent.tsx

Used by: `(the frame)`

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

Used by: `(the frame)`

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

### components/SimulationEnvironmentBanner.tsx

Used by: `(the frame)`

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!visible` | SimulationEnvironmentBanner · l.6 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| role | `role=status` | SimulationEnvironmentBanner · l.13 |
| mark | `testid=qa-simulation-banner` | SimulationEnvironmentBanner · l.13 |

**Values shown from data** (1)

- `{QA_SIMULATION_LABEL}` — SimulationEnvironmentBanner · l.13

**Other texts on screen** (1)

- «Entorno de simulación QA» (aria-label) — SimulationEnvironmentBanner · l.13

### components/TermsOfUseModal.tsx

Used by: `(the frame)`

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

### components/common/Avatar.tsx

Used by: `(the frame)`

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Avatar · {imageUrl} |  |  | Avatar · l.179 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `backgroundColor` | «hsl({hue}, 70%, 40%)» | generateLocalAvatar · l.56 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: fne-avatar-cache` | Avatar · l.88 |

**Values shown from data** (1)

- `{initials}` — Avatar · l.159, when `!user \|\| (hasError && !isLoading) \|\| (!imageUrl && !isLoading && !propAvatarUrl)`

### components/feedback/FeedbackButtonWithPermissions.tsx

Used by: `(the frame)`

**Buttons** (1)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon MessageCircle]» · tooltip «¿Encontraste un problema? ¡Cuéntanos!» · aria «Enviar feedback» | `{handleClick}` |  |  |  | FeedbackButtonWithPermissions · l.61 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `FeedbackModal` | component | `{isModalOpen}` |  | FeedbackButtonWithPermissions · l.89 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `loading \|\| !hasPermission` | FeedbackButtonWithPermissions · l.54 |

**Other texts on screen** (2)

- «¿Encontraste un problema? ¡Cuéntanos!» — FeedbackButtonWithPermissions · l.82, when `!hasInteracted`
- «@keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fade-in 0.3s ease-out; }» — FeedbackButtonWithPermissions · l.94

**Reads and writes the database directly:** `rpc:has_feedback_permission`

### components/feedback/FeedbackModal.tsx

Used by: `(the frame)`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «¡Gracias! 🎉» | h3 | `isSuccess` | FeedbackModal · l.212 |
| «¿Qué sucedió? 💭» | h2 | `!(isSuccess)` | FeedbackModal · l.229 |

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «✓ Cerrar» | `{() => { reset(); onClose(); }}` | `isSuccess` |  |  | FeedbackModal · l.215 |
| «[icon X]» | `{() => { reset(); onClose(); }}` | `!(isSuccess)` |  |  | FeedbackModal · l.230 |
| «[icon X]» | `{(e) => { e.stopPropagation(); setScreenshot(null); setScreenshotPreview(null); }}` | `!(isSuccess) && screenshotPreview` |  |  | FeedbackModal · l.272 |
| «Problema» | `{() => setType('bug')}` | `!(isSuccess)` |  |  | FeedbackModal · l.308 |
| «Idea» | `{() => setType('idea')}` | `!(isSuccess)` |  |  | FeedbackModal · l.320 |
| «Cancelar» | `{() => { reset(); onClose(); }}` | `!(isSuccess)` | `{isSubmitting}` |  | FeedbackModal · l.337 |
| «Enviando... / Enviar →» | `{handleSubmit}` | `!(isSuccess)` | `{isSubmitting \|\| !description.trim()}` |  | FeedbackModal · l.347 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «[img: Preview] / Arrastra una imagen o haz clic para seleccionar» · also `onDrop={handleDrop} · onDragOver={handleDragOver}` | `{() => fileInputRef.current?.click()}` | `!(isSuccess)` | FeedbackModal · l.259 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «El botón no funciona cuando...» | textarea | «El botón no funciona cuando...» |  | `!(isSuccess)` |  | FeedbackModal · l.244 |
| «📸 Adjuntar captura (opcional)» | file | accepts `image/*` |  | `!(isSuccess)` · hidden by its class (`hidden`); another control opens it or it is for screen readers |  | FeedbackModal · l.292 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Preview · {screenshotPreview} | `!(isSuccess) && screenshotPreview` |  | FeedbackModal · l.267 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| «¡Gracias! 🎉» | written in this file |  |  | FeedbackModal · l.204 |

**Toasts** (4)

| Kind | Text | When | Where |
|---|---|---|---|
| error | «La imagen no puede superar 5MB» | `file && file.size > 5 * 1024 * 1024` | handleFileSelect · l.29 |
| error | «La imagen no puede superar 5MB» | `file && file.type.startsWith('image/') && file.size > 5 * 1024 * 1024` | FeedbackModal · l.47 |
| error | «Por favor describe el problema o sugerencia» | `!description.trim()` | handleSubmit · l.98 |
| error | «Error al enviar el feedback» |  | handleSubmit · l.186 |

**Messages set on the page** (2)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al subir la imagen» | `throw (shown by whoever catches it)` | `error` | uploadScreenshot · l.85 |
| «Usuario no autenticado» | `throw (shown by whoever catches it)` | `!user` | handleSubmit · l.108 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `!isOpen` | FeedbackModal · l.201 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, 3000)` | handleSubmit · l.175 |

**Other texts on screen** (5)

- «Tu reporte fue enviado.» — FeedbackModal · l.213, when `isSuccess`
- «Número: #FB- {feedbackId?.slice(0, 8).toUpperCase…}» — FeedbackModal · l.214, when `isSuccess`
- «📸 Adjuntar captura (opcional)» (label) — FeedbackModal · l.256, when `!(isSuccess)`
- «Arrastra una imagen o haz clic para seleccionar» — FeedbackModal · l.288, when `!(isSuccess) && !(screenshotPreview)`
- «Tipo:» (label) — FeedbackModal · l.304, when `!(isSuccess)`

**Reads and writes the database directly:** `bucket:feedback-screenshots` (getPublicUrl, upload), `table:platform_feedback` (insert, select)

### components/layout/FooterNuevo.tsx

Used by: `(the frame)`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «Política de Privacidad» | `{() => setShowPrivacyPolicy(true)}` |  |  |  | FooterNuevo · l.38 |
| «Términos de Uso» | `{() => setShowTermsOfUse(true)}` |  |  |  | FooterNuevo · l.41 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{link.label}» | `{link.href}` | `each FOOTER_NUEVO_LINKS` |  | FooterNuevo · l.34 |

**Pop-ups** (2)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `PrivacyPolicyModal` | component | `{showPrivacyPolicy}` |  | FooterNuevo · l.48 |
| `TermsOfUseModal` | component | `{showTermsOfUse}` |  | FooterNuevo · l.49 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `FOOTER_NUEVO_LINKS` | «Pasantías», «Programas», «Noticias y Eventos», «Nosotros», «Equipo», «Contacto» | l.14 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=footer-nuevo` | FooterNuevo · l.31 |

**Other texts on screen** (2)

- «ATE certificada por RPA Mineduc» — FooterNuevo · l.44
- «Santiago, Chile» — FooterNuevo · l.45

### components/layout/MainLayout.tsx

Used by: `(every screen that uses the frame)`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{pageTitle}» | h1 | `isNuevo && pageTitle` | MainLayout · l.429 |
| «{pageTitle}» | h1 | `!(isNuevo) && ((pageTitle \|\| breadcrumbs.length > 0)) && pageTitle` | MainLayout · l.469 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Bars3Icon]» · aria «Abrir menú de navegación» | `{handleMobileSidebarOpen}` | `!(isNuevo)` · screen size: `lg:hidden` |  | `testid=mobile-sidebar-trigger` | MainLayout · l.369 |
| «Salir» | `{handleLogout}` | `!(isNuevo) && user` |  |  | MainLayout · l.403 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon Avatar]» | `/profile` | `!(isNuevo) && user` |  | MainLayout · l.391 |
| «[icon Avatar]» |  | `!(isNuevo) && user` |  | MainLayout · l.392 |
| «{crumb.label}» | `{crumb.href}` | `((pageTitle \|\| breadcrumbs.length > 0)) && breadcrumbs.length > 0 && each breadcrumbs && crumb.href` |  | MainLayout · l.450 |

**Pop-ups** (1)

| Name or title | How | Opens when | Texts passed to it | Where |
|---|---|---|---|---|
| `SimulationEnvironmentBanner` | component | `{showQaSimulationBanner}` |  | MainLayout · l.418 |

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` | `!(onLogout)` | MainLayout · l.298 |

**Access checks in the code** (1)

| Line of code | Where |
|---|---|
| `highestRole = getHighestRole(auth.userRoles)` | MainLayout · l.69 |

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `isDesktop \|\| !mobileSidebarOpen` | MainLayout · l.257 |

**Pieces placed here, with the texts and settings handed to them** (6)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `Sidebar` |  |  |  | MainLayout · l.325 |
| `TopBarNuevo` |  | `isNuevo` |  | MainLayout · l.356 |
| `Avatar` |  | `!(isNuevo) && user` |  | MainLayout · l.393 |
| `FooterNuevo` |  | `isNuevo` |  | MainLayout · l.483 |
| `Footer` |  | `!(isNuevo)` |  | MainLayout · l.483 |
| `FeedbackButtonWithPermissions` |  |  |  | MainLayout · l.489 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Sin colegio» | MainLayout · l.117 |
| «{pageTitle} - Genera» | MainLayout · l.311 |
| «Genera - Hub de Transformación» | MainLayout · l.312 |
| «Hub de Transformación Educativa - Genera» | MainLayout · l.318 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: fne-avatar-cache` | MainLayout · l.162 |
| storage | `localStorage: fne-sidebar-collapsed` | MainLayout · l.227 |
| listener | `window.addEventListener('resize')` | MainLayout · l.244 |
| listener | `window.addEventListener('keydown')` | MainLayout · l.268 |
| address value | `?colegio_id` | l.1 |
| address value | `?schoolId` | l.1 |
| address value | `?school_id` | l.1 |

**Values shown from data** (4)

- `{fullTitle}` — MainLayout · l.317
- `{schoolName}` — MainLayout · l.385, when `!(isNuevo) && user && schoolName`, screen size: `hidden md:block`
- `{crumb.label}` — MainLayout · l.457, when `((pageTitle \|\| breadcrumbs.length > 0)) && breadcrumbs.length > 0 && each breadcrumbs && !(crumb.href)`
- `{children}` — MainLayout · l.478

**Other texts on screen** (1)

- «Breadcrumb» (aria-label) — MainLayout · l.440, when `!(isNuevo) && ((pageTitle \|\| breadcrumbs.length > 0)) && breadcrumbs.length > 0`

**Reads and writes the database directly:** `table:profiles` (select), `table:user_roles` (select)

### components/layout/Sidebar.tsx

Used by: `(the frame)`

**Titles** (2)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{item.label}» | h3 | `isCollapsed && hasChildren && showCollapsedMenu` | l.889 |
| «GENERA» | h2 | `!isCollapsed` | l.1468 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[{item.label} [{newFeedbackCount}] [{item.description}]] [{filteredChildren.length}]» · tooltip «{isCollapsed ? item.label : undefined}» | `{handleClick}` |  |  | `testid=sidebar-item-{item.id}` | l.811 |
| «[icon Bars3Icon]» · tooltip «{isDesktop ? (isCollapsed ? 'Expandir sidebar' : 'Contraer sidebar') : 'Cerrar m…}» · aria «{isDesktop ? (isCollapsed ? 'Expandir sidebar' : 'Contraer sidebar') : 'Cerrar m…}» | `{isDesktop ? onDesktopToggle : onMobileClose}` |  |  |  | l.1494 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{child.label} [{newFeedbackCount}] [{child.description}]» | `{child.href}` | `isCollapsed && hasChildren && showCollapsedMenu && each filteredChildren` |  | l.896 |
| «{child.label} [{newFeedbackCount}] [{child.description}]» | `{child.href}` | `!isCollapsed && hasChildren && isExpanded && each filteredChildren` |  | l.942 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onMobileClose}` | `!isDesktop && isMobileOpen` · screen size: `lg:hidden` | l.1438 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` |  | l.806 |

**Embedded media** (2)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Genera · /genera/icon-transparent.svg | `!isCollapsed` |  | l.1462 |
| img · alt Genera · /genera/icon-transparent.svg | `!(!isCollapsed)` |  | l.1481 |

**Access checks in the code** (3)

| Line of code | Where |
|---|---|
| `if (!hasAllPermissions(item.permission)) return false;` | l.1381 |
| `if (!hasAnyPermission(item.permission)) return false;` | l.1383 |
| `if (!hasPermission(item.permission)) return false;` | l.1386 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `SidebarNuevo` |  | `look === 'nuevo'` |  | l.1399 |
| `ModernNotificationCenter` |  | `!isCollapsed && user` |  | l.1491 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `NAVIGATION_ITEMS` | «Mi Panel», «Panel principal», «Mi Perfil», «Información personal», «Mi pasantía», «Tu viaje a Barcelona, enero 2027», «Mi Aprendizaje», «Rutas y cursos asignados», «Mis Cursos», «Cursos en los que estoy inscrito», «Mis Tareas», «Tareas de todas mis comunidades», «Feedback», «Evaluaciones de tareas asignadas», «Mi Trabajo», «Sesiones, reportes y horas», «Mis Sesiones», «Sesiones de consultoría asignadas», «Mis Reportes», «Estadísticas de mis sesiones», «Mis Horas», «Ver mis ganancias y horas», «Revisión de Quizzes», «Calificar preguntas abiertas», «Espacio Colaborativo», «Comunidades de crecimiento», «Vista General», «Resumen del espacio», «Sesiones», «Gestión Comunidades», «Administrar comunidades», «Cursos», «Gestión de cursos», «Constructor de Cursos», «Crear y editar cursos», «Próximos Cursos», «Cursos próximamente disponibles», «Rutas de Aprendizaje», «Gestión de rutas de aprendizaje», «Gestor de Cambio», «Constructor de registros y rúbricas», «Constructor de Registros», «Crear registros y rúbricas», «Contexto Transversal», «Configuración de contexto por escuela», «Preguntas de Contexto», «Gestionar preguntas de contexto transversal», «Resumen Respuestas», «Ver respuestas de todas las escuelas», «Plan de Migración», «Definir generaciones GT/GI por año», «Mis Registros», «Registros que tengo asignados», «Vías de Transformación», «Evaluaciones de transformación escolar», «Mis Evaluaciones», «Ver mis evaluaciones», «Configuración de contexto escolar», «Todas las Evaluaciones», «Ver evaluaciones por escuela», «Comunicación», «Noticias y eventos», «Noticias», «Gestión de noticias y artículos», «Eventos», «Gestión de eventos y línea de tiempo», «Comunidades», «Gestionar miembros de comunidades», «Usuarios del Colegio», «Gestionar usuarios de su colegio», «Personas», «Usuarios, escuelas y redes», «Usuarios», «Administrar usuarios», «Registros», «Registros públicos de acceso», «Pasantías», «Interesados en Pasantías INSPIRA», «Nóminas de pasantes», «Pasantes inscritos por colegio» | l.115 |

**Other texts written in the code (safety net: not tied to an element by the script)** (69)

| Text | Where |
|---|---|
| «Panel de pasantías» | NAVIGATION_ITEMS · l.437 |
| «Seguimiento, documentos y cartas de la cohorte» | NAVIGATION_ITEMS · l.440 |
| «Escuelas» | NAVIGATION_ITEMS · l.445 |
| «Gestión de escuelas y generaciones» | NAVIGATION_ITEMS · l.448 |
| «Redes de Colegios» | NAVIGATION_ITEMS · l.453 |
| «Gestión de redes y supervisores» | NAVIGATION_ITEMS · l.456 |
| «Matriz de Asignaciones» | NAVIGATION_ITEMS · l.461 |
| «Asignaciones por usuario» | NAVIGATION_ITEMS · l.464 |
| «Consultorías» | NAVIGATION_ITEMS · l.471 |
| «Gestión de consultorías» | NAVIGATION_ITEMS · l.473 |
| «Asignación de Consultores» | NAVIGATION_ITEMS · l.478 |
| «Gestionar asignaciones» | NAVIGATION_ITEMS · l.480 |
| «Vista de Tareas» | NAVIGATION_ITEMS · l.486 |
| «Monitoreo de tareas grupales» | NAVIGATION_ITEMS · l.488 |
| «Gestión de sesiones de consultoría» | NAVIGATION_ITEMS · l.495 |
| «Aprobaciones» | NAVIGATION_ITEMS · l.501 |
| «Solicitudes de cambio pendientes» | NAVIGATION_ITEMS · l.503 |
| «Estadísticas de sesiones de consultoría» | NAVIGATION_ITEMS · l.511 |
| «Tarifas» | NAVIGATION_ITEMS · l.517 |
| «Gestionar tarifas de consultores» | NAVIGATION_ITEMS · l.519 |
| «Ganancias» | NAVIGATION_ITEMS · l.525 |
| «Ver ganancias de consultores» | NAVIGATION_ITEMS · l.527 |
| «Clasificar Sesiones» | NAVIGATION_ITEMS · l.533 |
| «Asignar tipo de hora a sesiones históricas sin clasificar» | NAVIGATION_ITEMS · l.535 |
| «Gestión empresarial» | NAVIGATION_ITEMS · l.545 |
| «Clientes» | NAVIGATION_ITEMS · l.550 |
| «Gestión de clientes» | NAVIGATION_ITEMS · l.552 |
| «Contratos» | NAVIGATION_ITEMS · l.558 |
| «Gestión de contratos» | NAVIGATION_ITEMS · l.560 |
| «Propuestas Pasantías» | NAVIGATION_ITEMS · l.566 |
| «Cotizaciones Barcelona» | NAVIGATION_ITEMS · l.568 |
| «Rendición de Gastos» | NAVIGATION_ITEMS · l.578 |
| «Reportes de gastos» | NAVIGATION_ITEMS · l.580 |
| «Soporte Técnico» | NAVIGATION_ITEMS · l.590 |
| «Gestión de errores y solicitudes» | NAVIGATION_ITEMS · l.592 |
| «Procesos» | NAVIGATION_ITEMS · l.598 |
| «Listado de licitaciones» | NAVIGATION_ITEMS · l.600 |
| «Plantillas de Bases» | NAVIGATION_ITEMS · l.606 |
| «Gestion de plantillas de Bases» | NAVIGATION_ITEMS · l.608 |
| «Feriados» | NAVIGATION_ITEMS · l.614 |
| «Gestion de feriados nacionales» | NAVIGATION_ITEMS · l.616 |
| «Análisis y reportes» | NAVIGATION_ITEMS · l.626 |
| «Avance y alertas de rutas» | NAVIGATION_ITEMS · l.644 |
| «Panel de Resultados» | NAVIGATION_ITEMS · l.650 |
| «Resultados de evaluaciones de la escuela» | NAVIGATION_ITEMS · l.652 |
| «Reporte de Horas» | NAVIGATION_ITEMS · l.658 |
| «Reporte de horas de la escuela» | NAVIGATION_ITEMS · l.661 |
| «QA Testing» | NAVIGATION_ITEMS · l.668 |
| «Pruebas de calidad» | NAVIGATION_ITEMS · l.670 |
| «Ejecutar Pruebas» | NAVIGATION_ITEMS · l.675 |
| «Ejecutar escenarios de prueba» | NAVIGATION_ITEMS · l.677 |
| «Panel de QA» | NAVIGATION_ITEMS · l.682 |
| «Dashboard y gestión» | NAVIGATION_ITEMS · l.684 |
| «Escenarios» | NAVIGATION_ITEMS · l.689 |
| «Gestionar escenarios» | NAVIGATION_ITEMS · l.691 |
| «Importar» | NAVIGATION_ITEMS · l.696 |
| «Importar escenarios» | NAVIGATION_ITEMS · l.698 |
| «Registro de Horas» | NAVIGATION_ITEMS · l.703 |
| «Tiempo activo para facturación» | NAVIGATION_ITEMS · l.705 |
| «Generador» | NAVIGATION_ITEMS · l.710 |
| «Generar escenarios con IA» | NAVIGATION_ITEMS · l.712 |
| «Sistema» | NAVIGATION_ITEMS · l.719 |
| «Configuración del sistema» | NAVIGATION_ITEMS · l.721 |
| «Roadmap MVP» | NAVIGATION_ITEMS · l.733 |
| «Progreso del desarrollo GENERA» | NAVIGATION_ITEMS · l.736 |
| «Roles y Permisos» | NAVIGATION_ITEMS · l.741 |
| «Gestión de roles y permisos» | NAVIGATION_ITEMS · l.744 |
| «Cerrar menú» | Sidebar · l.1497 |
| «Sidebar» | l.1548 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (5)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: {cacheKey}` | readCache · l.1167 |
| listener | `window.addEventListener('focus')` | l.1235 |
| timer | `setInterval(…, 30000)` | l.1250 |
| mark | `testid=global-sidebar` | l.1446 |
| address value | `?section` | l.1 |

**Values shown from data** (1)

- `{item.description}` — l.891, when `isCollapsed && hasChildren && showCollapsedMenu && item.description`

**Other texts on screen** (2)

- «Hub de Transformación» — l.1472, when `!isCollapsed`
- «by FNE» — l.1475, when `!isCollapsed`

**Reads and writes the database directly:** `table:assessment_instance_assignees` (select), `table:platform_feedback` (select), `table:profiles` (select), `table:superadmins` (select), `table:user_roles` (select)

### components/layout/SidebarNuevo.tsx

Used by: `(the frame)`

**Titles** (1)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «{item.label}» | h3 | `isCollapsed && hasChildren && showCollapsedMenu` | l.135 |

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[{item.label}]» · tooltip «{title}» · aria «{item.label}» | `{handleClick}` |  |  | `testid=sidebar-item-{item.id}` | l.98 |
| «[icon ToggleIcon]» · tooltip «{toggleLabel}» · aria «{toggleLabel}» | `{isDesktop ? onDesktopToggle : onMobileClose}` |  |  |  | SidebarNuevo · l.256 |

**Links** (2)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{child.label} [{child.description}]» | `{child.href}` | `isCollapsed && hasChildren && showCollapsedMenu && each filteredChildren` |  | l.142 |
| «{child.label}» | `{child.href}` | `!isCollapsed && hasChildren && isExpanded && each filteredChildren` |  | l.173 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` |  | `{onMobileClose}` | `!isDesktop && isMobileOpen` · screen size: `lg:hidden` | SidebarNuevo · l.224 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onMouseEnter={handleMouseEnter} · onMouseLeave={handleMouseLeave}` |  | l.97 |

**Embedded media** (1)

| What | Shown when | Hook | Where |
|---|---|---|---|
| img · alt Genera · /genera/icon-transparent.svg | `!isCollapsed` |  | SidebarNuevo · l.245 |

**Pieces placed here, with the texts and settings handed to them** (2)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ChevronDownIcon` | aria-hidden: true | `!isCollapsed && hasChildren` |  | l.123 |
| `ToggleIcon` | aria-hidden: true |  |  | SidebarNuevo · l.263 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `toggleLabel` | «Expandir sidebar / Contraer sidebar / Cerrar menú» | SidebarNuevo · l.217 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=global-sidebar` | SidebarNuevo · l.232 |

**Values shown from data** (2)

- `{value}` — Count · l.49
- `{item.description}` — l.136, when `isCollapsed && hasChildren && showCollapsedMenu && item.description`

**Other texts on screen** (4)

- «Genera» — SidebarNuevo · l.247, when `!isCollapsed`
- «Hub de Transformación» — SidebarNuevo · l.250, when `!isCollapsed`
- «by FNE» — SidebarNuevo · l.251, when `!isCollapsed`
- «Fundación Nueva Educación» — SidebarNuevo · l.277, when `!isCollapsed`

### components/layout/TopBarNuevo.tsx

Used by: `(the frame)`

**Buttons** (2)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon Bars3Icon]» · aria «Abrir menú de navegación» | `{onMobileSidebarOpen}` | screen size: `lg:hidden` |  | `testid=mobile-sidebar-trigger` | TopBarNuevo · l.50 |
| «Salir» | `{onLogout}` | `user` |  |  | TopBarNuevo · l.120 |

**Links** (3)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «{crumb.label}» | `{crumb.href}` | `breadcrumbs.length > 0 && each breadcrumbs && crumb.href` · screen size: `hidden lg:flex` |  | TopBarNuevo · l.70 |
| «[icon Avatar]» | `/profile` | `user` |  | TopBarNuevo · l.109 |
| «[icon Avatar]» · tooltip «Mi Perfil» |  | `user` |  | TopBarNuevo · l.110 |

**Pieces placed here, with the texts and settings handed to them** (4)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `ChevronRightIcon` | aria-hidden: true | `breadcrumbs.length > 0 && each breadcrumbs && index > 0` · screen size: `hidden lg:flex` |  | TopBarNuevo · l.68 |
| `ModernNotificationCenter` | panelAlign: right | `user` |  | TopBarNuevo · l.107 |
| `Avatar` |  | `user` |  | TopBarNuevo · l.111 |
| `LogOut` | aria-hidden: true | `user` |  | TopBarNuevo · l.126 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| mark | `testid=topbar-current-page` | TopBarNuevo · l.92 |

**Values shown from data** (3)

- `{crumb.label}` — TopBarNuevo · l.79, when `breadcrumbs.length > 0 && each breadcrumbs && !(crumb.href)`, screen size: `hidden lg:flex`
- `{currentName}` — TopBarNuevo · l.92, when `currentName`, screen size: `lg:hidden`
- `{schoolName}` — TopBarNuevo · l.102, when `user && schoolName`, screen size: `hidden lg:block`

**Other texts on screen** (1)

- «Breadcrumb» (aria-label) — TopBarNuevo · l.62, when `breadcrumbs.length > 0`, screen size: `hidden lg:flex`

### components/layout/useSidebarItem.ts

Used by: `(the frame)`

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `{item.href}` | `router.push` | `!(isCollapsed && hasChildren) && !(hasChildren) && item.href` | useSidebarItem · l.109 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| listener | `document.addEventListener('mousedown')` | useSidebarItem · l.62 |

### components/notifications/ModernNotificationCenter.tsx

Used by: `(the frame)`

**Titles** (4)

| Text | Level | Shown when | Where |
|---|---|---|---|
| «Notificaciones» | h3 | `isOpen` | ModernNotificationCenter · l.448 |
| «Error al cargar» | h4 | `isOpen && error && !loading` | ModernNotificationCenter · l.497 |
| «Sin notificaciones» | h4 | `isOpen && !(loading) && notifications.length === 0` | ModernNotificationCenter · l.522 |
| «{notification.title.substrin…}... / {notification.title}» | h4 | `isOpen && !(loading) && !(notifications.length === 0) && each notifications` | ModernNotificationCenter · l.557 |

**Buttons** (4)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[99+ / {unreadCount}]» · aria «{`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}» | `{() => setIsOpen(!isOpen)}` |  |  |  | ModernNotificationCenter · l.403 |
| «Marcar todas» | `{handleMarkAllAsRead}` | `isOpen && unreadCount > 0` | `{markingAllRead}` |  | ModernNotificationCenter · l.460 |
| «Reintentar» | `{() => fetchNotifications(true)}` | `isOpen && error && !loading` |  |  | ModernNotificationCenter · l.499 |
| «Ver todas las notificaciones» | `{() => { setIsOpen(false); router.push('/notifications'); }}` | `isOpen && notifications.length > 0` |  |  | ModernNotificationCenter · l.601 |

**Links** (1)

| Text | Goes to | Shown when | Hook | Where |
|---|---|---|---|---|
| «[icon CogIcon]» · aria «Configuración de notificaciones» | `/configuracion/notificaciones` | `isOpen` | `testid=notification-center-settings` | ModernNotificationCenter · l.475 |

**Other things that react to a click** (1)

| Element | Text | Does | Shown when | Where |
|---|---|---|---|---|
| `div` | «{notification.title.substrin…}... / {notification.title} [{notification.description.su…}... / {notification.description…» | `{() => handleNotificationClick(notification)}` | `isOpen && !(loading) && !(notifications.length === 0) && each notifications` | ModernNotificationCenter · l.533 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Failed to fetch notifications» | `throw (shown by whoever catches it)` | `notifError` | ModernNotificationCenter · l.104 |
| «Failed to load notifications» | `setError` |  | ModernNotificationCenter · l.133 |
| «No session» | `throw (shown by whoever catches it)` | `!session?.user` | handleMarkAllAsRead · l.354 |

**Moves to another page from code** (3)

| Goes to | How | When | Where |
|---|---|---|---|
| `{url}` | `router.push` | `url && !url.includes('{')` | handleNotificationClick · l.300 |
| `{fallbackUrl}` | `router.push` | `!(url && !url.includes('{'))` | handleNotificationClick · l.333 |
| `/notifications` | `router.push` | `isOpen && notifications.length > 0` | ModernNotificationCenter · l.604 |

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `now - lastFetchRef.current < 1000` | ModernNotificationCenter · l.65 |
| `isFetchingRef.current` | ModernNotificationCenter · l.70 |
| `!session?.user` | ModernNotificationCenter · l.82 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `CogIcon` | aria-hidden: true | `isOpen` |  | ModernNotificationCenter · l.483 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| timer | `setInterval(…, REFRESH_INTERVAL)` | ModernNotificationCenter · l.158 |
| listener | `document.addEventListener('mousedown')` | ModernNotificationCenter · l.392 |

**Values shown from data** (3)

- `{error}` — ModernNotificationCenter · l.498, when `isOpen && error && !loading`
- `{notification.description.su…}... / {notification.description}` — ModernNotificationCenter · l.568, when `!(loading) && !(notifications.length === 0) && each notifications && notification.description`
- `{getRelativeTime(notification.create…}` — ModernNotificationCenter · l.581, when `isOpen && !(loading) && !(notifications.length === 0) && each notifications`

**Other texts on screen** (3)

- «{unreadCount} notificación{unreadCount !== 1 ? 'es' : …} sin leer / Todas las notificaciones leídas» — ModernNotificationCenter · l.449, when `isOpen`
- «Cargando notificaciones...» — ModernNotificationCenter · l.513, when `isOpen && loading`
- «Te notificaremos cuando tengas algo nuevo» — ModernNotificationCenter · l.523, when `isOpen && !(loading) && notifications.length === 0`

**Reads and writes the database directly:** `table:user_notifications` (select, update)

### components/qa/QAFloatingWidget.tsx

Used by: `(the frame)`

**Buttons** (7)

| Text | Does | Shown when | Disabled when | Hook | Where |
|---|---|---|---|---|---|
| «[icon ChevronUp]» · tooltip «{isMinimized ? 'Expandir' : 'Minimizar'}» | `{() => setIsMinimized(!isMinimized)}` |  |  |  | QAFloatingWidget · l.862 |
| «[icon X]» · tooltip «Salir del modo QA» | `{exitQAMode}` |  |  |  | QAFloatingWidget · l.869 |
| «Ir» | `{() => router.push(currentStep.route!)}` | `!isMinimized && !isComplete && currentStep && currentStep.route && currentStep.route !== router.asPath` |  |  | QAFloatingWidget · l.961 |
| «Fallo» | `{() => saveStepResult(false)}` | `!isMinimized && !isComplete && currentStep` | `{saving \|\| isCapturingScreenshot}` |  | QAFloatingWidget · l.994 |
| «Saltar» | `{skipStep}` | `!isMinimized && !isComplete && currentStep` | `{saving \|\| isCapturingScreenshot}` |  | QAFloatingWidget · l.1002 |
| «Paso» | `{() => saveStepResult(true)}` | `!isMinimized && !isComplete && currentStep` | `{saving \|\| isCapturingScreenshot}` |  | QAFloatingWidget · l.1010 |
| «Guardando... / Finalizar y Ver Resultados» | `{completeTestRun}` | `!isMinimized && isComplete` | `{saving}` |  | QAFloatingWidget · l.1057 |

**Fields** (2)

| Label | Kind | Name / placeholder | Choices | Shown when | Hook | Where |
|---|---|---|---|---|---|---|
| «Notas (opcional)...» | textarea | «Notas (opcional)...» |  | `!isMinimized && !isComplete && currentStep` |  | QAFloatingWidget · l.976 |
| «Notas finales (opcional)...» | textarea | «Notas finales (opcional)...» |  | `!isMinimized && isComplete` |  | QAFloatingWidget · l.1049 |

**Other gestures (keys, hover, drag, blur)** (1)

| Element | Reacts to | Shown when | Where |
|---|---|---|---|
| `div` | `onMouseDown={handleMouseDown}` |  | QAFloatingWidget · l.846 |

**Toasts** (10)

| Kind | Text | When | Where |
|---|---|---|---|
| success | «Tiempo recuperado: {recoveredMinutes} minuto{recoveredMinutes !== 1 ? 's…}» | `storedTestRunId && storedScenario && storedStepActive && recoveredSeconds > 30 && recoveredMinutes > 0` | QAFloatingWidget · l.334 |
| plain | «Resultado guardado localmente (sin sesión)» | `!response.ok && response.status === 401` | saveStepResult · l.585 |
| success | «Paso completado ✓ / Paso fallido ✗» | `!(currentStepIndex >= scenario.steps.length - 1)` | saveStepResult · l.614 |
| error | «Error al guardar resultado» |  | saveStepResult · l.624 |
| plain | «Resultado guardado localmente (sin sesión)» | `!response.ok && response.status === 401` | skipStep · l.667 |
| plain | «Paso saltado ⏭️» | `!(currentStepIndex >= scenario.steps.length - 1)` | skipStep · l.696 |
| error | «Error al saltar paso» |  | skipStep · l.706 |
| success | «Ejecución completada» |  | completeTestRun · l.747 |
| error | «Error al completar ejecución» |  | completeTestRun · l.752 |
| success | «Sincronizados {buffer.length - remaining.l…} resultados» | `remaining.length < buffer.length` | syncBuffer · l.813 |

**Messages set on the page** (3)

| Text | Set by | When | Where |
|---|---|---|---|
| «Error al guardar resultado» | `throw (shown by whoever catches it)` | `!response.ok && !(response.status === 401)` | saveStepResult · l.588 |
| «Error al guardar resultado» | `throw (shown by whoever catches it)` | `!response.ok && !(response.status === 401)` | skipStep · l.670 |
| «Error al completar ejecución» | `throw (shown by whoever catches it)` | `!response.ok` | completeTestRun · l.744 |

**Moves to another page from code** (4)

| Goes to | How | When | Where |
|---|---|---|---|
| `{nextStep.route}` | `router.push` | `!(currentStepIndex >= scenario.steps.length - 1) && nextStep?.route && nextStep.route !== router.asPath` | saveStepResult · l.619 |
| `{nextStep.route}` | `router.push` | `!(currentStepIndex >= scenario.steps.length - 1) && nextStep?.route && nextStep.route !== router.asPath` | skipStep · l.701 |
| `/qa` | `router.push` |  | completeTestRun · l.749 |
| `{currentStep.route!}` | `router.push` | `!isMinimized && !isComplete && currentStep && currentStep.route && currentStep.route !== router.asPath` | QAFloatingWidget · l.962 |

**Draws nothing when** (6)

| Condition | Where |
|---|---|
| `typeof window === 'undefined'` | QAFloatingWidget · l.282 |
| `!testRunId \|\| !scenario \|\| isComplete` | QAFloatingWidget · l.382 |
| `lastDbSave && now - parseInt(lastDbSave, 10) < DB_SAVE_INTERVAL` | QAFloatingWidget · l.397 |
| `!testRunId \|\| !scenario \|\| isComplete` | QAFloatingWidget · l.431 |
| `!isDragging` | QAFloatingWidget · l.477 |
| `!testRunId \|\| !scenario` | QAFloatingWidget · l.823 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `stepResultData` | «Paso saltado» | skipStep · l.643 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (16)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: {QA_SESSION_KEY}` | QAFloatingWidget · l.285 |
| storage | `sessionStorage: {QA_SCENARIO_KEY}` | QAFloatingWidget · l.286 |
| storage | `sessionStorage: {QA_CURRENT_STEP_KEY}` | QAFloatingWidget · l.287 |
| storage | `sessionStorage: {QA_STEP_RESULTS_KEY}` | QAFloatingWidget · l.288 |
| storage | `localStorage: {QA_WIDGET_POSITION_KEY}` | QAFloatingWidget · l.289 |
| storage | `localStorage: {QA_WIDGET_MINIMIZED_KEY}` | QAFloatingWidget · l.290 |
| storage | `sessionStorage: {QA_TOTAL_ACTIVE_SECONDS_KEY}` | QAFloatingWidget · l.319 |
| storage | `sessionStorage: {QA_STEP_ACTIVE_SECONDS_KEY}` | QAFloatingWidget · l.325 |
| timer | `setInterval(…, SESSION_SAVE_INTERVAL)` | QAFloatingWidget · l.385 |
| timer | `setInterval(…, DB_SAVE_INTERVAL)` | QAFloatingWidget · l.392 |
| storage | `sessionStorage: {QA_LAST_DB_SAVE_KEY}` | QAFloatingWidget · l.393 |
| listener | `window.addEventListener('beforeunload')` | QAFloatingWidget · l.458 |
| listener | `document.addEventListener('mousemove')` | QAFloatingWidget · l.494 |
| listener | `document.addEventListener('mouseup')` | QAFloatingWidget · l.495 |
| storage | `sessionStorage: {QA_CAPTURE_BUFFER_KEY}` | saveStepResult · l.582 |
| storage | `sessionStorage: {QA_RECOVERED_TIME_KEY}` | exitQAMode · l.771 |

**Values shown from data** (7)

- `{scenario.name}` — QAFloatingWidget · l.884, when `!isMinimized && !isComplete && currentStep`
- `{currentStepIndex + 1} / {totalSteps}` — QAFloatingWidget · l.900, when `!isMinimized && !isComplete && currentStep`
- `{currentStep.instruction}` — QAFloatingWidget · l.953, when `!isMinimized && !isComplete && currentStep`
- `{currentStep.route}` — QAFloatingWidget · l.959, when `!isMinimized && !isComplete && currentStep && currentStep.route`
- `{Array.from(stepResults.values()).fi…}` — QAFloatingWidget · l.1030, when `!isMinimized && isComplete`
- `{Array.from(stepResults.values()).fi…}` — QAFloatingWidget · l.1036, when `!isMinimized && isComplete`
- `{Array.from(stepResults.values()).fi…}` — QAFloatingWidget · l.1042, when `!isMinimized && isComplete`

**Other texts on screen** (10)

- «QA: {currentStepIndex + 1}/{totalSteps} / QA Testing» — QAFloatingWidget · l.852
- «Pausado (inactivo) / Tiempo activo» (title) — QAFloatingWidget · l.856
- «Multi-Usuario» — QAFloatingWidget · l.887, when `!isMinimized && !isComplete && currentStep && scenario.is_multi_user`
- «Este paso requiere cerrar sesión. Los resultados se guardarán localmente.» — QAFloatingWidget · l.928, when `!isMinimized && !isComplete && currentStep && stepRequiresLogout`
- «Esperado:» — QAFloatingWidget · l.971, when `!isMinimized && !isComplete && currentStep`
- «Capturando pantalla...» — QAFloatingWidget · l.988, when `!isMinimized && !isComplete && currentStep && isCapturingScreenshot`
- «¡Prueba Completada!» — QAFloatingWidget · l.1026, when `!isMinimized && isComplete`
- «Pasaron» — QAFloatingWidget · l.1033, when `!isMinimized && isComplete`
- «Fallaron» — QAFloatingWidget · l.1039, when `!isMinimized && isComplete`
- «Saltados» — QAFloatingWidget · l.1045, when `!isMinimized && isComplete`

### components/qa/QASessionProvider.tsx

Used by: `(the frame)`

**Draws nothing when** (3)

| Condition | Where |
|---|---|
| `typeof window === 'undefined'` | QASessionProvider · l.46 |
| `typeof window === 'undefined'` | QASessionProvider · l.93 |
| `typeof window === 'undefined'` | QASessionProvider · l.107 |

**Pieces placed here, with the texts and settings handed to them** (1)

| Piece | Texts and settings | Shown when | Hook | Where |
|---|---|---|---|---|
| `QAFloatingWidget` |  | `showWidget` |  | QASessionProvider · l.140 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (7)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: {QA_SESSION_KEY}` | QASessionProvider · l.49 |
| storage | `sessionStorage: {QA_SCENARIO_KEY}` | QASessionProvider · l.50 |
| listener | `window.addEventListener('storage')` | QASessionProvider · l.78 |
| listener | `window.addEventListener('focus')` | QASessionProvider · l.79 |
| timer | `setInterval(…, 2000)` | QASessionProvider · l.82 |
| storage | `sessionStorage: qa_current_step_index` | QASessionProvider · l.112 |
| storage | `sessionStorage: qa_step_results` | QASessionProvider · l.113 |

### constants/toastStyles.ts

Used by: `(the frame)`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `baseStyle` | «Inter, system-ui, -apple-system, sans-serif» | l.29 |

### contexts/AuthContext.tsx

Used by: `(the frame)`

**Moves to another page from code** (1)

| Goes to | How | When | Where |
|---|---|---|---|
| `/login` | `router.push` |  | logout · l.241 |

**Access checks in the code** (6)

| Line of code | Where |
|---|---|
| `isGlobalAdmin = await hasAdminPrivileges(supabase, session.user.id)` | fetchUserData · l.177 |
| `highestRole = getHighestRole(userRoles)` | fetchUserData · l.178 |
| `value: AuthContextType = { ...authState, logout, hasPermission, hasRole, getOrganizationalScope, // Backward compatibility canCreateCourses: hasPermi…` | AuthProvider · l.283 |
| `value: AuthContextType = { ...authState, logout, hasPermission, hasRole, getOrganizationalScope, // Backward compatibility canCreateCourses: hasPermi…` | AuthProvider · l.284 |
| `value: AuthContextType = { ...authState, logout, hasPermission, hasRole, getOrganizationalScope, // Backward compatibility canCreateCourses: hasPermi…` | AuthProvider · l.284 |
| `value: AuthContextType = { ...authState, logout, hasPermission, hasRole, getOrganizationalScope, // Backward compatibility canCreateCourses: hasPermi…` | AuthProvider · l.285 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Bearer {accessToken}» | AuthProvider · l.137 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (1)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: rememberMe` | logout · l.238 |

**Values shown from data** (1)

- `{children}` — AuthProvider · l.288

**Reads and writes the database directly:** `table:profiles` (select)

### contexts/LookContext.tsx

Used by: `(the frame)`

**Draws nothing when** (1)

| Condition | Where |
|---|---|
| `account === null` | LookProvider · l.129 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `target` | «clasico / leave» | LookProvider · l.111 |

**Values shown from data** (1)

- `{children}` — LookProvider · l.134

### contexts/PermissionContext.tsx

Used by: `(the frame)`

**Access checks in the code** (3)

| Line of code | Where |
|---|---|
| `isAdmin = useMemo(() => { return user?.user_metadata?.roles?.includes('admin') \|\| user?.user_metadata?.role === 'admin' \|\| false; }, [userId])` | PermissionProvider · l.26 |
| `return perms.some(p => hasPermission(p));` | PermissionProvider · l.147 |
| `return perms.every(p => hasPermission(p));` | PermissionProvider · l.151 |

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| storage | `localStorage: permissions_{userId}` | PermissionProvider · l.35 |
| storage | `localStorage: {key}` | PermissionProvider · l.56 |
| storage | `localStorage: permissions_{currentUser.id}` | PermissionProvider · l.115 |

**Values shown from data** (1)

- `{children}` — PermissionProvider · l.164

**Reads and writes the database directly:** `table:role_permissions` (select), `table:user_roles` (select)

### hooks/useActivityTracker.ts

Used by: `(the frame)`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (3)

| Kind | What | Where |
|---|---|---|
| timer | `setTimeout(…, IDLE_TIMEOUT_MS)` | useActivityTracker · l.84 |
| timer | `setInterval(…, TICK_INTERVAL_MS)` | useActivityTracker · l.109 |
| listener | `document.addEventListener('visibilitychange')` | useActivityTracker · l.135 |

### hooks/useAvatar.ts

Used by: `(the frame)`

**Reads and writes the database directly:** `table:profiles` (select)

### hooks/useWebVitals.ts

Used by: `(the frame)`

**Fragile hooks (ids, test marks, tour marks, focus, scroll, listeners, timers, saved state, values read from the address)** (2)

| Kind | What | Where |
|---|---|---|
| storage | `sessionStorage: qa_vitals_session_id` | generateSessionId · l.33 |
| timer | `setTimeout(…, 1000)` | createReporter · l.84 |

### lib/legal/privacy-notice.ts

Used by: `(the frame)`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `LEGAL_IDENTITY` | «Fundación Nueva Educación», «Fundación Instituto Relacional», «RUT 65.166.503-5», «Carlos Silva Vildósola 10448», «La Reina, Santiago», «Chile» | l.46 |

### lib/look.ts

Used by: `(the frame)`

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `lookFromPreferences()` | «nuevo / clasico» | lookFromPreferences · l.30 |

### lib/qa/screenshotCapture.ts

Used by: `(the frame)`

**Downloads and printing** (1)

| How | When | Where |
|---|---|---|
| `html2canvas()` |  | captureScreenshot · l.56 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (2)

| Name | Texts | Where |
|---|---|---|
| `timestamp` | «-{new Date().toISOString().re…}» | captureScreenshot · l.93 |
| `errorMessage` | «Unknown error during capture» | captureScreenshot · l.127 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Failed to convert canvas to blob» | captureScreenshot · l.88 |
| «Upload failed: {uploadError.message}» | captureScreenshot · l.113 |

**Reads and writes the database directly:** `bucket:{QA_SCREENSHOTS_BUCKET}` (getPublicUrl, upload)

### lib/sidebar/childVisibility.ts

Used by: `(the frame)`

**Access checks in the code** (3)

| Line of code | Where |
|---|---|
| `return ctx.hasAllPermissions(child.permission);` | isChildVisible · l.95 |
| `return ctx.hasAnyPermission(child.permission);` | isChildVisible · l.97 |
| `return ctx.hasPermission(child.permission);` | isChildVisible · l.100 |

### lib/utils/environmentMonitor.ts

Used by: `(the frame)`

**Messages set on the page** (4)

| Text | Set by | When | Where |
|---|---|---|---|
| «Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL» | `errors.push` | `!supabaseUrl` | validateEnvironment · l.41 |
| «Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY» | `errors.push` | `!supabaseAnonKey` | validateEnvironment · l.45 |
| «Application is configured for TEST environment» | `warnings.push` | `!(supabaseUrl === PRODUCTION_SUPABASE_URL) && TEST_SUPABASE_URLS.some(testUrl => supabaseUrl?.includes(testUrl.replace('http://', '').replace('https://', '')))` | validateEnvironment · l.55 |
| «Unknown Supabase URL: {supabaseUrl}» | `warnings.push` | `!(supabaseUrl === PRODUCTION_SUPABASE_URL) && !(TEST_SUPABASE_URLS.some(testUrl => supabaseUrl?.includes(testUrl.replace('http://', '').replace('https://', '')))) && supabaseUrl` | validateEnvironment · l.58 |

**Other texts written in the code (safety net: not tied to an element by the script)** (1)

| Text | Where |
|---|---|
| «Environment validation failed» | useEnvironmentValidation · l.139 |

### types/roles.ts

Used by: `(the frame)`

**Texts kept in lists and helpers in the code (labels, options, status names)** (3)

| Name | Texts | Where |
|---|---|---|
| `ROLE_NAMES` | «Administrador Global», «Consultor FNE», «Equipo Directivo», «Líder de Generación», «Líder de Comunidad», «Supervisor de Red», «Community Manager», «Docente», «Encargado de Licitacion» | l.305 |
| `ROLE_DESCRIPTIONS` | «Staff de FNE con control total de la plataforma. Pueden pertenecer a comunidades para colaboración.», «Consultores FNE asignados a colegios específicos. Pueden pertenecer a comunidades para colaboración.», «Administradores a nivel de colegio. Pueden pertenecer a comunidades para colaboración.», «Líderes de generaciones Tractor/Innova. Pueden pertenecer a comunidades para colaboración.», «Líderes de Comunidades de Crecimiento (2-16 miembros). Crean automáticamente su propia comunidad.», «Supervisores con acceso limitado a reportes de una red específica de colegios. Pueden inscribirse en cursos como estudiantes.», «Gestores de comunidad con acceso a panel, perfil, aprendizaje, cursos y rendición de gastos.», «Docentes participantes en cursos. Pueden pertenecer a comunidades para colaboración.», «Encargados de procesos de licitacion en establecimientos educacionales. Gestionan el proceso de contratacion de ATEs bajo Ley SEP.» | l.318 |
| `ROLE_ORGANIZATIONAL_REQUIREMENTS` | «Global role - no organizational scope required», «Must be assigned to a specific school», «Must be assigned to a specific school and generation», «Must be assigned to a school (community auto-created)», «Network-level role - no specific school required», «Content management role - no organizational scope required», «Must be assigned to a specific school for procurement management» | l.342 |

**Other texts written in the code (safety net: not tied to an element by the script)** (4)

| Text | Where |
|---|---|
| «Unknown role type: {roleType}» | validateRoleAssignment · l.413 |
| «Role "{ROLE_NAMES[roleType]}" requires a school assignment» | validateRoleAssignment · l.421 |
| «Role "{ROLE_NAMES[roleType]}" requires a generation assignment» | validateRoleAssignment · l.429 |
| «Role "{ROLE_NAMES[roleType]}" requires a community assignment» | validateRoleAssignment · l.437 |

### utils/roleUtils.ts

Used by: `(the frame)`

**Access checks in the code** (3)

| Line of code | Where |
|---|---|
| `return await isGlobalAdmin(supabase, userId);` | hasAdminPrivileges · l.161 |
| `userRoles = await getUserRoles(supabase, userId)` | getUserProfileWithRoles · l.903 |
| `existingRoles = await getUserRoles(supabase, userId)` | migrateLegacyUser · l.925 |

**Texts kept in lists and helpers in the code (labels, options, status names)** (1)

| Name | Texts | Where |
|---|---|---|
| `newRoleType` | «admin / docente» | migrateLegacyUser · l.930 |

**Other texts written in the code (safety net: not tied to an element by the script)** (2)

| Text | Where |
|---|---|
| «Error al migrar usuario:» | migrateLegacyUser · l.956 |
| «Error inesperado al migrar usuario» | migrateLegacyUser · l.962 |

**Reads and writes the database directly:** `table:generations` (select), `table:growth_communities` (select), `table:profiles` (select), `table:schools` (select), `table:user_roles` (insert, select), `table:user_roles_cache` (select)

## API files of this area

| Address | File | Methods | Screens that call it | Also named in |
|---|---|---|---|---|
| `/api/feedback/notify-admins` | `pages/api/feedback/notify-admins.ts` | POST | **no screen** | `__tests__/api/feedback/notify-admins.test.ts`, `components/feedback/FeedbackModal.tsx`, `tests/e2e/feedback-notify-admins.spec.ts` |

