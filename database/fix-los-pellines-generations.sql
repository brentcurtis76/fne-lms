-- Fix Los Pellines to not use generations since it has communities without generations
UPDATE schools 
SET has_generations = false 
WHERE name = 'Los Pellines';

-- Verify the change
SELECT id, name, has_generations 
FROM schools 
WHERE name = 'Los Pellines';

-- Show communities for Los Pellines after the change
SELECT gc.id, gc.name, gc.school_id, gc.generation_id, s.name as school_name
FROM growth_communities gc
JOIN schools s ON gc.school_id = s.id
WHERE s.name = 'Los Pellines';