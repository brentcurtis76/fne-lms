# Fix for Schools with Deleted Generations

## The Problem
Your query results show that several schools have `has_generations = true` but have 0 actual generations (because they were deleted). This is causing the "generation_id is required" error even though there are no generations to select.

### Affected Schools:
- Colegio Metodista de Santiago
- Colegio Metodista William Taylor
- Institución Sweet
- Liceo Juana Ross de Edwards
- Liceo Nacional de Llolleo
- Santa Marta de Coquimbo
- Santa Marta de Osorno
- Santa Marta de Valdivia
- Santa Marta de Vallenar
- Santa Marta Quinta de Tilcoco

## The Solution

Run this SQL in your Supabase SQL Editor:

```sql
-- Update all schools that have has_generations=true but no actual generations
UPDATE schools
SET has_generations = false
WHERE has_generations = true
AND id NOT IN (
  SELECT DISTINCT school_id 
  FROM generations 
  WHERE school_id IS NOT NULL
);
```

This will:
1. Find all schools marked as having generations but with 0 actual generations
2. Update their `has_generations` flag to `false`
3. Allow you to assign "Líder de Comunidad" role without the generation requirement

## After Running the Fix

Once you run this SQL:
- The schools will be correctly marked as not having generations
- You can assign "Líder de Comunidad" role without selecting a generation
- The communities will be created directly under the school
- No more "generation_id is required" errors

## Verify the Fix

After running the update, you can verify with:

```sql
SELECT 
  id,
  name,
  has_generations,
  (SELECT COUNT(*) FROM generations WHERE school_id = schools.id) as actual_generations
FROM schools
ORDER BY name;
```

All schools should now have matching `has_generations` flags and actual generation counts.