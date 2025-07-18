const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeConstraint() {
  console.log('=== USER_ROLES TABLE CONSTRAINT ANALYSIS ===\n');
  
  // Get actual constraint definition from the database
  const { data: constraintDef, error: defError } = await supabase
    .rpc('query', { 
      sql: `
        SELECT pg_get_constraintdef(oid) as definition
        FROM pg_constraint 
        WHERE conrelid = 'user_roles'::regclass
        AND conname = 'check_role_organizational_scope';
      ` 
    });
  
  if (constraintDef && constraintDef.length > 0) {
    console.log('Current constraint definition:');
    console.log(constraintDef[0].definition);
    console.log('\n');
  }
  
  // Based on the migration files, here's what the constraint should be:
  console.log('Based on the latest migration (fix-community-leader-without-generation.sql):');
  console.log('The constraint should allow the following:');
  console.log('\n1. admin: No organizational fields required');
  console.log('2. consultor: Requires school_id');
  console.log('3. equipo_directivo: Requires school_id');
  console.log('4. lider_generacion: Requires school_id (generation_id optional based on school settings)');
  console.log('5. lider_comunidad: Requires school_id (community_id recommended)');
  console.log('6. docente: Requires school_id');
  
  console.log('\n=== REQUIRED FIELDS BY ROLE TYPE ===\n');
  
  const roleRequirements = {
    'admin': {
      required: [],
      optional: ['school_id', 'generation_id', 'community_id']
    },
    'consultor': {
      required: ['school_id'],
      optional: ['generation_id', 'community_id']
    },
    'equipo_directivo': {
      required: ['school_id'],
      optional: ['generation_id', 'community_id']
    },
    'lider_generacion': {
      required: ['school_id'],
      optional: ['generation_id', 'community_id'],
      note: 'generation_id is typically required unless school has generations disabled'
    },
    'lider_comunidad': {
      required: ['school_id'],
      optional: ['generation_id', 'community_id'],
      note: 'community_id is typically required for this role'
    },
    'docente': {
      required: ['school_id'],
      optional: ['generation_id', 'community_id']
    }
  };
  
  for (const [role, reqs] of Object.entries(roleRequirements)) {
    console.log(`${role}:`);
    console.log(`  Required: ${reqs.required.length ? reqs.required.join(', ') : 'None'}`);
    console.log(`  Optional: ${reqs.optional.join(', ')}`);
    if (reqs.note) {
      console.log(`  Note: ${reqs.note}`);
    }
    console.log('');
  }
  
  console.log('=== EXAMPLE INSERTS ===\n');
  
  console.log('-- Admin (no organizational scope needed):');
  console.log(`INSERT INTO user_roles (user_id, role_type) 
VALUES ('user-uuid-here', 'admin');`);
  
  console.log('\n-- Docente (requires school):');
  console.log(`INSERT INTO user_roles (user_id, role_type, school_id) 
VALUES ('user-uuid-here', 'docente', 'school-uuid-here');`);
  
  console.log('\n-- Consultor (requires school):');
  console.log(`INSERT INTO user_roles (user_id, role_type, school_id) 
VALUES ('user-uuid-here', 'consultor', 'school-uuid-here');`);
  
  console.log('\n-- Líder de Generación (requires school, may need generation):');
  console.log(`INSERT INTO user_roles (user_id, role_type, school_id, generation_id) 
VALUES ('user-uuid-here', 'lider_generacion', 'school-uuid-here', 'generation-uuid-here');`);
  
  console.log('\n=== TROUBLESHOOTING ===\n');
  console.log('If you get "violates check constraint check_role_organizational_scope", ensure:');
  console.log('1. You are providing the required fields for the role type');
  console.log('2. The school_id exists in the schools table');
  console.log('3. If providing generation_id, it exists and belongs to the specified school');
  console.log('4. If providing community_id, it exists and belongs to the specified school/generation');
  
  // Check if there are any schools in the database
  const { data: schools, error: schoolError } = await supabase
    .from('schools')
    .select('id, name')
    .limit(5);
  
  if (schools && schools.length > 0) {
    console.log('\n=== AVAILABLE SCHOOLS ===');
    schools.forEach(school => {
      console.log(`${school.id}: ${school.name}`);
    });
  }
}

analyzeConstraint().catch(console.error);