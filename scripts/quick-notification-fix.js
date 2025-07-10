const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function quickFix() {
  console.log('🔧 Quick notification fix...\n');

  try {
    // 1. First check if notification_types table has entries
    const { data: types, error: typesError } = await supabase
      .from('notification_types')
      .select('id')
      .limit(1);

    if (typesError) {
      console.error('❌ Error checking notification_types:', typesError.message);
      console.log('\n⚠️  Please make sure notification_types table exists');
      return;
    }

    if (!types || types.length === 0) {
      console.log('📝 Creating default notification types...');
      
      const defaultTypes = [
        { id: 'general', name: 'Notificación General', description: 'Notificación general del sistema', category: 'general', importance: 'normal', is_active: true },
        { id: 'assignment', name: 'Tarea', description: 'Notificación de tareas y asignaciones', category: 'tareas', importance: 'normal', is_active: true },
        { id: 'message', name: 'Mensaje', description: 'Notificación de mensajes', category: 'mensajes', importance: 'high', is_active: true },
        { id: 'feedback', name: 'Retroalimentación', description: 'Notificación de feedback', category: 'feedback', importance: 'normal', is_active: true },
        { id: 'system', name: 'Sistema', description: 'Notificación del sistema', category: 'sistema', importance: 'low', is_active: true },
        { id: 'course', name: 'Curso', description: 'Notificación de cursos', category: 'cursos', importance: 'normal', is_active: true },
        { id: 'quiz', name: 'Evaluación', description: 'Notificación de evaluaciones', category: 'evaluaciones', importance: 'normal', is_active: true },
        { id: 'group_assignment', name: 'Tarea Grupal', description: 'Notificación de tareas grupales', category: 'tareas', importance: 'normal', is_active: true }
      ];

      const { error: insertError } = await supabase
        .from('notification_types')
        .upsert(defaultTypes, { onConflict: 'id' });

      if (insertError) {
        console.error('❌ Error inserting notification types:', insertError.message);
      } else {
        console.log('✅ Created default notification types');
      }
    } else {
      console.log('✅ Notification types already exist');
    }

    // 2. Update any NULL notification_type_id values
    const { data: nullNotifs, error: nullCheckError } = await supabase
      .from('user_notifications')
      .select('id')
      .is('notification_type_id', null)
      .limit(1);

    if (!nullCheckError && nullNotifs && nullNotifs.length > 0) {
      console.log('\n📝 Updating NULL notification_type_id values...');
      
      const { error: updateError } = await supabase
        .from('user_notifications')
        .update({ notification_type_id: 'general' })
        .is('notification_type_id', null);

      if (updateError) {
        console.error('❌ Error updating NULL types:', updateError.message);
      } else {
        console.log('✅ Updated NULL notification types to "general"');
      }
    } else {
      console.log('✅ No NULL notification_type_id values found');
    }

    // 3. Verify the fix
    console.log('\n🔍 Verifying the fix...');

    const { count: totalCount } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true });

    const { count: nullCount } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true })
      .is('notification_type_id', null);

    console.log(`\n✅ Total notifications: ${totalCount || 0}`);
    console.log(`✅ Notifications with NULL type: ${nullCount || 0}`);

    if (nullCount === 0) {
      console.log('\n✨ Notification system is fixed! All notifications have valid types.');
    } else {
      console.log('\n⚠️  Some notifications still have NULL types. You may need to run the full migration.');
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

quickFix();