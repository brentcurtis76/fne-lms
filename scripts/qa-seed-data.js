#!/usr/bin/env node
/**
 * QA Seed Data Script for Assessment Builder
 *
 * Creates test data with TEST_QA_ prefix for E2E testing using Supabase JS client.
 * Run AFTER qa-seed-users.js to ensure test users exist.
 *
 * Usage: node scripts/qa-seed-data.js
 */

require('dotenv').config({ path: '.env.test.local' });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function seed() {
  console.log('🌱 Assessment Builder QA - Data Seed Script');
  console.log('==========================================\n');

  // Get test user IDs
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error('Error fetching users:', usersError);
    process.exit(1);
  }

  const adminUser = users.users.find(u => u.email === 'test_qa_admin@test.com');
  const directivoUser = users.users.find(u => u.email === 'test_qa_directivo@test.com');
  const docenteUser = users.users.find(u => u.email === 'test_qa_docente@test.com');

  if (!adminUser || !directivoUser || !docenteUser) {
    console.error('Test users not found. Run qa-seed-users.js first.');
    console.log('  Admin:', adminUser?.id || 'NOT FOUND');
    console.log('  Directivo:', directivoUser?.id || 'NOT FOUND');
    console.log('  Docente:', docenteUser?.id || 'NOT FOUND');
    process.exit(1);
  }

  console.log('Found test users:');
  console.log(`  Admin: ${adminUser.id}`);
  console.log(`  Directivo: ${directivoUser.id}`);
  console.log(`  Docente: ${docenteUser.id}\n`);

  // 1. Get or create TEST_QA_School
  let schoolId;
  const { data: existingSchool } = await supabase
    .from('schools')
    .select('id')
    .eq('name', 'TEST_QA_School')
    .single();

  if (existingSchool) {
    schoolId = existingSchool.id;
    console.log(`Using existing school: ${schoolId}`);
  } else {
    const { data: newSchool, error: schoolError } = await supabase
      .from('schools')
      .insert({ name: 'TEST_QA_School', has_generations: false })
      .select('id')
      .single();

    if (schoolError) {
      console.error('Error creating school:', schoolError);
      process.exit(1);
    }
    schoolId = newSchool.id;
    console.log(`Created school: ${schoolId}`);
  }

  // 2. Create or get TEST_QA_Template
  let templateId;
  const { data: existingTemplate } = await supabase
    .from('assessment_templates')
    .select('id')
    .eq('name', 'TEST_QA_Template_Personalizacion')
    .single();

  if (existingTemplate) {
    templateId = existingTemplate.id;
    console.log(`Using existing template: ${templateId}`);
  } else {
    const { data: newTemplate, error: templateError } = await supabase
      .from('assessment_templates')
      .insert({
        area: 'personalizacion',
        version: '1.0.0',
        name: 'TEST_QA_Template_Personalizacion',
        description: 'Template de prueba para E2E tests del Assessment Builder',
        status: 'draft',
        scoring_config: {
          level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 },
          default_weights: { module: 1.0, indicator: 1.0 }
        },
        created_by: adminUser.id
      })
      .select('id')
      .single();

    if (templateError) {
      console.error('Error creating template:', templateError);
      process.exit(1);
    }
    templateId = newTemplate.id;
    console.log(`Created template: ${templateId}`);
  }

  // 3. Create or get TEST_QA_Modulo_Principal
  let moduleId;
  const { data: existingModule } = await supabase
    .from('assessment_modules')
    .select('id')
    .eq('template_id', templateId)
    .eq('name', 'TEST_QA_Modulo_Principal')
    .single();

  if (existingModule) {
    moduleId = existingModule.id;
    console.log(`Using existing module: ${moduleId}`);
  } else {
    const { data: newModule, error: moduleError } = await supabase
      .from('assessment_modules')
      .insert({
        template_id: templateId,
        name: 'TEST_QA_Modulo_Principal',
        description: 'Modulo de prueba con indicadores de los tres tipos',
        instructions: 'Complete todos los indicadores para evaluar el nivel de personalización',
        display_order: 1,
        weight: 1.0
      })
      .select('id')
      .single();

    if (moduleError) {
      console.error('Error creating module:', moduleError);
      process.exit(1);
    }
    moduleId = newModule.id;
    console.log(`Created module: ${moduleId}`);
  }

  // 4. Create indicators (one of each type)
  const indicatorDefs = [
    {
      code: 'TEST_QA_COB_001',
      name: 'TEST_QA_Indicador_Cobertura',
      description: 'Indicador de prueba tipo cobertura (Sí/No): ¿Existe una política de personalización?',
      category: 'cobertura',
      display_order: 1
    },
    {
      code: 'TEST_QA_FRE_001',
      name: 'TEST_QA_Indicador_Frecuencia',
      description: 'Indicador de prueba tipo frecuencia: ¿Cuántas veces por semestre se realizan evaluaciones personalizadas?',
      category: 'frecuencia',
      frequency_config: { unit: 'veces por semestre', min: 0, max: 20 },
      display_order: 2
    },
    {
      code: 'TEST_QA_PRO_001',
      name: 'TEST_QA_Indicador_Profundidad',
      description: 'Indicador de prueba tipo profundidad: Nivel de madurez en personalización',
      category: 'profundidad',
      level_0_descriptor: 'No existe ninguna práctica de personalización',
      level_1_descriptor: 'Práctica inicial: Se reconoce la necesidad pero no hay implementación',
      level_2_descriptor: 'En desarrollo: Existen iniciativas aisladas sin sistematización',
      level_3_descriptor: 'Práctica avanzada: Hay procesos sistematizados con seguimiento',
      level_4_descriptor: 'Práctica consolidada: La personalización está integrada en toda la cultura escolar',
      display_order: 3
    }
  ];

  const indicatorIds = {};
  for (const def of indicatorDefs) {
    const { data: existing } = await supabase
      .from('assessment_indicators')
      .select('id')
      .eq('code', def.code)
      .single();

    if (existing) {
      indicatorIds[def.category] = existing.id;
      console.log(`Using existing indicator (${def.category}): ${existing.id}`);
    } else {
      const { data: newIndicator, error: indError } = await supabase
        .from('assessment_indicators')
        .insert({
          module_id: moduleId,
          weight: 1.0,
          ...def
        })
        .select('id')
        .single();

      if (indError) {
        console.error(`Error creating indicator ${def.code}:`, indError);
        process.exit(1);
      }
      indicatorIds[def.category] = newIndicator.id;
      console.log(`Created indicator (${def.category}): ${newIndicator.id}`);
    }
  }

  // 5. Create year expectations
  for (const [category, indicatorId] of Object.entries(indicatorIds)) {
    const { data: existing } = await supabase
      .from('assessment_year_expectations')
      .select('id')
      .eq('template_id', templateId)
      .eq('indicator_id', indicatorId)
      .single();

    if (!existing) {
      const { error: expError } = await supabase
        .from('assessment_year_expectations')
        .insert({
          template_id: templateId,
          indicator_id: indicatorId,
          year_1_expected: 1,
          year_2_expected: 2,
          year_3_expected: 2,
          year_4_expected: 3,
          year_5_expected: 4,
          tolerance: 1
        });

      if (expError) {
        console.error(`Error creating expectation for ${category}:`, expError);
      } else {
        console.log(`Created expectation for indicator ${category}`);
      }
    } else {
      console.log(`Using existing expectation for ${category}`);
    }
  }

  // 6. Publish template
  const { error: publishError } = await supabase
    .from('assessment_templates')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: adminUser.id
    })
    .eq('id', templateId);

  if (publishError) {
    console.error('Error publishing template:', publishError);
  } else {
    console.log('Published template');
  }

  // 7. Create snapshot
  // First get full template data
  const { data: templateData } = await supabase
    .from('assessment_templates')
    .select(`
      id, name, area, version, description, scoring_config,
      assessment_modules (
        id, name, description, instructions, display_order, weight,
        assessment_indicators (
          id, code, name, description, category, frequency_config,
          level_0_descriptor, level_1_descriptor, level_2_descriptor,
          level_3_descriptor, level_4_descriptor, display_order, weight
        )
      )
    `)
    .eq('id', templateId)
    .single();

  const { data: expectations } = await supabase
    .from('assessment_year_expectations')
    .select('*')
    .eq('template_id', templateId);

  let snapshotId;
  const { data: existingSnapshot } = await supabase
    .from('assessment_template_snapshots')
    .select('id')
    .eq('template_id', templateId)
    .eq('version', '1.0.0')
    .single();

  if (existingSnapshot) {
    snapshotId = existingSnapshot.id;
    console.log(`Using existing snapshot: ${snapshotId}`);
  } else {
    const snapshotData = {
      template: {
        id: templateData.id,
        name: templateData.name,
        area: templateData.area,
        version: templateData.version,
        description: templateData.description,
        scoring_config: templateData.scoring_config
      },
      modules: templateData.assessment_modules.map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        instructions: m.instructions,
        display_order: m.display_order,
        weight: m.weight,
        indicators: m.assessment_indicators.map(i => ({
          id: i.id,
          code: i.code,
          name: i.name,
          description: i.description,
          category: i.category,
          frequency_config: i.frequency_config,
          level_0_descriptor: i.level_0_descriptor,
          level_1_descriptor: i.level_1_descriptor,
          level_2_descriptor: i.level_2_descriptor,
          level_3_descriptor: i.level_3_descriptor,
          level_4_descriptor: i.level_4_descriptor,
          display_order: i.display_order,
          weight: i.weight
        }))
      })),
      expectations: expectations || []
    };

    const { data: newSnapshot, error: snapError } = await supabase
      .from('assessment_template_snapshots')
      .insert({
        template_id: templateId,
        version: '1.0.0',
        snapshot_data: snapshotData,
        created_by: adminUser.id
      })
      .select('id')
      .single();

    if (snapError) {
      console.error('Error creating snapshot:', snapError);
    } else {
      snapshotId = newSnapshot.id;
      console.log(`Created snapshot: ${snapshotId}`);
    }
  }

  // 8. Create transversal context for test school
  let contextId;
  const { data: existingContext } = await supabase
    .from('school_transversal_context')
    .select('id')
    .eq('school_id', schoolId)
    .single();

  if (existingContext) {
    contextId = existingContext.id;
    console.log(`Using existing context: ${contextId}`);
  } else {
    const { data: newContext, error: contextError } = await supabase
      .from('school_transversal_context')
      .insert({
        school_id: schoolId,
        total_students: 500,
        grade_levels: ['7_basico', '8_basico', '1_medio', '2_medio'],
        courses_per_level: { '7_basico': 2, '8_basico': 2, '1_medio': 2, '2_medio': 2 },
        implementation_year_2026: 3,
        period_system: 'semestral',
        completed_by: directivoUser.id,
        completed_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (contextError) {
      console.error('Error creating context:', contextError);
    } else {
      contextId = newContext.id;
      console.log(`Created context: ${contextId}`);
    }
  }

  // 9. Create course structure
  let courseStructureId;
  if (contextId) {
    const { data: existingCourse } = await supabase
      .from('school_course_structure')
      .select('id')
      .eq('context_id', contextId)
      .eq('grade_level', '7_basico')
      .eq('course_name', '7A')
      .single();

    if (existingCourse) {
      courseStructureId = existingCourse.id;
      console.log(`Using existing course structure: ${courseStructureId}`);
    } else {
      const { data: newCourse, error: courseError } = await supabase
        .from('school_course_structure')
        .insert({
          school_id: schoolId,
          context_id: contextId,
          grade_level: '7_basico',
          course_name: '7A'
        })
        .select('id')
        .single();

      if (courseError) {
        console.error('Error creating course structure:', courseError);
      } else {
        courseStructureId = newCourse.id;
        console.log(`Created course structure: ${courseStructureId}`);
      }
    }
  }

  // 10. Assign docente to course
  if (courseStructureId) {
    const { data: existingAssignment } = await supabase
      .from('school_course_docente_assignments')
      .select('id')
      .eq('course_structure_id', courseStructureId)
      .eq('docente_id', docenteUser.id)
      .single();

    if (!existingAssignment) {
      const { error: assignError } = await supabase
        .from('school_course_docente_assignments')
        .insert({
          course_structure_id: courseStructureId,
          docente_id: docenteUser.id,
          assigned_by: directivoUser.id,
          assigned_at: new Date().toISOString(),
          is_active: true
        });

      if (assignError) {
        console.error('Error assigning docente:', assignError);
      } else {
        console.log('Assigned docente to course');
      }
    } else {
      console.log('Using existing docente assignment');
    }
  }

  // 11. Create assessment instance
  if (snapshotId && courseStructureId) {
    const { data: existingInstance } = await supabase
      .from('assessment_instances')
      .select('id')
      .eq('template_snapshot_id', snapshotId)
      .eq('course_structure_id', courseStructureId)
      .single();

    let instanceId;
    if (existingInstance) {
      instanceId = existingInstance.id;
      console.log(`Using existing instance: ${instanceId}`);
    } else {
      const { data: newInstance, error: instanceError } = await supabase
        .from('assessment_instances')
        .insert({
          template_snapshot_id: snapshotId,
          school_id: schoolId,
          course_structure_id: courseStructureId,
          transformation_year: 3,
          status: 'pending',
          assigned_at: new Date().toISOString(),
          assigned_by: directivoUser.id
        })
        .select('id')
        .single();

      if (instanceError) {
        console.error('Error creating instance:', instanceError);
      } else {
        instanceId = newInstance.id;
        console.log(`Created instance: ${instanceId}`);
      }
    }

    // Create assignee record
    if (instanceId) {
      const { data: existingAssignee } = await supabase
        .from('assessment_instance_assignees')
        .select('id')
        .eq('instance_id', instanceId)
        .eq('user_id', docenteUser.id)
        .single();

      if (!existingAssignee) {
        const { error: assigneeError } = await supabase
          .from('assessment_instance_assignees')
          .insert({
            instance_id: instanceId,
            user_id: docenteUser.id,
            can_edit: true,
            can_submit: true,
            assigned_at: new Date().toISOString(),
            assigned_by: directivoUser.id
          });

        if (assigneeError) {
          console.error('Error creating assignee:', assigneeError);
        } else {
          console.log('Created assignee record');
        }
      } else {
        console.log('Using existing assignee record');
      }
    }
  }

  console.log('\n==========================================');
  console.log('✅ QA data seed complete!');
  console.log('==========================================\n');

  // Show summary
  const { data: summary } = await supabase.rpc('get_qa_seed_summary');
  if (summary) {
    console.log('Summary:', summary);
  }
}

seed().catch(console.error);
