-- Fix supervisor role constraint to allow admin users without organizational scope
-- The previous constraint was too restrictive for admin users

-- Drop the overly restrictive constraint
ALTER TABLE public.user_roles
DROP CONSTRAINT check_role_organizational_scope;

-- Add corrected constraint that allows:
-- 1. supervisor_de_red with red_id (network scope)
-- 2. admin with no scope (global access)  
-- 3. other roles with proper organizational scope
ALTER TABLE public.user_roles
ADD CONSTRAINT check_role_organizational_scope
CHECK (
  (
    -- Supervisor de red must have network scope only
    role_type = 'supervisor_de_red' AND
    red_id IS NOT NULL AND
    school_id IS NULL AND
    generation_id IS NULL AND
    community_id IS NULL
  ) OR (
    -- Admin can have no scope (global access)
    role_type = 'admin' AND
    red_id IS NULL AND
    school_id IS NULL AND
    generation_id IS NULL AND
    community_id IS NULL
  ) OR (
    -- All other roles need organizational scope but no red_id
    role_type NOT IN ('supervisor_de_red', 'admin') AND
    red_id IS NULL AND
    (
      school_id IS NOT NULL OR
      generation_id IS NOT NULL OR
      community_id IS NOT NULL
    )
  )
);