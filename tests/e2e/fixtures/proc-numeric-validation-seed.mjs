import { createClient } from '@supabase/supabase-js';

const url = process.env.API_URL;
const key = process.env.SERVICE_ROLE_KEY;
const password = process.env.PROC_B003_PASSWORD;
if (url !== 'http://127.0.0.1:55621' || !key || !password) throw new Error('PROC-B003 isolated target required');
const db = createClient(url, key, { auth: { persistSession: false } });
const id = (suffix) => `b0030000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const school = 903003;
const config = { min: 0.1, max: 3.1, step: 0.1, unit: 'semana', allowed_units: ['semana'] };
const users = [
  { email: 'admin-proc-b003@example.test', role: 'admin', name: 'Admin Sintético' },
  { email: 'docente-proc-b003@example.test', role: 'docente', name: 'Docente Sintético' },
];

async function insert(table, row) {
  const { error } = await db.from(table).insert(row);
  if (error) throw new Error(`${table}: ${error.message}`);
}

await insert('schools', { id: school, name: 'Colegio sintético PROC-B003', tenant_kind: 'qa' });
const userIds = {};
for (const [index, user] of users.entries()) {
  const { data, error } = await db.auth.admin.createUser({ email: user.email, password, email_confirm: true });
  if (error || !data?.user) throw new Error(`auth ${user.role}: ${error?.message}`);
  userIds[user.role] = data.user.id;
  await insert('profiles', {
    id: data.user.id, email: user.email, name: user.name,
    first_name: user.name.split(' ')[0], last_name: 'Sintético',
    school_id: school, approval_status: 'approved', must_change_password: false,
  });
  await insert('user_roles', { id: id(71 + index), user_id: data.user.id, role_type: user.role, school_id: school, is_active: true });
}

// Templates 3..12 are unpublished drafts: each full run publishes two, leaving fresh pairs for reruns and PM replay.
for (let suffix = 1; suffix <= 12; suffix++) {
  const template = id(10 + suffix), objective = id(80 + suffix);
  const module = id(20 + suffix), indicator = id(30 + suffix);
  const snapshot = id(40 + suffix);
  await insert('assessment_templates', {
    id: template, area: 'personalizacion', version: '1.0.0',
    name: `Plantilla sintética ${suffix}`, status: 'draft',
    is_archived: false, created_by: userIds.admin,
  });
  await insert('assessment_objectives', { id: objective, template_id: template, name: 'Proceso sintético', display_order: 1, weight: 1 });
  await insert('assessment_modules', { id: module, template_id: template, objective_id: objective, name: 'Acción sintética', display_order: 1, weight: 1 });
  await insert('assessment_indicators', {
    id: id(90 + suffix), module_id: module, code: `C${suffix}`,
    name: `Cobertura sintética ${suffix}`, category: 'cobertura', display_order: 1, weight: 1,
  });
  await insert('assessment_indicators', {
    id: indicator, module_id: module, code: `F${suffix}`, name: `Frecuencia sintética ${suffix}`,
    category: 'frecuencia', display_order: 2, weight: 1,
    frequency_config: { ...config, step: 4 }, frequency_unit_options: ['semana'],
  });
  if (suffix > 2) continue;
  await insert('assessment_template_snapshots', {
    id: snapshot, template_id: template, version: '1.0.0', created_by: userIds.admin,
    snapshot_data: {
      template: { id: template, name: `Plantilla sintética ${suffix}`, area: 'personalizacion' },
      modules: [{ id: module, name: 'Acción sintética', display_order: 1, weight: 1,
        indicators: [{ id: indicator, code: `F${suffix}`, name: `Frecuencia sintética ${suffix}`,
          category: 'frecuencia', display_order: 1, weight: 1, frequency_config: config }] }],
    },
  });
  for (const offset of [52, 54, 56, 58, 60, 62, 64]) {
    const instance = id(offset + suffix);
    await insert('assessment_instances', {
      id: instance, template_snapshot_id: snapshot, school_id: school,
      transformation_year: 1, generation_type: 'GT', status: 'pending', assigned_by: userIds.admin,
    });
    await insert('assessment_instance_assignees', {
      id: id(offset + 10 + suffix), instance_id: instance, user_id: userIds.docente,
      can_edit: true, can_submit: true, assigned_by: userIds.admin,
    });
  }
}
console.log('PROC-B003 fixture: 2 synthetic users, 1 school, 2 roles, 12 templates, 14 instances');
