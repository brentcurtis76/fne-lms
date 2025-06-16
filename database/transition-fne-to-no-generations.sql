-- ====================================================================
-- TRANSITION FUNDACIÓN NUEVA EDUCACIÓN TO NO-GENERATIONS
-- Step-by-step process to convert FNE to operate without generations
-- ====================================================================

-- STEP 1: Find the Fundación Nueva Educación school ID
-- Run this query first to see the school information:
SELECT id, name, has_generations, code 
FROM schools 
WHERE name ILIKE '%fundación nueva educación%'
   OR name ILIKE '%fne%'
   OR name ILIKE '%nueva educación%';

-- Copy the ID from the result above, then use it in the next steps

-- STEP 2: Check what will be affected before making changes
-- Replace 'YOUR-SCHOOL-ID-HERE' with the actual ID from step 1
/*
SELECT 
  'Users in generations' as type,
  COUNT(*) as count
FROM profiles 
WHERE school_id = 'YOUR-SCHOOL-ID-HERE' 
  AND generation_id IS NOT NULL

UNION ALL

SELECT 
  'Growth communities' as type,
  COUNT(*) as count
FROM growth_communities 
WHERE school_id = 'YOUR-SCHOOL-ID-HERE'

UNION ALL

SELECT 
  'Generations' as type,
  COUNT(*) as count
FROM generations 
WHERE school_id = 'YOUR-SCHOOL-ID-HERE';
*/

-- STEP 3: Transition the school (replace the ID)
-- This will safely convert the school to not use generations
/*
SELECT * FROM transition_school_to_no_generations('YOUR-SCHOOL-ID-HERE');
*/

-- STEP 4: Verify the changes
/*
SELECT 
  s.name as school_name,
  s.has_generations,
  COUNT(DISTINCT gc.id) as communities_count,
  COUNT(DISTINCT p.id) as users_count
FROM schools s
LEFT JOIN growth_communities gc ON gc.school_id = s.id
LEFT JOIN profiles p ON p.school_id = s.id
WHERE s.id = 'YOUR-SCHOOL-ID-HERE'
GROUP BY s.id, s.name, s.has_generations;
*/

-- ====================================================================
-- ALTERNATIVE: If the function doesn't exist yet, do it manually:
-- ====================================================================

-- Manual Step 1: Update the school to not have generations
/*
UPDATE schools 
SET has_generations = false 
WHERE id = 'YOUR-SCHOOL-ID-HERE';
*/

-- Manual Step 2: Remove generation references from communities
/*
UPDATE growth_communities 
SET generation_id = NULL 
WHERE school_id = 'YOUR-SCHOOL-ID-HERE';
*/

-- Manual Step 3: Remove generation references from user profiles
/*
UPDATE profiles 
SET generation_id = NULL 
WHERE school_id = 'YOUR-SCHOOL-ID-HERE';
*/