-- Quick fix: Update has_generations flag for schools with no generations
-- Run this to fix the immediate issue

-- Update all schools that have has_generations=true but no actual generations to has_generations=false
UPDATE schools
SET has_generations = false
WHERE has_generations = true
AND id NOT IN (
  SELECT DISTINCT school_id 
  FROM generations 
  WHERE school_id IS NOT NULL
);

-- Show what was updated
SELECT 
  id,
  name,
  has_generations,
  'Updated to false - no generations exist' as status
FROM schools
WHERE name IN (
  'Colegio Metodista de Santiago',
  'Colegio Metodista William Taylor', 
  'Institución Sweet',
  'Liceo Juana Ross de Edwards',
  'Liceo Nacional de Llolleo',
  'Santa Marta de Coquimbo',
  'Santa Marta de Osorno',
  'Santa Marta de Valdivia',
  'Santa Marta de Vallenar',
  'Santa Marta Quinta de Tilcoco'
)
ORDER BY name;