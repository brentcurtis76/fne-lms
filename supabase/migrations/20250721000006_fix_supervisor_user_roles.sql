-- Fix user_roles table to support supervisor_de_red role
-- Adds red_id column and updates constraints for network-based supervision

-- Step 1: Add red_id column for network association
ALTER TABLE public.user_roles
ADD COLUMN red_id UUID;

-- Step 2: Add foreign key constraint to link to networks table
ALTER TABLE public.user_roles
ADD CONSTRAINT fk_user_roles_red_id
FOREIGN KEY (red_id) REFERENCES public.redes_de_colegios(id);

-- Step 3: Drop the old check constraint that prevents supervisor role assignment
ALTER TABLE public.user_roles
DROP CONSTRAINT check_role_organizational_scope;

-- Step 4: Add new comprehensive check constraint
-- This allows supervisor_de_red to be linked only to a network (red_id)
-- while ensuring other roles maintain their existing scope rules
ALTER TABLE public.user_roles
ADD CONSTRAINT check_role_organizational_scope
CHECK (
  (
    role_type = 'supervisor_de_red' AND
    red_id IS NOT NULL AND
    school_id IS NULL AND
    generation_id IS NULL AND
    community_id IS NULL
  ) OR (
    role_type <> 'supervisor_de_red' AND
    red_id IS NULL AND
    (
      school_id IS NOT NULL OR
      generation_id IS NOT NULL OR
      community_id IS NOT NULL
    )
  )
);

-- Step 5: Add index on red_id for performance
CREATE INDEX IF NOT EXISTS idx_user_roles_red_id ON user_roles(red_id);

-- Step 6: Add comment for documentation
COMMENT ON COLUMN public.user_roles.red_id IS 'Network ID for supervisor_de_red role - links supervisors to their assigned network of schools';