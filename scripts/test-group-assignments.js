const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Faltan variables de entorno. Verifica tu archivo .env.local');
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

// Contador de pruebas para determinar código de salida
let testsPassed = 0;
let testsFailed = 0;

/**
 * Helper: Busca un perfil con rol docente activo o crea uno temporal
 * @returns {Promise<Object>} Objeto con id del docente
 */
async function getOrCreateDocenteSemilla() {
  try {
    // 1. Buscar docentes activos en user_roles con join manual
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'docente')
      .eq('is_active', true)
      .limit(1);

    if (rolesError) {
      log(`  ⚠️  Error al buscar docentes en user_roles: ${rolesError.message}`, 'yellow');
    }

    // Si encontramos docente activo, obtener su perfil
    if (userRoles && userRoles.length > 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .eq('id', userRoles[0].user_id)
        .single();

      if (profile) {
        log(`  ℹ️  Usando docente existente: ${profile.email}`, 'blue');
        return { id: profile.id, email: profile.email, created: false };
      }
    }

    // 2. No hay docentes activos, crear perfil temporal
    log('  ℹ️  No se encontraron docentes activos, creando perfil temporal...', 'blue');

    const timestamp = Date.now();
    const tempProfile = {
      id: crypto.randomUUID(),
      email: `docente-test-${timestamp}@fne-testing.local`,
      first_name: 'Docente',
      last_name: 'Prueba',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: createdProfile, error: profileError } = await supabase
      .from('profiles')
      .insert(tempProfile)
      .select()
      .single();

    if (profileError) {
      throw new Error(`Error al crear perfil temporal: ${profileError.message}`);
    }

    // 3. Crear registro en user_roles para el perfil temporal
    const { error: userRoleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: createdProfile.id,
        role_type: 'docente',
        is_active: true,
        created_at: new Date().toISOString()
      });

    if (userRoleError) {
      log(`  ⚠️  Perfil creado pero no se pudo agregar a user_roles: ${userRoleError.message}`, 'yellow');
    }

    log(`  ✅ Docente semilla creado: ${createdProfile.email}`, 'green');
    return { id: createdProfile.id, email: createdProfile.email, created: true };

  } catch (error) {
    throw new Error(`Error en getOrCreateDocenteSemilla: ${error.message}`);
  }
}

