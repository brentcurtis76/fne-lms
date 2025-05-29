# Manual Migration: Spanish Role System for FNE LMS

## ⚠️ CRITICAL: Apply this migration manually using Supabase Dashboard

Since automated scripts require additional permissions, please apply this migration manually:

### Step 1: Access Supabase SQL Editor

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to your project: `sxlogxqzmarhqsblxmtj`
3. Click "SQL Editor" in left sidebar
4. Create new query

### Step 2: Apply Migration Sections

Copy and run each section below **one at a time** in the SQL Editor:

#### Section 1: Create Enum and Core Tables
```sql
-- Create Spanish role enum (consistent with existing docente naming)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_type') THEN
        CREATE TYPE user_role_type AS ENUM (
            'admin',              -- FNE staff with full platform control 
            'consultor',          -- FNE consultants assigned to specific schools  
            'equipo_directivo',   -- School-level administrators
            'lider_generacion',   -- Leaders of Tractor/Innova generations
            'lider_comunidad',    -- Leaders of Growth Communities (2-16 teachers)
            'docente'             -- Regular teachers (keeps existing naming)
        );
    END IF;
END $$;

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
```

#### Section 2: Create User Roles Table
```sql
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role_type user_role_type NOT NULL,
    school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
    generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
    community_id UUID REFERENCES growth_communities(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES profiles(id),
    reporting_scope JSONB DEFAULT '{}',
    feedback_scope JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add organizational columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES generations(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES growth_communities(id);
```

#### Section 3: Create Helper Functions
```sql
-- Function to check global admin status (Spanish role names)
CREATE OR REPLACE FUNCTION is_global_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = user_uuid 
        AND role_type = 'admin' 
        AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backward compatibility function
CREATE OR REPLACE FUNCTION get_user_admin_status(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = user_uuid 
            AND role_type = 'admin' 
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
-- Insert demo school
INSERT INTO schools (name, code) VALUES 
    ('Escuela Demo FNE', 'DEMO001') 
ON CONFLICT (code) DO NOTHING;

-- Insert generations
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

-- Insert default communities
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
-- Migrate admin users to 'admin' role (global admin powers)
INSERT INTO user_roles (user_id, role_type, is_active)
SELECT 
    id,
    'admin',
    TRUE
FROM profiles 
WHERE role = 'admin'
ON CONFLICT DO NOTHING;

-- Migrate docente users to 'docente' role (keeps naming consistency)
INSERT INTO user_roles (user_id, role_type, school_id, is_active)
SELECT 
    p.id,
    'docente',
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

#### Section 6: Create Indexes and Enable RLS
```sql
-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_type ON user_roles(role_type);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_user_roles_school ON user_roles(school_id);

-- Enable Row Level Security
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
```

#### Section 7: Create RLS Policies
```sql
-- RLS Policies for secure data access
CREATE POLICY "Admins manage schools" ON schools
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view their school" ON schools
    FOR SELECT USING (
        id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

CREATE POLICY "Admins manage generations" ON generations
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view generations in their school" ON generations
    FOR SELECT USING (
        school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

CREATE POLICY "Admins manage communities" ON growth_communities
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view communities in their scope" ON growth_communities
    FOR SELECT USING (
        school_id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
    );

CREATE POLICY "Admins manage user roles" ON user_roles
    FOR ALL USING (is_global_admin(auth.uid()));

CREATE POLICY "Users view own roles" ON user_roles
    FOR SELECT USING (user_id = auth.uid());
```

### Step 3: Verify Migration

Run this verification query to ensure everything worked:

```sql
-- Check tables were created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('schools', 'generations', 'growth_communities', 'user_roles');

-- Check enum was created
SELECT typname FROM pg_type WHERE typname = 'user_role_type';

-- Check role migration
SELECT role_type, COUNT(*) as count
FROM user_roles
WHERE is_active = TRUE
GROUP BY role_type;

-- Check default data
SELECT s.name as school, g.name as generation, gc.name as community
FROM schools s
LEFT JOIN generations g ON g.school_id = s.id
LEFT JOIN growth_communities gc ON gc.generation_id = g.id
WHERE s.code = 'DEMO001';
```

### Expected Results After Migration

✅ **6 new role types**: admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, docente
✅ **Existing users migrated**: admin → admin role, docente → docente role  
✅ **Backward compatibility**: All existing functionality continues to work
✅ **Spanish consistency**: Role names match existing 'docente' convention
✅ **Admin restriction**: Only 'admin' role has administrative powers

### Test After Migration

1. **Login with existing accounts** - Should work unchanged
2. **Admin access** - Should work only for users with 'admin' role in user_roles table
3. **Course viewing** - Should work for all users (all roles are students)
4. **User management** - Should show role assignment options for admins

## 🎯 Key Changes Made

1. **Language Consistency**: All role names now in Spanish matching 'docente' convention
2. **Admin Power Restriction**: Only 'admin' role (not 'global_admin') has administrative powers
3. **Database Alignment**: Role names consistent throughout system
4. **Backward Compatibility**: Existing admin/docente users automatically migrated
5. **User Management Ready**: New RoleAssignmentModal component for role management

Ready to apply the migration? Follow the sections above in Supabase Dashboard SQL Editor!