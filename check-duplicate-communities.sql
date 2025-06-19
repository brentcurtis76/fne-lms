-- Check for duplicate communities
SELECT 
  gc.name,
  gc.school_id,
  gc.generation_id,
  COUNT(*) as duplicate_count,
  STRING_AGG(gc.id::text, ', ') as community_ids,
  STRING_AGG(gc.created_at::text, ', ') as created_dates
FROM growth_communities gc
GROUP BY gc.name, gc.school_id, gc.generation_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, gc.name;

-- Check all communities for a specific pattern (community leader names)
SELECT 
  id,
  name,
  school_id,
  generation_id,
  created_at
FROM growth_communities
WHERE name LIKE 'Comunidad de %'
ORDER BY created_at DESC
LIMIT 20;

-- Check if there are communities without associated active roles
SELECT 
  gc.id,
  gc.name,
  gc.school_id,
  gc.generation_id,
  gc.created_at,
  COUNT(ur.id) as active_role_count
FROM growth_communities gc
LEFT JOIN user_roles ur ON ur.community_id = gc.id AND ur.is_active = true
GROUP BY gc.id, gc.name, gc.school_id, gc.generation_id, gc.created_at
HAVING COUNT(ur.id) = 0
ORDER BY gc.created_at DESC;
