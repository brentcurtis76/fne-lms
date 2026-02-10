#!/usr/bin/env python3
"""
Generate SQL migration to update qa_scenarios steps from seed files.
Produces UPDATE statements matching on name + role_required.
"""

import re
from pathlib import Path

def extract_scenarios(filepath):
    """Extract scenario name, role, and steps JSON from a seed SQL file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    scenarios = []

    # Strategy: find each value tuple by matching the opening ( after a comment
    # and extracting the role, name, and steps fields

    # Split content into individual scenario blocks
    # Each block starts with a comment like "-- PB-1:" followed by "("
    blocks = re.split(r'\n--\s+(?:PB|CA|SV|SNV|CRUD|RG|GS|EC|SS|CMS|RLS|NS|CS)\s*-\s*\d+', content)

    for block in blocks:
        # Find the value tuple: starts with ( on its own line
        # Extract role (first quoted string), name (second quoted string)
        # and steps (the JSON array before the last ::jsonb)

        # Find role
        role_match = re.search(r"^\s*\(\s*\n\s*'([^']+)',", block, re.MULTILINE)
        if not role_match:
            continue
        role = role_match.group(1)

        # Find name (second quoted field)
        name_match = re.search(r"^\s*\(\s*\n\s*'[^']+',\s*\n\s*'([^']+)',", block, re.MULTILINE)
        if not name_match:
            continue
        name = name_match.group(1)

        # Find steps JSON - it's the content between the SECOND '::jsonb pattern
        # Strategy: find all '...'::jsonb patterns. The last one before the numeric fields is steps.
        # Actually: preconditions is the 5th field, steps is the 6th field
        # Both end with '::jsonb

        # Find all jsonb blocks
        jsonb_pattern = re.compile(r"'(\[[\s\S]*?\])'::jsonb", re.MULTILINE)
        jsonb_matches = list(jsonb_pattern.finditer(block))

        if len(jsonb_matches) >= 2:
            # First is preconditions, second is steps
            steps_json = jsonb_matches[1].group(1)
            # Normalize whitespace in multi-line JSON
            steps_json = re.sub(r'\n\s*', '', steps_json)
            scenarios.append({
                'role': role,
                'name': name,
                'steps': steps_json
            })

    return scenarios

def escape_sql_string(s):
    """Escape single quotes for SQL."""
    return s.replace("'", "''")

def generate_update(scenario):
    """Generate an UPDATE statement for a scenario."""
    name = escape_sql_string(scenario['name'])
    role = escape_sql_string(scenario['role'])
    steps = escape_sql_string(scenario['steps'])

    return f"UPDATE qa_scenarios SET steps = '{steps}'::jsonb WHERE name = '{name}' AND role_required = '{role}';"

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
            scenarios = extract_scenarios(filepath)
            print(f"{filename}: {len(scenarios)} scenarios extracted")
            all_scenarios.extend(scenarios)
        else:
            print(f"WARNING: {filename} not found!")

    print(f"\nTotal scenarios from seed files: {len(all_scenarios)}")

    # Generate migration SQL
    migration_lines = []
    migration_lines.append("-- Migration: Rewrite QA scenario steps to tester-friendly Spanish")
    migration_lines.append("-- Date: 2026-02-10")
    migration_lines.append("-- Description: Remove developer jargon (API endpoints, HTTP verbs, status codes)")
    migration_lines.append("--              from instruction and expectedOutcome fields in steps JSON.")
    migration_lines.append("--              Covers all 8 roles including docente.")
    migration_lines.append("-- Affects: qa_scenarios.steps column ONLY")
    migration_lines.append("")
    migration_lines.append("BEGIN;")
    migration_lines.append("")

    # Group by role
    roles = {}
    for s in all_scenarios:
        roles.setdefault(s['role'], []).append(s)

    for role in sorted(roles.keys()):
        scenarios = roles[role]
        migration_lines.append(f"-- === {role.upper()} ({len(scenarios)} scenarios) ===")
        migration_lines.append("")
        for s in scenarios:
            migration_lines.append(generate_update(s))
        migration_lines.append("")

    # Write migration file
    migration_path = Path('/Users/brentcurtis76/Documents/fne-lms-working/supabase/migrations/20260210_rewrite_qa_steps_tester_friendly.sql')
    with open(migration_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(migration_lines))

    print(f"\nMigration written to: {migration_path}")
    print(f"Total UPDATE statements: {len(all_scenarios)}")

    # Print role counts
    for role in sorted(roles.keys()):
        print(f"  {role}: {len(roles[role])} updates")

if __name__ == '__main__':
    main()
