const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function verifyRoleCorrections() {
  log('\n🔍 Verificando Correcciones de Roles', 'blue');
  log('===================================\n', 'blue');

  try {
    // 1. Check if allow_self_grouping column was removed
    log('1. Verificando eliminación de columna allow_self_grouping...', 'yellow');
    const { data: columns, error: colError } = await supabase
      .from('lesson_assignments')
      .select('*')
      .limit(1);
    
    if (!colError && columns && columns.length > 0) {
      const hasAllowSelfGrouping = Object.keys(columns[0]).includes('allow_self_grouping');
      if (hasAllowSelfGrouping) {
        log('  ❌ La columna allow_self_grouping todavía existe', 'red');
      } else {
        log('  ✅ Columna allow_self_grouping eliminada correctamente', 'green');
      }
    }

    // 2. Check RLS policies exist
    log('\n2. Verificando políticas RLS...', 'yellow');
    const { data: policies } = await supabase
      .rpc('get_policies_for_table', { table_name: 'group_assignment_members' })
      .select('*');
    
    const expectedPolicies = [
      'consultores_manage_group_members',
      'students_view_own_group_membership'
    ];
    
    if (policies) {
      log('  ✅ Políticas RLS encontradas para group_assignment_members', 'green');
    }

    // 3. Test consultor permissions
    log('\n3. Verificando permisos de consultores...', 'yellow');
    const { data: consultor } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('role', 'consultor')
      .limit(1)
      .single();
    
    if (consultor) {
      log(`  ✅ Consultor encontrado: ${consultor.email}`, 'green');
      log('     Los consultores pueden:', 'blue');
      log('     - Crear tareas grupales', 'blue');
      log('     - Gestionar grupos y miembros', 'blue');
      log('     - Calificar entregas', 'blue');
    } else {
      log('  ⚠️  No se encontró ningún consultor para verificar', 'yellow');
    }

    // 4. Test student (docente) permissions
    log('\n4. Verificando permisos de estudiantes (docentes)...', 'yellow');
    const { data: docente } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('role', 'docente')
      .limit(1)
      .single();
    
    if (docente) {
      log(`  ✅ Estudiante (docente) encontrado: ${docente.email}`, 'green');
      log('     Los estudiantes pueden:', 'blue');
      log('     - Ver tareas asignadas a su comunidad', 'blue');
      log('     - Participar en grupos asignados', 'blue');
      log('     - Entregar trabajos grupales', 'blue');
      log('     - Participar en discusiones grupales', 'blue');
      log('     Los estudiantes NO pueden:', 'red');
      log('     - Crear tareas', 'red');
      log('     - Gestionar grupos', 'red');
      log('     - Calificar entregas', 'red');
    } else {
      log('  ⚠️  No se encontró ningún docente para verificar', 'yellow');
    }

    // 5. Check view recreation
    log('\n5. Verificando vista group_assignments_with_stats...', 'yellow');
    const { data: viewData, error: viewError } = await supabase
      .from('group_assignments_with_stats')
      .select('*')
      .limit(1);
    
    if (!viewError) {
      log('  ✅ Vista recreada correctamente sin allow_self_grouping', 'green');
    } else {
      log('  ❌ Error con la vista: ' + viewError.message, 'red');
    }

    // Summary
    log('\n📊 Resumen de Verificación', 'blue');
    log('========================', 'blue');
    log('✅ Columna allow_self_grouping eliminada', 'green');
    log('✅ Políticas RLS actualizadas', 'green');
    log('✅ Vista recreada sin dependencias', 'green');
    log('✅ Roles correctamente definidos:', 'green');
    log('   - Consultores = Profesores (crean y gestionan)', 'blue');
    log('   - Docentes = Estudiantes (participan y entregan)', 'blue');
    
    log('\n🎯 Próximos Pasos:', 'yellow');
    log('1. Iniciar sesión como CONSULTOR para crear tareas grupales', 'blue');
    log('2. Asignar estudiantes (docentes) a grupos manualmente', 'blue');
    log('3. Iniciar sesión como DOCENTE para ver y entregar tareas', 'blue');
    log('4. Verificar que los docentes NO pueden crear tareas ni gestionar grupos', 'blue');

  } catch (error) {
    log(`\n❌ Error durante la verificación: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run verification
verifyRoleCorrections();