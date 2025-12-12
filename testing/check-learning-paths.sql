-- ============================================
-- VERIFICACIÓN: ¿Existen rutas de aprendizaje en la base de datos?
-- ============================================

-- Query 1: Total de rutas de aprendizaje disponibles
SELECT
    'Total Rutas de Aprendizaje' as descripcion,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) = 0 THEN '✗ ERROR: No hay rutas disponibles'
        WHEN COUNT(*) < 3 THEN '⚠ ADVERTENCIA: Pocas rutas (' || COUNT(*) || ')'
        ELSE '✓ OK: ' || COUNT(*) || ' rutas disponibles'
    END as estado
FROM learning_paths;

-- Query 2: Detalle de rutas existentes
SELECT
    id,
    name as nombre,
    description as descripcion,
    is_active as activa,
    created_at,
    (SELECT COUNT(*) FROM learning_path_items WHERE path_id = learning_paths.id) as total_items
FROM learning_paths
ORDER BY created_at DESC;

-- Query 3: Estado de asignaciones actuales
SELECT
    'Asignaciones Actuales' as descripcion,
    COUNT(*) as cantidad,
    CASE
        WHEN COUNT(*) = 0 THEN '✗ Sin asignaciones'
        ELSE '✓ ' || COUNT(*) || ' asignaciones'
    END as estado
FROM learning_path_assignments lpa
JOIN profiles p ON p.id = lpa.user_id
WHERE p.email LIKE 'docente.test%@fne-lms.test';

-- Query 4: Detalle de asignaciones por usuario
SELECT
    p.email,
    COUNT(lpa.path_id) as rutas_asignadas,
    STRING_AGG(lp.name, ', ' ORDER BY lp.name) as nombres_rutas
FROM profiles p
LEFT JOIN learning_path_assignments lpa ON lpa.user_id = p.id
LEFT JOIN learning_paths lp ON lp.id = lpa.path_id
WHERE p.email LIKE 'docente.test%@fne-lms.test'
GROUP BY p.id, p.email
ORDER BY p.email;
