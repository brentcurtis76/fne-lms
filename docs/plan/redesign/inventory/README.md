# GENERA platform redesign — the inventory

What every screen of the platform offers today, so the redesign can prove that nothing is lost (PLAN.md, "The no-loss rules": the inventory is the contract).

Read from commit `c30585b2f08aa7fcf45c544bc6d90d2ce2ae4dc9` (2026-11-16).

## How to use it

- One page per area (`NN-name.md`) for people, one data file per area (`data/NN-name.json`) for scripts. Both are written by the script; do not edit them.
- Hand-written input, never overwritten: `areas.json` (which file belongs to which area, the leftover marks) and `annotations.json` (the changes Brent approved with the mock-ups, and notes).
- `data/_index.json` lists every address with its file, area and what each role gets from the menu and the middleware. The picture harness of phase 3 walks this list.

```
node scripts/redesign/inventory.mjs check   # every file under pages/ is in exactly one area file
node scripts/redesign/inventory.mjs diff    # what changed in the code since these files were written
node scripts/redesign/inventory.mjs build   # write the files again from the code
node scripts/redesign/inventory.mjs diff --src ../another-checkout   # compare against a newer main without moving this branch
```

The script needs `node_modules` (it uses the TypeScript parser) and nothing else: no build, no database, no network.

## What a row is

The script reads each page file and every component it imports, and writes a row for each title, tab, button, link, field, table column, pop-up, browser `confirm()`/`alert()`, toast, message, download, chart, jump to another page, access check and fragile hook (element ids that code looks up, `data-testid`, `data-tour`, focus and scroll calls, values kept in the browser). "Shown when" is the condition written around the element in the code, as written; it is how a row is tied to a role. Texts are exactly as in the code; `{…}` stands for a value filled in at run time.

What reading the code cannot see is added by the walk by sight and kept in `annotations.json`.

## Areas

| Area | Screens | API files | Pieces | Rows |
|---|---|---|---|---|
| [Marco (the frame around every screen)](00-marco.md) | 2 | 1 | 27 | 482 |
| [Acceso (sign-in, sign-up, passwords)](01-acceso.md) | 7 | 13 | 7 | 318 |
| [Panel (Mi Panel)](02-panel.md) | 1 | 6 | 24 | 338 |
| [Mi Aprendizaje (the learner's courses, lessons and routes)](03-aprendizaje.md) | 7 | 1 | 23 | 632 |
| [Cursos (course builder, upcoming courses, learning paths, assignment matrix)](04-cursos.md) | 15 | 30 | 45 | 1546 |
| [Tareas y quizzes (assignments, group work, quiz review)](05-tareas.md) | 9 | 14 | 18 | 577 |
| [Sesiones y consultorías (sessions, approvals, video meetings)](06-sesiones.md) | 11 | 34 | 30 | 1486 |
| [Espacio Colaborativo y comunidades](07-espacio-colaborativo.md) | 4 | 18 | 66 | 1590 |
| [Gestor de Cambio (registros, context, migration plan, results)](08-gestor-de-cambio.md) | 16 | 40 | 30 | 1649 |
| [Vías de Transformación (to be deleted)](09-vias-transformacion.md) | 10 | 17 | 0 | 0 |
| [Licitaciones (processes, templates, proposals)](10-licitaciones.md) | 11 | 42 | 28 | 1586 |
| [Gestión (clients, contracts, quotes)](11-gestion.md) | 7 | 14 | 20 | 1193 |
| [Pasantías (leads, travellers, panel, my trip)](12-pasantias.md) | 5 | 21 | 25 | 889 |
| [Reportes](13-reportes.md) | 3 | 10 | 20 | 734 |
| [Personas (users, schools, networks, roles, profile)](14-personas.md) | 7 | 33 | 24 | 1242 |
| [Comunicación (news and events)](15-comunicacion.md) | 2 | 4 | 6 | 174 |
| [Notificaciones](16-notificaciones.md) | 5 | 10 | 8 | 285 |
| [Horas, tarifas y gastos](17-horas-gastos.md) | 4 | 9 | 15 | 441 |
| [QA (the platform's own test tool)](18-qa.md) | 16 | 21 | 13 | 1237 |
| [Sistema (configuration, support, roadmap, test and debug pages, scheduled jobs)](19-sistema.md) | 3 | 26 | 6 | 257 |
| [Sitio público (nuevaeducacion.org pages; not part of the platform redesign)](20-sitio-publico.md) | 8 | 1 | 28 | 825 |
| **Total** | **153** | **365** | | **17481** |

The menu has 18 entries at the top level and 61 children (`NAVIGATION_ITEMS` in `components/layout/Sidebar.tsx`).

## Other pages

- [Leftover pages for Brent to decide](leftovers.md)
- [Charts and their number of series](charts.md)
- [API files no screen calls](api-without-screen.md)
- [Screens and their tests](tests.md)

Not in the repository, which is public: the behaviour problems found on the way and what was seen on a walk by sight. They are kept, and written out as pages, in a private folder beside the redesign's ledger (see the head of the script).

## QA scenarios used as a seed

673 role scenarios were read from `docs/qa-system/seed-*.sql`. 241 name an address or a menu entry and are counted under that screen; 432 describe a function without naming either. By role: admin 203, consultor 109, equipo_directivo 76, lider_generacion 62, lider_comunidad 71, supervisor_de_red 60, community_manager 73, docente 5, encargado_licitacion 6. By the seeds' own feature area: navigation 232, consultor_sessions 99, reporting 65, hour_tracking 36, role_assignment 32, assessment_builder 28, user_management 24, school_management 17, docente_experience 16, licitaciones 13, network_management 12, quiz_submission 11, licitaciones_config 10, course_builder 9, course_enrollment 9, transformation 6, authentication 5, transformation_assessment 5, community_workspace 5, dashboard 4, news_management 4, quiz_grading 3, learning_paths 3, contract_management 3, course_management 3, collaborative_space 3, event_management 2, consultant_management 2, notification_management 2, role_management 2, user_profile 1, learning 1, group_assignments 1, system_configuration 1, workspace 1, community_management 1, assignment_tracking 1, api_access 1.

The seeds are from February and March 2026: nothing on Zoom, notification settings or Mis Horas, and almost nothing for docente. They were used to seed "who reaches what", not as proof.

