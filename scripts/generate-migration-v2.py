#!/usr/bin/env python3
"""
Generate SQL migration to update qa_scenarios steps from seed files.
Uses a state-machine parser to handle both single-line and multi-line JSON.
"""

import re
import json
from pathlib import Path


def parse_seed_file(filepath):
    """Parse a seed SQL file and extract role, name, and steps for each scenario."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    scenarios = []

    # Strategy: Find each INSERT tuple by looking for the pattern of fields.
    # Each tuple starts with ('role', and ends with false/true )
    # We need to find the role, name, and steps fields.

    # Split by the tuple delimiter: ),\n\n-- or );\n\n or just the closing );
    # Better: use a state machine to find balanced parens

    # Alternative approach: find all strings between '...'::jsonb that are the steps field
    # The steps field is always the 6th column in the INSERT.

    # Simplest reliable approach: find each scenario block by splitting on the
    # comment markers and then extracting fields from each block.

    # Step 1: Find all occurrences of role + name + steps using field positions
    # The INSERT has these columns: role_required, name, description, feature_area, preconditions, steps

    # Find each value tuple. Tuples are separated by ),\n or );\n
    # Each tuple starts with: \n(\n  'role',

    # Let's find each tuple by matching the opening ( with the role field
    tuple_starts = []
    i = 0
    while i < len(content):
        # Find next tuple start: ( followed by newline and 'role_value'
        match = re.search(r"\(\s*\n\s*'(community_manager|admin|consultor|equipo_directivo|lider_comunidad|lider_generacion|supervisor_de_red|docente)'", content[i:])
        if not match:
            break
        tuple_starts.append(i + match.start())
        i = i + match.end()

    for idx, start in enumerate(tuple_starts):
        # Find the end of this tuple: ), or );
        end = len(content)
        if idx + 1 < len(tuple_starts):
            end = tuple_starts[idx + 1]

        block = content[start:end]

        # Extract role
        role_match = re.search(r"'(community_manager|admin|consultor|equipo_directivo|lider_comunidad|lider_generacion|supervisor_de_red|docente)'", block)
        if not role_match:
            continue
        role = role_match.group(1)

        # Extract name - second quoted field after role
        # Skip past role field
        after_role = block[role_match.end():]
        name_match = re.search(r",\s*\n\s*'([^']+)'", after_role)
        if not name_match:
            continue
        name = name_match.group(1)

        # Extract steps - find the JSON arrays (preconditions and steps)
        # They can end with either '::jsonb, or just ',
        # Strategy: find all '[...]' patterns that are SQL string values
        json_array_pattern = re.compile(r"'(\[[\s\S]*?\])'(?:::jsonb)?", re.MULTILINE)
        json_matches = list(json_array_pattern.finditer(block))

        if len(json_matches) < 2:
            continue

        # First match is preconditions, second is steps
        steps_json = json_matches[1].group(1)
        # Normalize: remove newlines and excess whitespace
        steps_json = re.sub(r'\n\s*', '', steps_json)
        # Also normalize multiple spaces
        steps_json = re.sub(r'  +', ' ', steps_json)

        scenarios.append({
            'role': role,
            'name': name,
            'steps': steps_json
        })

    return scenarios


def escape_sql(s):
    """Escape single quotes for SQL string literals."""
    return s.replace("'", "''")


def main():
    base_path = Path('/Users/brentcurtis76/Documents/fne-lms-working/docs/qa-system')
    seed_files = [
        'seed-admin-scenarios.sql',
        'seed-community_manager-scenarios.sql',
        'seed-consultor-scenarios.sql',
        'seed-equipo_directivo-scenarios.sql',
        'seed-lider_comunidad-scenarios.sql',
        'seed-lider_generacion-scenarios.sql',
        'seed-supervisor_de_red-scenarios.sql',
    ]

    all_scenarios = []
    for filename in seed_files:
        filepath = base_path / filename
        if filepath.exists():
            scenarios = parse_seed_file(filepath)
            print(f"{filename}: {len(scenarios)} scenarios extracted")
            all_scenarios.extend(scenarios)
        else:
            print(f"WARNING: {filename} not found!")

    print(f"\nTotal scenarios from seed files: {len(all_scenarios)}")

    # Generate migration SQL
    lines = []
    lines.append("-- ============================================================================")
    lines.append("-- Migration: Rewrite QA scenario steps to tester-friendly Spanish")
    lines.append("-- ============================================================================")
    lines.append("-- Date: 2026-02-10")
    lines.append("-- Description: Remove developer jargon (API endpoints, HTTP verbs, status codes)")
    lines.append("--              from instruction and expectedOutcome fields in steps JSON.")
    lines.append("--              Covers all 8 roles including docente (which has no seed file).")
    lines.append("-- Affects: qa_scenarios.steps column ONLY")
    lines.append("-- ============================================================================")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    # Group by role
    roles = {}
    for s in all_scenarios:
        roles.setdefault(s['role'], []).append(s)

    for role in sorted(roles.keys()):
        scenarios = roles[role]
        lines.append(f"-- === {role.upper()} ({len(scenarios)} scenarios) ===")
        lines.append("")
        for s in scenarios:
            name_esc = escape_sql(s['name'])
            role_esc = escape_sql(s['role'])
            steps_esc = escape_sql(s['steps'])
            lines.append(f"UPDATE qa_scenarios SET steps = '{steps_esc}'::jsonb WHERE name = '{name_esc}' AND role_required = '{role_esc}';")
        lines.append("")

    # Add docente scenarios (6 that need rewriting)
    lines.append("-- === DOCENTE (6 scenarios needing rewrite — no seed file) ===")
    lines.append("")

    docente_updates = [
        {
            'name': 'PB-02: Docente intenta crear un usuario',
            'steps': '[{"index":1,"route":"/admin/user-management","instruction":"Intentar acceder a la página de Gestión de Usuarios","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"Se muestra un mensaje de acceso denegado o se redirige al Panel Principal"},{"index":2,"instruction":"Verificar que \\"Usuarios\\" no aparece en el sidebar","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"\\"Usuarios\\" NO es visible en la barra lateral"}]'
        },
        {
            'name': 'PB-03: Docente intenta editar perfil de otro usuario',
            'steps': '[{"index":1,"instruction":"Verificar que no existe un formulario de edición de perfil de otros usuarios accesible desde la interfaz","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"No hay opción visible para editar perfiles de otros usuarios"},{"index":2,"instruction":"Verificar que el sistema no permite modificar datos de otros usuarios","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"Aparece un mensaje de error indicando que no tiene permisos"}]'
        },
        {
            'name': 'PB-05: Docente intenta gestionar escuelas',
            'steps': '[{"index":1,"route":"/admin/schools","instruction":"Intentar acceder a la página de Escuelas","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"Se muestra un mensaje de acceso denegado o se redirige al Panel Principal"},{"index":2,"instruction":"Verificar que \\"Escuelas\\" no aparece en el sidebar","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"\\"Escuelas\\" NO es visible en la barra lateral"}]'
        },
        {
            'name': 'PB-06: Docente intenta gestionar redes de colegios',
            'steps': '[{"index":1,"route":"/admin/network-management","instruction":"Intentar acceder a la página de Gestión de Redes","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"Se muestra un mensaje de acceso denegado o se redirige al Panel Principal"},{"index":2,"instruction":"Verificar que \\"Redes de Colegios\\" no aparece en el sidebar","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"\\"Redes de Colegios\\" NO es visible en la barra lateral"}]'
        },
        {
            'name': 'PB-11: Docente intenta asignar cursos a otros',
            'steps': '[{"index":1,"instruction":"Verificar que no hay botón de \\"Asignar curso\\" en la vista de cursos","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"Ningún botón de asignación visible"},{"index":2,"instruction":"Verificar que el sistema no permite asignar cursos a otros usuarios","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"El sistema muestra un mensaje de error de permisos o no ofrece la funcionalidad"}]'
        },
        {
            'name': 'EC-06: Docente accede a endpoints API directamente (bypass sidebar)',
            'steps': '[{"index":1,"instruction":"Intentar acceder directamente a páginas de administración escribiendo la URL en el navegador","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"El sistema redirige al Panel Principal o muestra un mensaje de acceso denegado"},{"index":2,"instruction":"Intentar acceder a la página de Escuelas escribiendo la URL directamente","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"El sistema redirige al Panel Principal o muestra un mensaje de acceso denegado"},{"index":3,"instruction":"Verificar que ninguna página de administración es accesible directamente","captureOnFail":true,"captureOnPass":false,"expectedOutcome":"Todas las páginas restringidas muestran mensaje de acceso denegado o redirigen"}]'
        },
    ]

    for d in docente_updates:
        name_esc = escape_sql(d['name'])
        steps_esc = escape_sql(d['steps'])
        lines.append(f"UPDATE qa_scenarios SET steps = '{steps_esc}'::jsonb WHERE name = '{name_esc}' AND role_required = 'docente';")

    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    # Write migration file
    migration_path = Path('/Users/brentcurtis76/Documents/fne-lms-working/supabase/migrations/20260210_rewrite_qa_steps_tester_friendly.sql')
    with open(migration_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f"\nMigration written to: {migration_path}")
    total = len(all_scenarios) + len(docente_updates)
    print(f"Total UPDATE statements: {total}")
    print(f"  (from seed files: {len(all_scenarios)})")
    print(f"  (docente manual: {len(docente_updates)})")


if __name__ == '__main__':
    main()
