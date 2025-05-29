# FNE LMS 6-Role System Migration Instructions

## Manual Database Migration Required

Since the automated migration script requires additional permissions, please follow these steps to apply the 6-role system manually using the Supabase Dashboard:

### Step 1: Access Supabase SQL Editor

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project: `sxlogxqzmarhqsblxmtj`
3. Click on "SQL Editor" in the left sidebar
4. Create a new query

### Step 2: Apply Database Schema

Copy and paste the entire contents of `/database/simple-role-migration.sql` into the SQL Editor and run it.

**Important**: Run this in sections if you encounter any errors:

#### Section 1: Create Types and Tables
```sql
-- 1. Create role types enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_type') THEN
        CREATE TYPE user_role_type AS ENUM (
            'global_admin',        -- FNE staff with full platform control
            'consultant',          -- FNE consultants assigned to specific schools  
            'leadership_team',     -- School-level administrators
            'generation_leader',   -- Leaders of Tractor/Innova generations
            'community_leader',    -- Leaders of Growth Communities (2-16 teachers)
            'teacher'             -- Regular teachers/course participants
        );
    END IF;
END $$;

-- 2. Create organizational structure tables
CREATE TABLE IF NOT EXISTS schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grade_range TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS growth_communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    max_teachers INTEGER DEFAULT 16,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create user_roles table
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_type user_role_type NOT NULL,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
    community_id UUID REFERENCES growth_communities(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reporting_scope JSONB DEFAULT '{}',
    feedback_scope JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Section 2: Update Profiles Table
```sql
-- 4. Add organizational columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES generations(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES growth_communities(id);
```

#### Section 3: Create Helper Functions
```sql
-- 5. Create helper functions
CREATE OR REPLACE FUNCTION is_global_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = user_uuid 
        AND role_type = 'global_admin' 
        AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function for backward compatibility
CREATE OR REPLACE FUNCTION get_user_admin_status(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = user_uuid 
            AND role_type = 'global_admin' 
            AND is_active = TRUE
        ) OR 
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = user_uuid 
            AND role = 'admin'
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Section 4: Insert Default Data
```sql
-- 7. Insert default data
INSERT INTO schools (name, code) VALUES 
    ('Escuela Demo FNE', 'DEMO001') 
ON CONFLICT (code) DO NOTHING;

-- 8. Insert default generations
INSERT INTO generations (school_id, name, grade_range)
SELECT 
    s.id,
    'Tractor',
    'PreK-2nd'
FROM schools s 
WHERE s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

INSERT INTO generations (school_id, name, grade_range)
SELECT 
    s.id,
    'Innova', 
    '3rd-12th'
FROM schools s 
WHERE s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

-- 9. Insert default growth communities
INSERT INTO growth_communities (school_id, generation_id, name)
SELECT 
    s.id,
    g.id,
    g.name || ' - Comunidad 1'
FROM schools s
JOIN generations g ON g.school_id = s.id
WHERE s.code = 'DEMO001'
ON CONFLICT DO NOTHING;
```

#### Section 5: Migrate Existing Users
```sql
-- 10. Migrate existing users
-- Convert admin users to global_admin
INSERT INTO user_roles (user_id, role_type, is_active)
SELECT 
    id,
    'global_admin',
    TRUE
FROM profiles 
WHERE role = 'admin'
ON CONFLICT DO NOTHING;

-- Convert docente users to teacher role
INSERT INTO user_roles (user_id, role_type, school_id, is_active)
SELECT 
    p.id,
    'teacher',
    s.id,
    TRUE
FROM profiles p
CROSS JOIN schools s 
WHERE p.role = 'docente' 
AND s.code = 'DEMO001'
ON CONFLICT DO NOTHING;

-- Update profiles with school reference
UPDATE profiles 
SET school_id = (SELECT id FROM schools WHERE code = 'DEMO001' LIMIT 1)
WHERE school_id IS NULL;
```

#### Section 6: Create Indexes and RLS
```sql
-- 11. Create indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_type ON user_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);

-- 12. Enable RLS on new tables
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- 13. Create basic RLS policies
CREATE POLICY "Global admins manage schools" ON schools
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view their school" ON schools
    FOR SELECT USING (
        id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

CREATE POLICY "Global admins manage generations" ON generations
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admins manage communities" ON growth_communities
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Global admins manage user roles" ON user_roles
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view own roles" ON user_roles
    FOR SELECT USING (user_id = auth.uid());
```

### Step 3: Verify Migration

After running the migration, verify it worked by running these queries:

```sql
-- Check if tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('schools', 'generations', 'growth_communities', 'user_roles');

-- Check if enum was created
SELECT typname FROM pg_type WHERE typname = 'user_role_type';

-- Check if data was migrated
SELECT ur.role_type, COUNT(*) as count
FROM user_roles ur
GROUP BY ur.role_type;

-- Check default organizational data
SELECT s.name as school, g.name as generation, gc.name as community
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
LEFT JOIN growth_communities gc ON gc.generation_id = g.id
WHERE s.code = 'DEMO001';
```

### Step 4: Update Supabase Types

After the database migration is complete, run this command to update TypeScript types:

```bash
npx supabase gen types typescript --project-id sxlogxqzmarhqsblxmtj > types/supabase-updated.ts
```

### Expected Results

After successful migration:

1. **New tables created**: `schools`, `generations`, `growth_communities`, `user_roles`
2. **Enum created**: `user_role_type` with 6 role values
3. **Functions created**: `is_global_admin()`, `get_user_admin_status()`
4. **Default data**: Demo school with Tractor/Innova generations
5. **User migration**: Existing admin → global_admin, docente → teacher
6. **Backward compatibility**: All existing functionality continues to work

### Troubleshooting

If you encounter errors:

1. **Permission errors**: Make sure you're running as the project owner in Supabase Dashboard
2. **Constraint errors**: Check if tables already exist and skip CREATE statements
3. **Type errors**: The enum might already exist, skip the enum creation
4. **Data conflicts**: Existing data might conflict, check for duplicates

### Post-Migration Testing

After migration, test these features:

1. Login with existing accounts (should work unchanged)
2. Admin access (should work for global_admin users)
3. Course assignment (should work for global_admin only)
4. User management (should work for global_admin only)
5. Student course access (should work unchanged)

## Migration Complete ✅

Once all sections are successfully executed, the 6-role system will be active while maintaining full backward compatibility with existing functionality.