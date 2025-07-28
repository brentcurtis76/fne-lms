-- Investigation: NULL has_generations Field Bug
-- This demonstrates how NULL values cause the trigger to fail

-- 1. Show current state of all schools
SELECT 'CURRENT SCHOOL STATES' as investigation_step;
SELECT id, name, has_generations, 
  CASE 
    WHEN has_generations IS NULL THEN 'NULL (PROBLEMATIC)'
    WHEN has_generations = true THEN 'TRUE (requires generation_id)'
    WHEN has_generations = false THEN 'FALSE (no generation_id needed)'
  END as status
FROM schools 
ORDER BY id;

-- 2. Create a test school with NULL has_generations to simulate the original bug
INSERT INTO schools (name, has_generations) 
VALUES ('Bug Test School', NULL)
RETURNING id, name, has_generations;

-- 3. Show the trigger function that's causing issues
SELECT 'TRIGGER FUNCTION ANALYSIS' as investigation_step;
\sf check_community_organization

-- 4. Test the problematic NULL condition logic
SELECT 'TESTING NULL LOGIC CONDITIONS' as investigation_step;

-- Simulate the trigger logic with NULL values
SELECT 
  'NULL has_generations evaluation' as test_case,
  NULL::boolean as has_generations_value,
  (NULL::boolean = true) as equals_true_result,
  (NULL::boolean IS NOT DISTINCT FROM true) as proper_null_check,
  CASE 
    WHEN NULL::boolean = true THEN 'Would require generation_id (WRONG)'
    WHEN NULL::boolean IS NOT DISTINCT FROM true THEN 'Would require generation_id'
    ELSE 'Would NOT require generation_id'
  END as trigger_behavior;

-- 5. Show the correct way to handle NULL in the trigger
SELECT 'CORRECT NULL HANDLING' as investigation_step;
SELECT 
  'Fixed logic example' as test_case,
  COALESCE(NULL::boolean, false) as null_treated_as_false,
  (COALESCE(NULL::boolean, false) = true) as proper_evaluation;

-- 6. Clean up the test school
DELETE FROM schools WHERE name = 'Bug Test School';

-- 7. Show production impact - which schools could be affected
SELECT 'PRODUCTION IMPACT SUMMARY' as investigation_step;
SELECT 
  COUNT(*) as total_schools,
  COUNT(CASE WHEN has_generations IS NULL THEN 1 END) as null_schools,
  COUNT(CASE WHEN has_generations = true THEN 1 END) as true_schools,
  COUNT(CASE WHEN has_generations = false THEN 1 END) as false_schools
FROM schools;

-- 8. Show specific schools that had NULL values (if any exist in production)
SELECT 'SCHOOLS WITH POTENTIAL NULL VALUES' as investigation_step;
SELECT id, name, has_generations 
FROM schools 
WHERE has_generations IS NULL 
   OR has_generations IS NOT DISTINCT FROM NULL;

-- 9. Demonstrate the fix - ensure all schools have proper boolean values
SELECT 'RECOMMENDED FIX' as investigation_step;
-- This would be the fix (but not executing to avoid changes):
-- UPDATE schools SET has_generations = false WHERE has_generations IS NULL;

SELECT 'Investigation complete. The bug occurs when:' as summary;
SELECT '1. A school has has_generations = NULL' as point_1;
SELECT '2. User tries to create community for that school' as point_2;
SELECT '3. Trigger evaluates "NULL = true" which returns NULL (not false)' as point_3;
SELECT '4. This causes the constraint check to fail unpredictably' as point_4;
SELECT '5. Solution: Ensure has_generations is never NULL, default to false' as point_5;