async function runTests() {
  log('\n🧪 Suite de Pruebas de Tareas Grupales', 'blue');
  log('=========================================\n', 'blue');

  let createdAssignment = null;
  let createdProfile = null;

  try {
    // Test 1: Verificar tablas principales
    log('Test 1: Verificando tablas de tareas grupales...', 'yellow');

    const tables = [
      'group_assignment_groups',
      'group_assignment_members',
      'group_assignment_submissions',
      'group_assignment_settings',
      'group_assignment_discussions'
    ];

    let tablesOk = true;
    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        log(`  ❌ Tabla ${table} no existe o tiene errores: ${error.message}`, 'red');
        tablesOk = false;
        testsFailed++;
      } else {
        log(`  ✅ Tabla ${table} existe y es accesible`, 'green');
      }
    }

    if (tablesOk) testsPassed++;

    // Test 2: Verificar columnas vigentes en lesson_assignments
    log('\nTest 2: Verificando columnas vigentes en lesson_assignments...', 'yellow');

    const { data: assignments, error: assignError } = await supabase
      .from('lesson_assignments')
      .select('assignment_type, group_assignments, due_date')
      .limit(1);

    if (assignError) {
      log(`  ❌ Error al verificar columnas: ${assignError.message}`, 'red');
      testsFailed++;
    } else {
      log('  ✅ Columnas vigentes verificadas correctamente', 'green');
      log('     • assignment_type (TEXT)', 'blue');
      log('     • group_assignments (JSONB)', 'blue');
      log('     • due_date (TIMESTAMPTZ)', 'blue');
      testsPassed++;
    }

    // Test 3: Verificar tabla blocks para group-assignment
    log('\nTest 3: Verificando tabla blocks (arquitectura actual)...', 'yellow');

    const { data: blocks, error: blocksError } = await supabase
      .from('blocks')
      .select('id, lesson_id, type, payload')
      .in('type', ['group-assignment', 'group_assignment'])
      .limit(1);

    if (blocksError) {
      log(`  ❌ Error al acceder a tabla blocks: ${blocksError.message}`, 'red');
      testsFailed++;
    } else {
      log('  ✅ Tabla blocks accesible para bloques tipo group-assignment', 'green');
      if (blocks && blocks.length > 0) {
        log(`     • ${blocks.length} bloque(s) de tarea grupal encontrado(s)`, 'blue');
      }
      testsPassed++;
    }

    // Test 4: Obtener o crear docente para pruebas
    log('\nTest 4: Obteniendo docente para suite de pruebas...', 'yellow');

    let docente;
    try {
      docente = await getOrCreateDocenteSemilla();
      if (docente.created) {
        createdProfile = docente; // Guardar para limpieza
      }
      testsPassed++;
    } catch (error) {
      log(`  ❌ ${error.message}`, 'red');
      testsFailed++;
      // No podemos continuar sin docente
      throw error;
    }

    // Test 5: Crear bloque de tarea grupal de prueba
    log('\nTest 5: Creando bloque de tarea grupal de prueba...', 'yellow');

    // Obtener curso y lección
    const { data: course } = await supabase
      .from('courses')
      .select('id, title')
      .limit(1)
      .single();

    if (!course) {
      log('  ⚠️  No hay cursos disponibles para crear tarea', 'yellow');
      testsFailed++;
    } else {
      const { data: lesson } = await supabase
        .from('lessons')
        .select('id, title')
        .eq('course_id', course.id)
        .limit(1)
        .single();

      if (!lesson) {
        log('  ⚠️  No hay lecciones disponibles para crear tarea', 'yellow');
        testsFailed++;
      } else {
        // Crear bloque de tipo group-assignment
        const blockPayload = {
          title: `Tarea Grupal Prueba - ${new Date().toISOString().split('T')[0]}`,
          description: 'Tarea grupal creada automáticamente por suite de pruebas',
          instructions: 'Este es un bloque de prueba para validar el sistema de tareas colaborativas.',
          resources: []
        };

        const { data: createdBlock, error: blockError } = await supabase
          .from('blocks')
          .insert({
            lesson_id: lesson.id,
            type: 'group-assignment',
            position: 999, // Posición al final
            payload: blockPayload
          })
          .select()
          .single();

        if (blockError) {
          log(`  ❌ Error al crear bloque de tarea grupal: ${blockError.message}`, 'red');
          testsFailed++;
        } else {
          createdAssignment = createdBlock; // Guardar para limpieza
          log(`  ✅ Bloque de tarea grupal creado`, 'green');
          log(`     • ID: ${createdBlock.id}`, 'blue');
          log(`     • Lección: ${lesson.title}`, 'blue');
          log(`     • Curso: ${course.title}`, 'blue');
          log(`     • Título: ${blockPayload.title}`, 'blue');
          testsPassed++;
        }
      }
    }

    // Test 6: Crear grupo de prueba (si hay bloque creado)
    if (createdAssignment) {
      log('\nTest 6: Creando grupo de prueba...', 'yellow');

      const { data: community } = await supabase
        .from('growth_communities')
        .select('id, name')
        .limit(1)
        .single();

      if (!community) {
        log('  ⚠️  No hay comunidades disponibles', 'yellow');
        testsFailed++;
      } else {
        const { data: createdGroup, error: groupError } = await supabase
          .from('group_assignment_groups')
          .insert({
            assignment_id: createdAssignment.id,
            community_id: community.id,
            name: `Grupo Prueba ${Date.now()}`,
            is_consultant_managed: false
          })
          .select()
          .single();

        if (groupError) {
          log(`  ❌ Error al crear grupo: ${groupError.message}`, 'red');
          testsFailed++;
        } else {
          log(`  ✅ Grupo creado exitosamente`, 'green');
          log(`     • ID: ${createdGroup.id}`, 'blue');
          log(`     • Nombre: ${createdGroup.name}`, 'blue');
          log(`     • Comunidad: ${community.name}`, 'blue');
          testsPassed++;

          // Test 7: Agregar miembro al grupo
          log('\nTest 7: Agregando docente como miembro del grupo...', 'yellow');

          const { error: memberError } = await supabase
            .from('group_assignment_members')
            .insert({
              group_id: createdGroup.id,
              assignment_id: createdAssignment.id,
              user_id: docente.id,
              role: 'member'
            });

          if (memberError) {
            log(`  ❌ Error al agregar miembro: ${memberError.message}`, 'red');
            testsFailed++;
          } else {
            log(`  ✅ Miembro agregado al grupo`, 'green');
            testsPassed++;
          }

          // Test 8: Crear submission de prueba
          log('\nTest 8: Creando submission de prueba...', 'yellow');

          const { data: submission, error: submissionError } = await supabase
            .from('group_assignment_submissions')
            .insert({
              assignment_id: createdAssignment.id,
              group_id: createdGroup.id,
              user_id: docente.id,
              content: 'Contenido de prueba para validar submissions',
              status: 'pending'
            })
            .select()
            .single();

          if (submissionError) {
            log(`  ❌ Error al crear submission: ${submissionError.message}`, 'red');
            testsFailed++;
          } else {
            log(`  ✅ Submission creada`, 'green');
            log(`     • Estado: ${submission.status}`, 'blue');
            testsPassed++;
          }
        }
      }
    }

    // Resumen de resultados
    log('\n📊 Resumen de Pruebas', 'blue');
    log('====================', 'blue');
    log(`✅ Pruebas exitosas: ${testsPassed}`, 'green');
    if (testsFailed > 0) {
      log(`❌ Pruebas fallidas: ${testsFailed}`, 'red');
    }

    const totalTests = testsPassed + testsFailed;
    const successRate = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : 0;
    log(`📈 Tasa de éxito: ${successRate}%`, successRate === 100 ? 'green' : 'yellow');

    log('\n📝 Próximos pasos para pruebas manuales:', 'yellow');
    log('1. Iniciar sesión como docente/consultor y crear tarea grupal', 'blue');
    log('2. Iniciar sesión como estudiante y verificar auto-agrupación', 'blue');
    log('3. Probar invitación de compañeros al grupo', 'blue');
    log('4. Enviar trabajo grupal y verificar propagación a todos los miembros', 'blue');
    log('5. Calificar entregas como consultor', 'blue');

  } catch (error) {
    log(`\n❌ Error general en las pruebas: ${error.message}`, 'red');
    console.error(error);
    testsFailed++;
  } finally {
    // Limpieza de datos de prueba
    log('\n🧹 Limpiando datos de prueba...', 'yellow');

    try {
      if (createdAssignment) {
        // Eliminar en orden inverso por foreign keys
        await supabase.from('group_assignment_submissions').delete().eq('assignment_id', createdAssignment.id);
        await supabase.from('group_assignment_members').delete().eq('assignment_id', createdAssignment.id);
        await supabase.from('group_assignment_groups').delete().eq('assignment_id', createdAssignment.id);
        await supabase.from('blocks').delete().eq('id', createdAssignment.id);
        log('  ✅ Bloque de tarea y datos relacionados eliminados', 'green');
      }

      if (createdProfile) {
        // Eliminar perfil temporal creado
        await supabase.from('user_roles').delete().eq('user_id', createdProfile.id);
        await supabase.from('profiles').delete().eq('id', createdProfile.id);
        log(`  ✅ Perfil temporal eliminado: ${createdProfile.email}`, 'green');
      }
    } catch (cleanupError) {
      log(`  ⚠️  Error en limpieza: ${cleanupError.message}`, 'yellow');
    }

    // Determinar código de salida
    if (testsFailed > 0) {
      log('\n❌ Suite finalizada con errores', 'red');
      process.exit(1);
    } else {
      log('\n✅ Suite finalizada exitosamente', 'green');
      process.exit(0);
    }
  }
}

// Ejecutar suite de pruebas
runTests();
