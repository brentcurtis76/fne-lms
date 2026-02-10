#!/usr/bin/env python3
"""
Comprehensive QA scenario step rewriter.
Rewrites all developer jargon to tester-friendly Spanish.
"""

import re
from pathlib import Path
import sys

def rewrite_instruction(text):
    """Rewrite instruction field to remove developer jargon."""

    # Keep URLs for now - will handle specially below
    orig = text

    # Pattern 1: "Enviar POST /api/..." -> "Hacer clic en Guardar"
    text = re.sub(
        r'Enviar POST /api/[^\s"]+',
        'Hacer clic en el botón Guardar',
        text
    )

    # Pattern 2: "Enviar PUT /api/..." -> "Hacer clic en Guardar cambios"
    text = re.sub(
        r'Enviar PUT /api/[^\s"]+',
        'Hacer clic en Guardar cambios',
        text
    )

    # Pattern 3: "Enviar DELETE /api/..." -> "Hacer clic en Eliminar"
    text = re.sub(
        r'Enviar DELETE /api/[^\s"]+',
        'Hacer clic en Eliminar y confirmar',
        text
    )

    # Pattern 4: "Enviar GET /api/..." -> "Verificar que se carga"
    text = re.sub(
        r'Enviar GET /api/[^\s"]+',
        'Verificar que la información se carga correctamente',
        text
    )

    # Pattern 5: "y enviar POST/PUT/DELETE/GET"
    text = re.sub(
        r'\s+y enviar (POST|GET|PUT|DELETE) /api/[^\s"]+',
        ' y hacer clic en el botón Guardar',
        text
    )

    # Pattern 6: "Llamar GET/POST..."
    text = re.sub(
        r'Llamar (GET|POST|PUT|DELETE) /api/[^\s"]+',
        'Verificar que la funcionalidad opera correctamente',
        text
    )

    # Pattern 7: "Intentar POST/GET/PUT/DELETE..."
    text = re.sub(
        r'Intentar (POST|GET|PUT|DELETE) /api/[^\s"]+',
        'Intentar realizar la acción',
        text
    )

    # Pattern 8: "Verificar POST/GET..."
    text = re.sub(
        r'Verificar (POST|GET|PUT|DELETE) /api/[^\s"]+',
        'Verificar que la acción funciona correctamente',
        text
    )

    # Pattern 9: Remove standalone HTTP verbs + endpoints
    text = re.sub(
        r'\b(POST|GET|PUT|DELETE) /api/[^\s"]+',
        'realizar la acción correspondiente',
        text
    )

    # Pattern 10: "Intentar navegar a /admin/..." -> "Intentar acceder a la página de X"
    text = re.sub(
        r'Intentar navegar a /admin/([a-z-]+)(\?[^\s"]+)?',
        lambda m: f'Intentar acceder a la página de {format_page_name(m.group(1))}',
        text
    )

    text = re.sub(
        r'Intentar navegar a /([a-z-]+)(\?[^\s"]+)?',
        lambda m: f'Intentar acceder a la página de {format_page_name(m.group(1))}',
        text
    )

    # Pattern 10b: Clean up URL paths - navegar a /path -> navegar a la página de X
    text = re.sub(
        r'Navegar a /admin/([a-z-]+)(\?[^\s"]+)?',
        lambda m: f'Navegar a la página de {format_page_name(m.group(1))}',
        text
    )

    text = re.sub(
        r'Navegar a /([a-z-]+)(\?[^\s"]+)?',
        lambda m: f'Navegar a la página de {format_page_name(m.group(1))}',
        text
    )

    # Pattern 11: "Verificar API /api/..." -> "Verificar que la funcionalidad opera correctamente"
    text = re.sub(
        r'Verificar API /api/[^\s"]+[^"]*',
        'Verificar que la funcionalidad opera correctamente',
        text
    )

    # Pattern 12: Clean up remaining /api/ references
    text = re.sub(
        r'/api/[a-zA-Z0-9/_?=&.-]+(\[[^\]]+\])?',
        '',
        text
    )

    # Pattern 13: Clean up "(hasXxxPermission...)" references
    text = re.sub(
        r'\s*\(has[A-Z][a-zA-Z]+Permission[^)]*\)',
        '',
        text
    )

    # Clean up double spaces
    text = re.sub(r'\s+', ' ', text).strip()

    return text

