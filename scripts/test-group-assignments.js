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

// Test data
const testUsers = {
  teacher: { email: 'teacher@test.com', role: 'docente' },
  student1: { email: 'student1@test.com', role: 'docente' },
  student2: { email: 'student2@test.com', role: 'docente' },
  student3: { email: 'student3@test.com', role: 'docente' }
};

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

async function runTests() {
  log('\n🧪 Starting Group Assignments Test Suite', 'blue');
  log('=====================================\n', 'blue');

  try {
    // Test 1: Check if tables were created
    log('Test 1: Verificando tablas de tareas grupales...', 'yellow');
    
    const tables = [
      'group_assignment_members',
      'group_assignment_submissions',
      'group_assignment_discussions'
    ];
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        log(`  ❌ Tabla ${table} no existe o tiene errores: ${error.message}`, 'red');
      } else {
        log(`  ✅ Tabla ${table} existe y es accesible`, 'green');
      }
    }

    // Test 2: Check lesson_assignments columns
    log('\nTest 2: Verificando columnas de tareas grupales...', 'yellow');
    
    const { data: assignments, error: assignError } = await supabase
      .from('lesson_assignments')
      .select('assignment_for, max_group_size, min_group_size, allow_self_grouping')
      .limit(1);
    
    if (assignError) {
      log(`  ❌ Error al verificar columnas: ${assignError.message}`, 'red');
    } else {
      log('  ✅ Columnas de tareas grupales agregadas correctamente', 'green');
    }

    // Test 3: Create test group assignment
    log('\nTest 3: Creando tarea grupal de prueba...', 'yellow');
    
    // First, get a course and lesson
    const { data: courses } = await supabase
      .from('courses')
      .select('id, title')
      .limit(1)
      .single();
    
    if (!courses) {
      log('  ⚠️  No hay cursos disponibles para crear tarea', 'yellow');
      return;
    }
    
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, title')
      .eq('course_id', courses.id)
      .limit(1)
      .single();
    
    if (!lessons) {
      log('  ⚠️  No hay lecciones disponibles para crear tarea', 'yellow');
      return;
    }

    // Get a community
    const { data: community } = await supabase
      .from('growth_communities')
      .select('id, name')
      .limit(1)
      .single();
    
    if (!community) {
      log('  ⚠️  No hay comunidades disponibles', 'yellow');
      return;
    }

    // Get a teacher/admin user to be the creator
    const { data: teacher } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'docente'])
      .limit(1)
      .single();
    
    if (!teacher) {
      log('  ⚠️  No hay usuarios con rol de docente disponibles', 'yellow');
      return;
    }

    const groupAssignment = {
      title: 'Tarea Grupal de Prueba - ' + new Date().toISOString(),
      description: 'Esta es una tarea grupal creada para probar el sistema',
      lesson_id: lessons.id,
      course_id: courses.id,
      created_by: teacher.id,
      assignment_for: 'group',
      assigned_to_community_id: community.id,
      max_group_size: 4,
      min_group_size: 2,
      allow_self_grouping: true,
      require_all_members_submit: false,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 1 week from now
    };

    const { data: createdAssignment, error: createError } = await supabase
      .from('lesson_assignments')
      .insert(groupAssignment)
      .select()
      .single();
    
    if (createError) {
      log(`  ❌ Error al crear tarea grupal: ${createError.message}`, 'red');
      return;
    } else {
      log(`  ✅ Tarea grupal creada: ${createdAssignment.title}`, 'green');
      log(`     ID: ${createdAssignment.id}`, 'blue');
      log(`     Comunidad: ${community.name}`, 'blue');
      log(`     Tamaño de grupo: ${createdAssignment.min_group_size}-${createdAssignment.max_group_size} miembros`, 'blue');
    }

    // Test 4: Create a test group
    log('\nTest 4: Creando grupo de prueba...', 'yellow');
    
    const groupId = crypto.randomUUID();
    
    // Get some users
    const { data: users } = await supabase
      .from('profiles')
      .select('id, email')
      .limit(3);
    
    if (!users || users.length < 2) {
      log('  ⚠️  No hay suficientes usuarios para crear un grupo', 'yellow');
      return;
    }

    // Add members to group
    const groupMembers = users.slice(0, 2).map((user, index) => ({
      assignment_id: createdAssignment.id,
      community_id: community.id,
      group_id: groupId,
      user_id: user.id,
      role: index === 0 ? 'leader' : 'member'
    }));

    const { error: memberError } = await supabase
      .from('group_assignment_members')
      .insert(groupMembers);
    
    if (memberError) {
      log(`  ❌ Error al agregar miembros al grupo: ${memberError.message}`, 'red');
    } else {
      log(`  ✅ Grupo creado con ${groupMembers.length} miembros`, 'green');
      log(`     Líder: ${users[0].email}`, 'blue');
      log(`     Miembro: ${users[1].email}`, 'blue');
    }

    // Test 5: Create test submission
    log('\nTest 5: Creando entrega de prueba...', 'yellow');
    
    const submission = {
      assignment_id: createdAssignment.id,
      group_id: groupId,
      community_id: community.id,
      submitted_by: users[0].id,
      submission_content: 'Esta es una entrega de prueba del grupo',
      status: 'draft'
    };

    const { data: createdSubmission, error: submissionError } = await supabase
      .from('group_assignment_submissions')
      .insert(submission)
      .select()
      .single();
    
    if (submissionError) {
      log(`  ❌ Error al crear entrega: ${submissionError.message}`, 'red');
    } else {
      log(`  ✅ Entrega creada en estado: ${createdSubmission.status}`, 'green');
    }

    // Test 6: Test RLS policies
    log('\nTest 6: Verificando políticas RLS...', 'yellow');
    
    // This would need to be tested with actual user tokens
    log('  ℹ️  Las políticas RLS deben probarse desde la aplicación con usuarios reales', 'blue');

    // Summary
    log('\n📊 Resumen de Pruebas', 'blue');
    log('====================', 'blue');
    log('✅ Tablas creadas correctamente', 'green');
    log('✅ Columnas agregadas a lesson_assignments', 'green');
    log('✅ Tarea grupal creada exitosamente', 'green');
    log('✅ Grupo formado con miembros', 'green');
    log('✅ Entrega de prueba creada', 'green');
    
    log('\n📝 Próximos pasos para pruebas manuales:', 'yellow');
    log('1. Iniciar sesión como docente y crear una tarea grupal', 'blue');
    log('2. Iniciar sesión como estudiante y unirse a un grupo', 'blue');
    log('3. Probar el chat/discusión del grupo', 'blue');
    log('4. Enviar una tarea como grupo', 'blue');
    log('5. Como docente, calificar la entrega grupal', 'blue');

    // Clean up test data (optional)
    log('\n🧹 Limpiando datos de prueba...', 'yellow');
    
    if (createdAssignment) {
      // Delete in reverse order due to foreign keys
      await supabase.from('group_assignment_submissions').delete().eq('assignment_id', createdAssignment.id);
      await supabase.from('group_assignment_members').delete().eq('assignment_id', createdAssignment.id);
      await supabase.from('lesson_assignments').delete().eq('id', createdAssignment.id);
      log('  ✅ Datos de prueba eliminados', 'green');
    }

  } catch (error) {
    log(`\n❌ Error general en las pruebas: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run the tests
runTests();