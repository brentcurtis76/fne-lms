# Generation Dependencies Analysis

## Overview
This document analyzes how the FNE LMS system handles organizations without generations and the implications of removing generations from the database.

## Database Schema Analysis

### 1. Schools Table
- Has a `has_generations` boolean column (default: true)
- Schools can opt out of using generations by setting this to false
- No foreign key constraints to generations table

### 2. Generations Table
```sql
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade_range TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
- Linked to schools with ON DELETE CASCADE
- When a school is deleted, its generations are automatically deleted

### 3. Growth Communities Table
```sql
CREATE TABLE IF NOT EXISTS growth_communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  max_teachers INTEGER DEFAULT 16,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```
- **CRITICAL**: Has `generation_id` with ON DELETE CASCADE
- When a generation is deleted, all its growth communities are automatically deleted
- Also has direct `school_id` reference for redundancy

### 4. User Profiles Table
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES generations(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES growth_communities(id);
```
- No ON DELETE behavior specified for generation_id
- Default PostgreSQL behavior: RESTRICT (prevents deletion if referenced)
- This means generations cannot be deleted if users reference them

### 5. User Roles Table
```sql
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_type user_role_type NOT NULL,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  community_id UUID REFERENCES growth_communities(id) ON DELETE CASCADE,
  -- other fields...
);
```
- generation_id has ON DELETE CASCADE
- User roles linked to generations are automatically deleted when generation is deleted

### 6. Consultant Assignments Table
```sql
CREATE TABLE IF NOT EXISTS consultant_assignments (
  -- other fields...
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  community_id UUID REFERENCES growth_communities(id) ON DELETE SET NULL,
  -- other fields...
);
```
- Uses ON DELETE SET NULL for generation_id
- Assignments remain but lose their organizational context

## Impact Analysis

### When a Generation is Deleted:

1. **Growth Communities**: Automatically deleted (CASCADE)
   - This is the most destructive impact
   - All community workspaces are lost
   - All community-related data is removed

2. **User Profiles**: Deletion blocked (RESTRICT - default)
   - Cannot delete generation if any user profile references it
   - Must first update all user profiles to remove generation_id

3. **User Roles**: Automatically deleted (CASCADE)
   - All role assignments tied to that generation are removed
   - Users lose their generation-specific permissions

4. **Consultant Assignments**: Set to NULL
   - Assignments persist but lose generation context
   - May cause confusion in reporting

5. **Community Workspaces**: Automatically deleted (CASCADE)
   - Since they reference growth_communities
   - All collaborative workspace data is lost

## Handling Schools Without Generations

### Current System Support:

1. **UI Support**:
   - Schools page checks `has_generations` flag
   - Hides generation-related UI elements when false
   - Shows "Sin generaciones" badge

2. **Data Model Support**:
   - Many foreign keys are nullable
   - System can function with null generation_id values
   - Direct school_id relationships provide fallback

### Limitations:

1. **Growth Communities Require Generations**:
   - Cannot create communities without generations
   - This is a hard constraint in the schema

2. **Role System Assumptions**:
   - Some roles (generation_leader) become meaningless
   - UI may still show generation-related options

3. **Reporting Complexity**:
   - Reports may assume generation hierarchy exists
   - Null handling required throughout

## Recommendations

### 1. Schema Changes Needed:
```sql
-- Make growth_communities.generation_id nullable
ALTER TABLE growth_communities 
ALTER COLUMN generation_id DROP NOT NULL;

-- Add ON DELETE behavior to profiles
ALTER TABLE profiles
DROP CONSTRAINT IF EXISTS profiles_generation_id_fkey,
ADD CONSTRAINT profiles_generation_id_fkey 
  FOREIGN KEY (generation_id) 
  REFERENCES generations(id) 
  ON DELETE SET NULL;
```

### 2. Code Changes Needed:
- Update queries to handle null generation_id
- Modify UI to support generation-less communities
- Add validation to prevent invalid role assignments
- Update reports to handle missing generation data

### 3. Migration Strategy:
1. Update foreign key constraints
2. Create migration script to safely remove generations:
   - Update user profiles to remove generation_id
   - Update or delete user roles
   - Handle growth communities (convert or delete)
   - Clean up consultant assignments

### 4. Alternative Approach:
Instead of deleting generations, consider:
- Soft delete with `is_active` flag
- Archive old generations
- Keep minimal generation structure for schools that don't use them

## Conclusion

The current system is not fully prepared for organizations without generations due to:
1. Destructive CASCADE deletions of communities
2. RESTRICT behavior on user profiles
3. Hard requirement for generation_id in growth_communities

Proper handling requires both schema changes and application logic updates to gracefully handle the absence of generations while preserving data integrity.