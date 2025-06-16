-- ====================================================================
-- FIX GROWTH COMMUNITIES FOR SCHOOLS WITHOUT GENERATIONS
-- Updates communities to work properly with schools that don't have generations
-- ====================================================================

-- 1. Show communities that might be affected
SELECT 
  gc.id,
  gc.name as community_name,
  s.name as school_name,
  s.has_generations,
  g.name as generation_name,
  gc.generation_id
FROM growth_communities gc
JOIN schools s ON gc.school_id = s.id
LEFT JOIN generations g ON gc.generation_id = g.id
WHERE s.has_generations = false AND gc.generation_id IS NOT NULL;

-- 2. Update communities for schools without generations to have null generation_id
UPDATE growth_communities gc
SET generation_id = NULL
FROM schools s
WHERE gc.school_id = s.id 
  AND s.has_generations = false 
  AND gc.generation_id IS NOT NULL;

-- 3. Show all communities for Fundación Nueva Educación
SELECT 
  gc.id,
  gc.name as community_name,
  gc.leader_id,
  p.first_name || ' ' || p.last_name as leader_name,
  gc.generation_id
FROM growth_communities gc
JOIN schools s ON gc.school_id = s.id
LEFT JOIN profiles p ON gc.leader_id = p.id
WHERE s.name = 'Fundación Nueva Educación'
ORDER BY gc.name;