# Nota de supersesión — `santa-marta-promise-ledger-legacy-161.csv`

**Fecha de archivo:** 25 de agosto de 2026

## Por qué esta nota vive fuera del CSV

CSV no tiene sintaxis de comentario. Una fila de cabecera con un aviso **corrompería el artefacto forense**: alteraría el conteo de filas, rompería el parseo y cambiaría el hash. El archivo de al lado no debe cambiar ni en un byte, así que la nota va aquí.

## Qué es el archivo

El **ledger único original** de la jornada Santa Marta del 22 de agosto de 2026, tal como quedó al cierre de la ronda de revisión adversarial. Es el registro de procedencia de todo lo que vino después.

| Medida | Valor |
|---|---:|
| Filas de datos | **161** |
| Accionables (`BROKEN` + `CONDITIONAL` + `MISSING`) | **125** |
| Accionables con anotación de dueño real | **43** |
| Accionables sin anotación de dueño real | **82** (4 P0, 66 P1, 12 P2) |
| No accionables (27 `READY`, 7 `REFUTED`, 1 `FUTURE_DISCLOSED`, 1 `UNVERIFIABLE`) | 36 |
| Filas con severidad P0 | 37 |
| **SHA-256** | `009f14abccec97d7ada4b559c9aaeb24ac5b7aab54563a5c1151e511dc2c7fe9` |

`scripts/check-ledger.mjs` **lee la línea base de conservación desde esta ruta exacta y verifica ese hash**. Cualquier modificación del CSV hace fallar la validación.

## Qué lo supera

Sus **conteos operativos y su programación** quedan superados por tres artefactos normalizados en `docs/reviews/`:

| Artefacto | Qué es |
|---|---|
| `santa-marta-claims.csv` | Registro congelado: **160** reclamaciones de auditoría, sin propiedad ni programación |
| `santa-marta-work-items.csv` | Registro mutable: **104** unidades de remediación, con dueño, lote y modo de entrega |
| `santa-marta-work-claim-map.csv` | La unión: **147** pares `work_id,claim_id`, uno por fila |

El documento gobernante activo es `santa-marta-release-protocol-2026-08-25.md`.

## El único defecto de identidad que se corrigió

161 → 160. Una sesión anterior había partido `SWEEP-PRIOR-AUDIT-09` en `09a` y `09b` **dentro del ledger de reclamaciones**, creando dos reclamaciones donde sólo había una. Eso son dos *remediaciones* —el grupo A mecánico y el grupo B con diseño de política— sobre **un solo hallazgo**: las veintidós tablas legacy de `public` sin RLS alcanzables con la clave anon.

En el modelo normalizado esa distinción vive donde corresponde: **una reclamación, dos work items** (`W-B2b-01` y `W-B10a-01`).

Ninguna otra id desaparece, cambia de identidad o se inventa. El validador lo comprueba fila a fila contra este archivo.

## Lo que este archivo sigue siendo bueno para

- **Procedencia.** El texto original de cada reclamación, verbatim.
- **Evidencia.** La columna `archivo` con el localizador de código de cada hallazgo — **truncada a ~180 caracteres en las 161 filas**, así que es un extracto, no la evidencia completa. Ésa vive en los dos informes narrativos de `docs/reviews/`.
- **Auditoría de la propia normalización.** Es la línea base contra la que se mide.

## Lo que ya no debe usarse para

- Contar reclamaciones (**161 es incorrecto**; son 160).
- Contar P0 (**37 filas P0 es incorrecto**; son 36 reclamaciones P0 únicas, y 54 enlaces reclamación↔trabajo de severidad P0 — dos números distintos que no se intercambian).
- Programar, asignar dueños o decidir lotes. Todo eso vive ahora en `santa-marta-work-items.csv`.