def rewrite_expected_outcome(text):
    """Rewrite expectedOutcome field to remove developer jargon."""

    orig = text

    # Pattern 1: "API devuelve 201 Created" -> success message
    text = re.sub(
        r'API devuelve 201 Created(\s*\([^)]+\))?',
        'Aparece un mensaje de éxito y el elemento se muestra en la lista',
        text
    )

    # Pattern 2: "API devuelve 200 OK" -> success
    text = re.sub(
        r'API devuelve 200 OK(\s*\([^)]+\))?(\s+con\s+[^"]+)?',
        lambda m: f'Los datos se muestran correctamente{m.group(2) if m.group(2) else ""}',
        text
    )

    # Pattern 3: "API devuelve 403 Forbidden" -> permission error
    text = re.sub(
        r'API devuelve 403 Forbidden',
        'Aparece un mensaje de error indicando que no tiene permisos para realizar esta acción',
        text
    )

    # Pattern 4: "API devuelve 404" -> not found
    text = re.sub(
        r'API devuelve 404( Not Found)?',
        'Se muestra un mensaje indicando que no se encontró el elemento',
        text
    )

    # Pattern 5: "Respuesta vacía o 403"
    text = re.sub(
        r'Respuesta vacía o 403',
        'El sistema no muestra datos o muestra un mensaje de error de permisos',
        text
    )

    # Pattern 6: Generic "API devuelve X"
    text = re.sub(
        r'API devuelve [0-9]{3}[^\s"]*',
        'La operación se completa correctamente',
        text
    )

    # Pattern 7: "200 OK" standalone
    text = re.sub(
        r'\b200 OK\b',
        'la operación se completa correctamente',
        text
    )

    # Pattern 8: "201 Created" standalone
    text = re.sub(
        r'\b201 Created\b',
        'aparece un mensaje de éxito',
        text
    )

    # Pattern 9: "403 Forbidden" standalone
    text = re.sub(
        r'\b403 Forbidden\b',
        'aparece un mensaje de error de permisos',
        text
    )

    # Pattern 10: "404 Not Found" standalone
    text = re.sub(
        r'\b404( Not Found)?\b',
        'aparece un mensaje de no encontrado',
        text
    )

    # Pattern 11: Clean up any remaining API references
    text = re.sub(
        r'API\s+[a-zA-Z]+',
        'El sistema',
        text
    )

    # Pattern 12: Clean up remaining status codes (3-digit HTTP codes)
    text = re.sub(
        r'\b[2-5][0-9]{2}\b',
        '',
        text
    )

    # Pattern 13: Clean up "(hasXxxPermission...)" references
    text = re.sub(
        r'\s*\(has[A-Z][a-zA-Z]+Permission[^)]*\)',
        '',
        text
    )

    # Pattern 14: Clean up "(admin bypass...)" or similar technical parentheticals
    text = re.sub(
        r'\s*\(admin bypass[^)]*\)',
        '',
        text
    )

    # Pattern 15: Clean up remaining "o error si hay dependencias" type patterns (keep these, they're user-friendly)

    # Clean up double spaces and orphaned particles
    text = re.sub(r'\s+', ' ', text).strip()

    return text

def format_page_name(path):
    """Convert URL path segment to friendly Spanish page name."""
    names = {
        'create-course': 'Creación de Curso',
        'course-builder': 'Constructor de Curso',
        'user-management': 'Gestión de Usuarios',
        'schools': 'Escuelas',
        'network-management': 'Gestión de Redes',
        'assessment-builder': 'Constructor de Evaluaciones',
        'quiz-reviews': 'Revisión de Quizzes',
        'detailed-reports': 'Reportes Detallados',
        'news': 'Noticias',
        'events': 'Eventos',
        'learning-paths': 'Rutas de Aprendizaje',
        'contracts': 'Contratos',
        'workspace': 'Espacio de Trabajo',
        'assignment-overview': 'Vista de Tareas',
        'profile': 'Perfil',
        'mi-aprendizaje': 'Mi Aprendizaje',
        'school': 'Escuela',
        'transversal-context': 'Contexto Transversal',
        'migration-plan': 'Plan de Migración',
        'configuration': 'Configuración',
        'consultant-assignments': 'Asignación de Consultores',
        'qa-scenarios': 'Escenarios QA',
        'qa-test-runs': 'Ejecuciones de Pruebas QA',
        'notification-types': 'Tipos de Notificación',
        'courses': 'Cursos',
        'dashboard': 'Panel Principal',
    }
    return names.get(path, path.replace('-', ' ').title())

def process_file(filepath):
    """Process a single seed SQL file."""
    print(f"\nProcessing {filepath.name}...")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all steps JSON objects
    # Pattern: "instruction":"...", "expectedOutcome":"..."

    def replace_step(match):
        """Replace instruction and expectedOutcome in a step object."""
        full_match = match.group(0)

        # Extract instruction
        instr_match = re.search(r'"instruction":"([^"]+)"', full_match)
        outcome_match = re.search(r'"expectedOutcome":"([^"]+)"', full_match)

        if not instr_match or not outcome_match:
            return full_match

        old_instr = instr_match.group(1)
        old_outcome = outcome_match.group(1)

        new_instr = rewrite_instruction(old_instr)
        new_outcome = rewrite_expected_outcome(old_outcome)

        # Check if anything changed
        if new_instr != old_instr or new_outcome != old_outcome:
            result = full_match
            result = result.replace(f'"instruction":"{old_instr}"', f'"instruction":"{new_instr}"')
            result = result.replace(f'"expectedOutcome":"{old_outcome}"', f'"expectedOutcome":"{new_outcome}"')
            return result

        return full_match

    # Match JSON objects with instruction and expectedOutcome
    pattern = r'\{"index":\d+,"instruction":"[^"]+","expectedOutcome":"[^"]+"\}'

    new_content = re.sub(pattern, replace_step, content)

    # Count changes
    changes = content != new_content

    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

    if changes:
        print(f"  ✓ File rewritten")
    else:
        print(f"  - No changes needed")

    return changes

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

    print("=" * 70)
    print("QA Scenario Step Rewriter - Developer Jargon Removal")
    print("=" * 70)

    files_changed = 0
    for filename in seed_files:
        filepath = base_path / filename
        if filepath.exists():
            if process_file(filepath):
                files_changed += 1
        else:
            print(f"❌ WARNING: {filename} not found!")

    print("\n" + "=" * 70)
    print(f"Summary: {files_changed}/{len(seed_files)} files modified")
    print("=" * 70)

    print("\nNext steps:")
    print("1. Run grep verification to check for remaining jargon")
    print("2. Review changes manually for accuracy")
    print("3. Create migration file")

if __name__ == '__main__':
    main()
