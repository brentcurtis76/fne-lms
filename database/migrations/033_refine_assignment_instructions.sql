-- Refine assignment instructions to remove redundant navigation step
-- This updates assignments that still tell users to go to "Mi Aprendizaje → Mis Tareas"
-- when they're already viewing this page

-- Update payload->instructions field in JSONB
UPDATE blocks
SET payload = jsonb_set(
  payload,
  '{instructions}',
  to_jsonb('Tarea Colaborativa

1. Descarguen el documento para trabajar en su comunidad de crecimiento
2. Un integrante del grupo entrega la tarea completada
3. Al entregar, seleccionen a los compañeros que participaron
4. La tarea quedará como entregada para todos los seleccionados'::text)
)
WHERE type = 'group-assignment'
  AND payload->>'instructions' LIKE '%Encuentren esta tarea en Mi Aprendizaje%';

-- Verify the update
SELECT
  id,
  payload->>'title' as title,
  payload->>'instructions' as instructions
FROM blocks
WHERE type = 'group-assignment'
  AND payload->>'instructions' IS NOT NULL
LIMIT 10;

-- Count assignments with the old text (should be 0 after this migration)
SELECT COUNT(*) as assignments_with_old_nav_step
FROM blocks
WHERE type = 'group-assignment'
  AND payload->>'instructions' LIKE '%Encuentren esta tarea en Mi Aprendizaje%';
