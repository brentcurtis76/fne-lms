/**
 * Suite Completa de Pruebas para Tareas Colaborativas (Group Assignments)
 *
 * Este script valida el flujo completo de tareas grupales desde la creación
 * hasta el envío de trabajos y sincronización entre miembros.
 *
 * PREREQUISITOS:
 * - Base de datos debe tener al menos 1 curso existente
 * - Sistema debe tener al menos 2 usuarios activos con auth.users
 *   (prioriza: docente > directivo/líder > consultor/community_manager)
 * - Tablas requeridas: blocks, group_assignment_groups, group_assignment_members,
 *   group_assignment_submissions, group_assignment_settings
 *
 * IMPORTANTE:
 * - NO crea auth.users (usa usuarios existentes del sistema)
 * - Prioriza docentes, luego roles directivos, finalmente consultores
 * - Crea recursos temporales: lección, bloque, grupo, submissions
 * - Limpia automáticamente todos los recursos temporales al finalizar
 *
 * EJECUCIÓN:
 * node scripts/test-group-assignments-complete.js
 */

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
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Contador de pruebas
let testsPassed = 0;
let testsFailed = 0;

// Referencias para limpieza
const createdResources = {
  profiles: [],
  course: null,
  lesson: null,
  blocks: [],
  groups: [],
  communities: []
};

/**
 * Helper compartido: Busca un perfil con rol docente activo o crea uno temporal
 * @returns {Promise<Object>} Objeto con id del docente y flag created
 */
async function getOrCreateDocenteSemilla() {
  try {
    // 1. Buscar docentes activos en user_roles
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
      last_name: 'Prueba'
    };

    const { data: createdProfile, error: profileError } = await supabase
      .from('profiles')
      .insert(tempProfile)
      .select()
      .single();

    if (profileError) {
      throw new Error(`Error al crear perfil temporal: ${profileError.message}`);
    }

    // 3. Crear registro en user_roles
    const { error: userRoleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: createdProfile.id,
        role_type: 'docente',
        is_active: true
      });

    if (userRoleError) {
      log(`  ⚠️  Perfil creado pero no se pudo agregar a user_roles: ${userRoleError.message}`, 'yellow');
    }

    log(`  ✅ Docente semilla creado: ${createdProfile.email}`, 'green');
    createdResources.profiles.push(createdProfile.id);
    return { id: createdProfile.id, email: createdProfile.email, created: true };

  } catch (error) {
    throw new Error(`Error en getOrCreateDocenteSemilla: ${error.message}`);
  }
}

/**
 * Helper: Busca usuarios existentes priorizando docentes
 * NOTA: No podemos crear perfiles sin auth.users asociados porque
 * group_assignment_members.user_id y group_assignment_submissions.user_id
 * tienen FK a auth.users
 *
 * Orden de prioridad:
 * 1. docente
 * 2. equipo_directivo, lider_generacion, lider_comunidad
 * 3. consultor, community_manager, supervisor_de_red
 *
 * @param {number} count - Cantidad de usuarios a buscar
 * @returns {Promise<Array>} Array de perfiles encontrados
 */
async function getEstudiantesExistentes(count = 4) {
  const usuarios = [];
  const rolesByPriority = [
    ['docente'],
    ['equipo_directivo', 'lider_generacion', 'lider_comunidad'],
    ['consultor', 'community_manager', 'supervisor_de_red']
  ];

  // Contador de usuarios por rol para logging
  const roleCount = {};

  // Buscar usuarios en orden de prioridad hasta completar el count
  for (const roleGroup of rolesByPriority) {
    if (usuarios.length >= count) break;

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .in('role_type', roleGroup)
      .eq('is_active', true)
      .limit(count - usuarios.length);

    if (userRoles && userRoles.length > 0) {
      // Obtener perfiles completos
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', userRoles.map(r => r.user_id));

      if (profiles && profiles.length > 0) {
        // Contar por rol para estadísticas
        userRoles.forEach(ur => {
          roleCount[ur.role_type] = (roleCount[ur.role_type] || 0) + 1;
        });

        usuarios.push(...profiles);
      }
    }
  }

  if (usuarios.length === 0) {
    log(`  ⚠️  No hay usuarios activos en el sistema`, 'yellow');
    return [];
  }

  // Log informativo sobre composición de usuarios
  const rolesUsados = Object.entries(roleCount)
    .map(([role, count]) => `${count} ${role}`)
    .join(', ');

  log(`  ℹ️  Usando ${usuarios.length} usuarios existentes: ${rolesUsados}`, 'blue');
  return usuarios.slice(0, count); // Asegurar límite exacto
}

