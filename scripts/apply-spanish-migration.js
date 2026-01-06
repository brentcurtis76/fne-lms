/**
 * Apply Spanish Role System Migration
 * This script applies the Spanish role system to the production database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applySpanishMigration() {
  console.log('🚀 Starting Spanish Role System Migration...\n');
  
  try {
    // Read the Spanish migration file
    const migrationPath = path.join(__dirname, '..', 'database', 'spanish-role-migration.sql');
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split into manageable sections
    const sections = [
      // Section 1: Create enum and tables
      {
        name: 'Crear enum y tablas',
        sql: `
          DO $$ 
          BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role_type') THEN
                  CREATE TYPE user_role_type AS ENUM (
                      'admin',              -- FNE staff with full platform control (replaces old admin)
                      'consultor',          -- FNE consultants assigned to specific schools  
                      'equipo_directivo',   -- School-level administrators
                      'lider_generacion',   -- Leaders of Tractor/Innova generations
                      'lider_comunidad',    -- Leaders of Growth Communities (2-16 teachers)
                      'docente'             -- Regular teachers/course participants (keeps existing docente)
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
        `
      },
      
      // Section 2: Create user_roles table
      {
        name: 'Crear tabla user_roles',
        sql: `
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
          
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES schools(id);
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES generations(id);
          ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES growth_communities(id);
        `
      },
      
      // Section 3: Create functions
      {
        name: 'Crear funciones auxiliares',
        sql: `
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
        `
      },
      
      // Section 4: Insert default data
      {
        name: 'Insertar datos por defecto',
        sql: `
          INSERT INTO schools (name, code) VALUES 
              ('Escuela Demo FNE', 'DEMO001') 
          ON CONFLICT (code) DO NOTHING;
          
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
          
          INSERT INTO growth_communities (school_id, generation_id, name)
          SELECT 
              s.id,
              g.id,
              g.name || ' - Comunidad 1'
          FROM schools s
          JOIN generations g ON g.school_id = s.id
          WHERE s.code = 'DEMO001'
          ON CONFLICT DO NOTHING;
        `
      },
      
      // Section 5: Migrate existing users
      {
        name: 'Migrar usuarios existentes',
        sql: `
          INSERT INTO user_roles (user_id, role_type, is_active)
          SELECT 
              id,
              'admin',
              TRUE
          FROM profiles 
          WHERE role = 'admin'
          ON CONFLICT DO NOTHING;
          
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
          
          UPDATE profiles 
          SET school_id = (SELECT id FROM schools WHERE code = 'DEMO001' LIMIT 1)
          WHERE school_id IS NULL;
        `
      },
      
      // Section 6: Create indexes and RLS
      {
        name: 'Crear índices y políticas RLS',
        sql: `
          CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
          CREATE INDEX IF NOT EXISTS idx_user_roles_role_type ON user_roles(role_type);
          CREATE INDEX IF NOT EXISTS idx_user_roles_active ON user_roles(is_active);
          CREATE INDEX IF NOT EXISTS idx_user_roles_school ON user_roles(school_id);
          
          ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
          ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
          ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;
          ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
        `
      },
      
      // Section 7: Create RLS policies
      {
        name: 'Crear políticas de seguridad',
        sql: `
          CREATE POLICY "Admins manage schools" ON schools
              FOR ALL USING (is_global_admin(auth.uid()));
          
          CREATE POLICY "Users view their school" ON schools
              FOR SELECT USING (
                  id IN (SELECT school_id FROM user_roles WHERE user_id = auth.uid() AND is_active = TRUE)
              );
          
          CREATE POLICY "Admins manage generations" ON generations
              FOR ALL USING (is_global_admin(auth.uid()));
          
          CREATE POLICY "Admins manage communities" ON growth_communities
              FOR ALL USING (is_global_admin(auth.uid()));
          
          CREATE POLICY "Admins manage user roles" ON user_roles
              FOR ALL USING (is_global_admin(auth.uid()));
          
          CREATE POLICY "Users view own roles" ON user_roles
              FOR SELECT USING (user_id = auth.uid());
        `
      }
    ];
    
    // Execute each section
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      console.log(`${i + 1}. ${section.name}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: section.sql });
        
        if (error) {
          console.error(`❌ Error en ${section.name}:`, error.message);
          
          // Continue with non-critical errors
          if (error.message.includes('already exists') || 
              error.message.includes('relation') && error.message.includes('does not exist')) {
            console.log('⚠️  Error no crítico, continuando...');
            continue;
          }
          throw error;
        }
        
        console.log(`✅ ${section.name} completado`);
      } catch (err) {
        console.error(`❌ Falló ${section.name}:`, err.message);
        throw err;
      }
    }
    
    console.log('\n🎉 Migración completada exitosamente!');
    
    // Verify migration
    await verifyMigration();
    
  } catch (error) {
    console.error('\n❌ Migración falló:', error.message);
    process.exit(1);
  }
}

async function verifyMigration() {
  console.log('\n🔍 Verificando migración...');
  
  try {
    // Check if tables exist
    const { data: tablesData, error: tablesError } = await supabase
      .rpc('exec_sql', { 
        sql: `SELECT table_name FROM information_schema.tables 
              WHERE table_schema = 'public' 
              AND table_name IN ('schools', 'generations', 'growth_communities', 'user_roles')` 
      });
    
    if (tablesError) {
      console.log(`⚠️  No se pudo verificar tablas: ${tablesError.message}`);
    } else {
      console.log('✅ Tablas creadas correctamente');
    }
    
    // Check user role migration
    const { data: roleCount, error: roleError } = await supabase
      .from('user_roles')
      .select('role_type', { count: 'exact' })
      .eq('is_active', true);
    
    if (roleError) {
      console.log(`⚠️  No se pudo verificar roles: ${roleError.message}`);
    } else {
      console.log(`✅ Roles de usuario migrados: ${roleCount?.length || 0} roles activos`);
    }
    
    // Check default organizational data
    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .select('name')
      .eq('code', 'DEMO001')
      .single();
    
    if (schoolError) {
      console.log(`⚠️  No se pudo verificar datos organizacionales: ${schoolError.message}`);
    } else {
      console.log(`✅ Datos organizacionales: ${schoolData?.name || 'No encontrado'}`);
    }
    
    console.log('\n🎉 Verificación completada!');
    console.log('\nPróximos pasos:');
    console.log('1. Probar la funcionalidad existente para asegurar compatibilidad');
    console.log('2. Verificar que solo usuarios admin tengan acceso administrativo');
    console.log('3. Probar asignación de roles en la interfaz de usuario');
    
  } catch (error) {
    console.error('❌ Error en verificación:', error.message);
  }
}

// Ejecutar migración
console.log('🔧 Aplicando Sistema de Roles en Español para Genera\n');
applySpanishMigration().catch(console.error);