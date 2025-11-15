-- Update assignment instructions to remove outdated "espacio colaborativo" references
-- This updates all group-assignment blocks with clearer, context-appropriate instructions
-- New text assumes user is already viewing this from Mi Aprendizaje → Mis Tareas

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
  AND payload->>'instructions' LIKE '%espacio colaborativo%';

-- Verify the update
SELECT
  id,
  payload->>'title' as title,
  payload->>'instructions' as instructions
FROM blocks
WHERE type = 'group-assignment'
  AND payload->>'instructions' IS NOT NULL
LIMIT 10;

-- Count remaining references (should be 0)
SELECT COUNT(*) as remaining_references
FROM blocks
WHERE type = 'group-assignment'
  AND payload->>'instructions' LIKE '%espacio colaborativo%';