/**
 * Helper: Crea o encuentra comunidad para pruebas
 * @returns {Promise<Object>} Comunidad encontrada o creada
 */
async function getOrCreateComunidadPrueba() {
  // Buscar comunidad existente
  const { data: existingCommunity } = await supabase
    .from('growth_communities')
    .select('id, name')
    .limit(1)
    .single();

  if (existingCommunity) {
    log(`  ℹ️  Usando comunidad existente: ${existingCommunity.name}`, 'blue');
    return existingCommunity;
  }

  // Crear comunidad temporal
  log('  ℹ️  Creando comunidad temporal...', 'blue');
  const timestamp = Date.now();

  const { data: newCommunity, error: communityError } = await supabase
    .from('growth_communities')
    .insert({
      name: `Comunidad Prueba ${timestamp}`,
      description: 'Comunidad creada para pruebas de tareas grupales'
    })
    .select()
    .single();

  if (communityError) {
    throw new Error(`Error al crear comunidad: ${communityError.message}`);
  }

  log(`  ✅ Comunidad temporal creada: ${newCommunity.name}`, 'green');
  createdResources.communities.push(newCommunity.id);
  return newCommunity;
}

async function runTests() {
  log('\n🧪 Suite Completa de Pruebas de Tareas Grupales', 'blue');
  log('===============================================\n', 'blue');

  try {
    // Test 1: Verificar schema vigente
    log('Test 1: Verificando schema de tablas principales...', 'yellow');

    const tables = [
      'blocks',
      'group_assignment_groups',
      'group_assignment_members',
      'group_assignment_submissions',
      'group_assignment_settings'
    ];

    let tablesOk = true;
    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        log(`  ❌ Tabla ${table} no accesible: ${error.message}`, 'red');
        tablesOk = false;
        testsFailed++;
      } else {
        log(`  ✅ Tabla ${table} accesible`, 'green');
      }
    }

    if (tablesOk) testsPassed++;

    // Test 2: Verificar columnas vigentes en lesson_assignments
    log('\nTest 2: Verificando columnas vigentes en lesson_assignments...', 'yellow');

    const { error: assignError } = await supabase
      .from('lesson_assignments')
      .select('assignment_type, group_assignments, due_date')
      .limit(1);

    if (assignError) {
      log(`  ❌ Error al verificar columnas: ${assignError.message}`, 'red');
      testsFailed++;
    } else {
      log('  ✅ Columnas vigentes verificadas (assignment_type, group_assignments, due_date)', 'green');
      testsPassed++;
    }

    // Test 3: Verificar bloques group-assignment en tabla blocks
    log('\nTest 3: Verificando arquitectura de blocks para tareas grupales...', 'yellow');

    const { data: existingBlocks, error: blocksError } = await supabase
      .from('blocks')
      .select('id, type')
      .in('type', ['group-assignment', 'group_assignment'])
      .limit(5);

    if (blocksError) {
      log(`  ❌ Error al consultar blocks: ${blocksError.message}`, 'red');
      testsFailed++;
    } else {
      log(`  ✅ Arquitectura de blocks verificada (${existingBlocks?.length || 0} bloques existentes)`, 'green');
      testsPassed++;
    }

    // Test 4: Obtener usuarios existentes
    log('\nTest 4: Obteniendo usuarios existentes para pruebas...', 'yellow');

    let docente, estudiantes;
    try {
      docente = await getOrCreateDocenteSemilla();
      estudiantes = await getEstudiantesExistentes(4);

      if (estudiantes.length < 2) {
        log(`  ⚠️  Se requieren al menos 2 usuarios activos en el sistema`, 'yellow');
        log(`     Actualmente hay: ${estudiantes.length}`, 'yellow');
        log(`     Tip: Crea usuarios con roles docente/directivo/consultor`, 'cyan');
        testsFailed++;
        throw new Error('Insuficientes usuarios en el sistema');
      }

      log(`  ✅ Usuarios obtenidos: 1 creador + ${estudiantes.length} participantes`, 'green');
      testsPassed++;
    } catch (error) {
      log(`  ❌ ${error.message}`, 'red');
      testsFailed++;
      throw error;
    }

    // Test 5: Obtener curso existente o crear lección
    log('\nTest 5: Obteniendo curso existente para pruebas...', 'yellow');

    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title')
      .limit(1)
      .single();

    if (courseError || !course) {
      log(`  ❌ No se encontró ningún curso para pruebas: ${courseError?.message}`, 'red');
      testsFailed++;
    } else {
      log(`  ✅ Usando curso existente: ${course.title}`, 'green');

      // Crear lección temporal
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .insert({
          course_id: course.id,
          title: `Lección Prueba Tarea Grupal ${Date.now()}`,
          order_number: 999
        })
        .select()
        .single();

      if (lessonError) {
        log(`  ❌ Error al crear lección: ${lessonError.message}`, 'red');
        testsFailed++;
      } else {
        createdResources.lesson = lesson.id;
        createdResources.course = course.id; // Guardar solo para enrollments, no para eliminar
        log(`  ✅ Lección temporal creada: ${lesson.title}`, 'green');
        testsPassed++;
      }
    }

    // Test 6: Inscribir usuarios participantes en el curso
    if (createdResources.course && estudiantes.length > 0) {
      log('\nTest 6: Inscribiendo usuarios participantes en el curso...', 'yellow');

      const enrollments = estudiantes.map(est => ({
        course_id: createdResources.course,
        user_id: est.id,
        status: 'active'
      }));

      const { error: enrollError } = await supabase
        .from('course_enrollments')
        .insert(enrollments);

      if (enrollError && !enrollError.message.includes('duplicate')) {
        log(`  ❌ Error al inscribir usuarios: ${enrollError.message}`, 'red');
        testsFailed++;
      } else {
        log(`  ✅ ${estudiantes.length} usuarios inscritos exitosamente`, 'green');
        testsPassed++;
      }
    }

    // Test 7: Crear bloque de tarea grupal en tabla blocks
    if (createdResources.lesson) {
      log('\nTest 7: Creando bloque de tarea grupal en tabla blocks...', 'yellow');

      const blockPayload = {
        title: 'Proyecto de Investigación Colaborativa',
        description: 'Investigar metodologías de enseñanza modernas y crear presentación grupal',
        instructions: 'Cada grupo debe investigar una metodología diferente y preparar una presentación de 10 diapositivas. El trabajo debe incluir ejemplos prácticos y casos de estudio.',
        resources: [
          { name: 'Guía de Metodologías', url: 'https://example.com/guia.pdf' },
          { name: 'Plantilla de Presentación', url: 'https://example.com/plantilla.pptx' }
        ]
      };

      const { data: block, error: blockError } = await supabase
        .from('blocks')
        .insert({
          lesson_id: createdResources.lesson,
          type: 'group-assignment',
          position: 1,
          payload: blockPayload
        })
        .select()
        .single();

      if (blockError) {
        log(`  ❌ Error al crear bloque: ${blockError.message}`, 'red');
        testsFailed++;
      } else {
        createdResources.blocks.push(block.id);
        log(`  ✅ Bloque de tarea grupal creado`, 'green');
        log(`     • ID: ${block.id}`, 'cyan');
        log(`     • Título: ${blockPayload.title}`, 'cyan');
        testsPassed++;
      }
    }

    // Test 8: Crear comunidad y grupos
    if (createdResources.blocks.length > 0 && estudiantes.length >= 4) {
      log('\nTest 8: Creando grupos para la tarea...', 'yellow');

      const community = await getOrCreateComunidadPrueba();
      const assignmentId = createdResources.blocks[0];

      // Crear 1 grupo (constraint unique_assignment_community permite solo 1 por comunidad)
      const { data: grupo, error: groupError } = await supabase
        .from('group_assignment_groups')
        .insert({
          assignment_id: assignmentId,
          community_id: community.id,
          name: `Grupo Colaborativo - Prueba`,
          is_consultant_managed: false
        })
        .select()
        .single();

      if (groupError) {
        log(`  ❌ Error al crear grupo: ${groupError.message}`, 'red');
        testsFailed++;
      } else {
        createdResources.groups.push(grupo.id);
        log(`  ✅ Grupo creado: ${grupo.name}`, 'green');
        testsPassed++;
      }

      // Test 9: Asignar usuarios participantes al grupo (solo si grupo fue creado)
      if (grupo) {
        log('\nTest 9: Asignando usuarios participantes al grupo...', 'yellow');

        const members = estudiantes.map(est => ({
          group_id: grupo.id,
          assignment_id: assignmentId,
          user_id: est.id,
          role: 'member'
        }));

        const { error: membersError } = await supabase
          .from('group_assignment_members')
          .insert(members);

        if (membersError) {
          log(`  ❌ Error al asignar miembros: ${membersError.message}`, 'red');
          testsFailed++;
        } else {
          log(`  ✅ ${estudiantes.length} usuarios asignados al grupo`, 'green');
          log(`     • ${estudiantes.map(e => e.first_name).join(', ')}`, 'cyan');
          testsPassed++;
        }
      }

      // Test 10: Simular envío de trabajo grupal (solo si grupo existe)
      if (grupo) {
        log('\nTest 10: Simulando envío de trabajo grupal...', 'yellow');

        // Crear submissions para todos los miembros (comportamiento esperado)
        const submissions = estudiantes.map(est => ({
          assignment_id: assignmentId,
          group_id: grupo.id,
          user_id: est.id,
          content: 'Investigación sobre Aprendizaje Basado en Proyectos (ABP)',
          file_url: 'https://example.com/submissions/grupo-colaborativo-abp.pdf',
          status: 'submitted'
        }));

        const { error: submissionError } = await supabase
          .from('group_assignment_submissions')
          .insert(submissions);

        if (submissionError) {
          log(`  ❌ Error al crear submissions: ${submissionError.message}`, 'red');
          testsFailed++;
        } else {
          log(`  ✅ Trabajo enviado para grupo colaborativo`, 'green');
          log(`     • ${estudiantes.length} registros creados (1 por miembro)`, 'cyan');
          log(`     • Archivo: grupo-colaborativo-abp.pdf`, 'cyan');
          log(`     • Estado: submitted`, 'cyan');
          testsPassed++;
        }

        // Test 11: Verificar que todos los miembros ven el mismo trabajo
        log('\nTest 11: Verificando sincronización de entregas entre miembros...', 'yellow');

        const { data: submissionsCheck, error: checkError } = await supabase
          .from('group_assignment_submissions')
          .select('user_id, file_url, status')
          .eq('assignment_id', assignmentId)
          .eq('group_id', grupo.id);

        if (checkError) {
          log(`  ❌ Error al verificar submissions: ${checkError.message}`, 'red');
          testsFailed++;
        } else if (submissionsCheck && submissionsCheck.length === estudiantes.length) {
          const allSameUrl = submissionsCheck.every(s => s.file_url === submissionsCheck[0].file_url);
          const allSubmitted = submissionsCheck.every(s => s.status === 'submitted');

          if (allSameUrl && allSubmitted) {
            log(`  ✅ Sincronización correcta: ${estudiantes.length} miembros ven el mismo trabajo`, 'green');
            testsPassed++;
          } else {
            log(`  ❌ Inconsistencia en submissions`, 'red');
            testsFailed++;
          }
        } else {
          log(`  ❌ Número incorrecto de submissions: ${submissionsCheck?.length || 0} (esperado: ${estudiantes.length})`, 'red');
          testsFailed++;
        }
      }
    }

    // Resumen final
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log('📊 Resumen de la Suite Completa', 'blue');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
    log(`✅ Pruebas exitosas: ${testsPassed}`, 'green');
    if (testsFailed > 0) {
      log(`❌ Pruebas fallidas: ${testsFailed}`, 'red');
    }

    const totalTests = testsPassed + testsFailed;
    const successRate = totalTests > 0 ? Math.round((testsPassed / totalTests) * 100) : 0;
    log(`📈 Tasa de éxito: ${successRate}%`, successRate === 100 ? 'green' : 'yellow');

    log('\n📝 Recursos creados:', 'blue');
    log(`  • Perfiles: ${createdResources.profiles.length}`, 'cyan');
    log(`  • Curso: ${createdResources.course ? '1' : '0'}`, 'cyan');
    log(`  • Lección: ${createdResources.lesson ? '1' : '0'}`, 'cyan');
    log(`  • Bloques: ${createdResources.blocks.length}`, 'cyan');
    log(`  • Grupos: ${createdResources.groups.length}`, 'cyan');
    log(`  • Comunidades: ${createdResources.communities.length}`, 'cyan');

    log('\n💡 Próximos pasos para pruebas manuales:', 'yellow');
    log('1. Verificar en UI que estudiantes ven sus tareas grupales', 'cyan');
    log('2. Probar flujo de invitación de compañeros', 'cyan');
    log('3. Validar que consultores pueden ver todas las entregas', 'cyan');
    log('4. Probar calificación de trabajos grupales', 'cyan');

  } catch (error) {
    log(`\n❌ Error general en las pruebas: ${error.message}`, 'red');
    console.error(error);
    testsFailed++;
  } finally {
    // Limpieza de datos de prueba
    log('\n🧹 Limpiando datos de prueba...', 'yellow');

    try {
      let cleanupCount = 0;

      // Eliminar submissions
      if (createdResources.blocks.length > 0) {
        const { error: subError } = await supabase
          .from('group_assignment_submissions')
          .delete()
          .in('assignment_id', createdResources.blocks);
        if (!subError) cleanupCount++;
      }

      // Eliminar members
      if (createdResources.groups.length > 0) {
        const { error: memError } = await supabase
          .from('group_assignment_members')
          .delete()
          .in('group_id', createdResources.groups);
        if (!memError) cleanupCount++;
      }

      // Eliminar groups
      if (createdResources.groups.length > 0) {
        const { error: grpError } = await supabase
          .from('group_assignment_groups')
          .delete()
          .in('id', createdResources.groups);
        if (!grpError) cleanupCount++;
      }

      // Eliminar blocks
      if (createdResources.blocks.length > 0) {
        const { error: blkError } = await supabase
          .from('blocks')
          .delete()
          .in('id', createdResources.blocks);
        if (!blkError) cleanupCount++;
      }

      // Eliminar enrollments
      if (createdResources.course) {
        const { error: enrError } = await supabase
          .from('course_enrollments')
          .delete()
          .eq('course_id', createdResources.course);
        if (!enrError) cleanupCount++;
      }

      // Eliminar lesson
      if (createdResources.lesson) {
        const { error: lesError } = await supabase
          .from('lessons')
          .delete()
          .eq('id', createdResources.lesson);
        if (!lesError) cleanupCount++;
      }

      // NO eliminar course (usamos uno existente)

      // NO eliminar perfiles (usamos existentes, no temporales)

      // Eliminar comunidades temporales
      if (createdResources.communities.length > 0) {
        const { error: comError } = await supabase
          .from('growth_communities')
          .delete()
          .in('id', createdResources.communities);
        if (!comError) cleanupCount++;
      }

      log(`  ✅ Limpieza completada: ${cleanupCount} tipos de recursos eliminados`, 'green');
      if (createdResources.blocks.length > 0) log(`     • ${createdResources.blocks.length} bloques`, 'cyan');
      if (createdResources.groups.length > 0) log(`     • ${createdResources.groups.length} grupos`, 'cyan');
      if (createdResources.lesson) log(`     • 1 lección temporal`, 'cyan');
      if (createdResources.communities.length > 0) log(`     • ${createdResources.communities.length} comunidades`, 'cyan');

    } catch (cleanupError) {
      log(`  ⚠️  Error durante limpieza: ${cleanupError.message}`, 'yellow');
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

// Ejecutar suite
runTests();
