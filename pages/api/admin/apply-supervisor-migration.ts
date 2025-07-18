import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Step 1: Create redes_de_colegios table
    const { error: redesError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS redes_de_colegios (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL UNIQUE,
          description TEXT,
          created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
          last_updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    }).catch(() => ({ error: null })); // Ignore if exists

    // Step 2: Create red_escuelas table
    const { error: redEscuelasError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS red_escuelas (
          red_id UUID REFERENCES redes_de_colegios(id) ON DELETE CASCADE,
          school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
          assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
          assigned_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (red_id, school_id)
        );
      `
    }).catch(() => ({ error: null })); // Ignore if exists

    // Step 3: Update user_role_type enum
    const { error: enumError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum 
            WHERE enumlabel = 'supervisor_de_red' 
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_type')
          ) THEN
            ALTER TYPE user_role_type ADD VALUE 'supervisor_de_red';
          END IF;
        END
        $$;
      `
    }).catch(() => ({ error: null })); // Ignore if exists

    // Step 4: Add red_id column to user_roles
    const { error: columnError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'user_roles' AND column_name = 'red_id'
          ) THEN
            ALTER TABLE user_roles 
            ADD COLUMN red_id UUID REFERENCES redes_de_colegios(id) ON DELETE SET NULL;
          END IF;
        END
        $$;
      `
    }).catch(() => ({ error: null })); // Ignore if exists

    // Step 5: Enable RLS
    await supabaseAdmin.rpc('exec_sql', {
      sql: `
        ALTER TABLE redes_de_colegios ENABLE ROW LEVEL SECURITY;
        ALTER TABLE red_escuelas ENABLE ROW LEVEL SECURITY;
      `
    }).catch(() => ({ error: null }));

    // Step 6: Create RLS policies
    await supabaseAdmin.rpc('exec_sql', {
      sql: `
        CREATE POLICY IF NOT EXISTS "networks_admin_all_access" ON redes_de_colegios
          FOR ALL USING (
            EXISTS (
              SELECT 1 FROM user_roles ur 
              WHERE ur.user_id = auth.uid() 
              AND ur.role_type = 'admin' 
              AND ur.is_active = true
            )
          );
      `
    }).catch(() => ({ error: null }));

    return res.status(200).json({ 
      success: true, 
      message: 'Migration applied successfully' 
    });

  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ 
      error: 'Migration failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}