# SQL to Run in Supabase

Run this SQL in your Supabase SQL Editor to enable the Schools-Clients integration:

```sql
-- ====================================================================
-- INTEGRATE SCHOOLS WITH CLIENTS SYSTEM (MINIMAL VERSION)
-- Links schools (educational view) with clients (business view)
-- ====================================================================

-- 1. Add school reference to clients table (using INTEGER type)
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_clientes_school_id ON clientes(school_id);

-- 2. Add client reference to schools table (reverse link for easy access)
ALTER TABLE schools 
ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_schools_cliente_id ON schools(cliente_id);

-- 3. RLS policy for viewing clients linked to schools
CREATE POLICY "Users can view clients for their school" ON clientes
  FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

## What This Does

1. Adds `school_id` column to `clientes` table (INTEGER type to match schools.id)
2. Adds `cliente_id` column to `schools` table (UUID type to match clientes.id)
3. Creates indexes for performance
4. Adds RLS policy so users can see clients for their schools

## After Running This SQL

The linking functionality should work correctly. You'll be able to:
- Link clients to schools from the Schools page
- Create schools from the Contracts page
- See which schools have linked clients
- Create contracts directly from schools with pre-filled client data