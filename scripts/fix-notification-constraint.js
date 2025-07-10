const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log(`
⚠️  MANUAL FIX REQUIRED - Please run the following SQL in Supabase SQL Editor:

-- 1. Make notification_type_id nullable
ALTER TABLE user_notifications 
ALTER COLUMN notification_type_id DROP NOT NULL;

-- 2. Insert default notification types
INSERT INTO notification_types (id, name, description, category, importance, is_active) 
VALUES 
    ('general', 'Notificación General', 'Notificación general del sistema', 'general', 'normal', true),
    ('assignment', 'Tarea', 'Notificación de tareas y asignaciones', 'tareas', 'normal', true),
    ('message', 'Mensaje', 'Notificación de mensajes', 'mensajes', 'high', true),
    ('feedback', 'Retroalimentación', 'Notificación de feedback', 'feedback', 'normal', true),
    ('system', 'Sistema', 'Notificación del sistema', 'sistema', 'low', true),
    ('course', 'Curso', 'Notificación de cursos', 'cursos', 'normal', true),
    ('quiz', 'Evaluación', 'Notificación de evaluaciones', 'evaluaciones', 'normal', true),
    ('group_assignment', 'Tarea Grupal', 'Notificación de tareas grupales', 'tareas', 'normal', true)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_active = true;

-- 3. Update NULL notification_type_id to 'general'
UPDATE user_notifications 
SET notification_type_id = 'general'
WHERE notification_type_id IS NULL;

-- 4. Verify the fix
SELECT 
    COUNT(*) as total_notifications,
    COUNT(CASE WHEN notification_type_id IS NULL THEN 1 END) as null_types
FROM user_notifications;

📝 After running this SQL, all notifications should have valid types.
`);

// Test current state
async function checkStatus() {
  console.log('\n🔍 Current Status:\n');
  
  const { count: totalCount } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true });

  const { count: nullCount } = await supabase
    .from('user_notifications')
    .select('*', { count: 'exact', head: true })
    .is('notification_type_id', null);

  console.log(`Total notifications: ${totalCount || 0}`);
  console.log(`Notifications with NULL type: ${nullCount || 0}`);
  
  if (nullCount > 0) {
    console.log('\n⚠️  Please run the SQL above in Supabase to fix the issue.');
  }
}

checkStatus();