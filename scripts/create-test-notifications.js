const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestNotifications() {
  console.log('Creating test notifications for admin user...\n');
  
  try {
    // 1. Get admin user ID
    const { data: adminProfile, error: adminError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', 'brentcurtis76@gmail.com')
      .single();
    
    if (adminError || !adminProfile) {
      console.error('❌ Error finding admin user:', adminError?.message);
      return;
    }
    
    const adminId = adminProfile.id;
    console.log('✅ Admin user ID:', adminId);
    
    // 2. Create test notifications
    const testNotifications = [
      {
        user_id: adminId,
        notification_type_id: 'system_update',
        title: 'Bienvenido al nuevo sistema de notificaciones',
        description: 'Hemos actualizado el sistema de notificaciones para mejorar tu experiencia.',
        related_url: '/dashboard',
        is_read: false
      },
      {
        user_id: adminId,
        notification_type_id: 'course_completed',
        title: 'Curso completado: Introducción a la Plataforma',
        description: 'Felicitaciones por completar el curso. Ya puedes acceder a tu certificado.',
        related_url: '/cursos',
        is_read: false
      },
      {
        user_id: adminId,
        notification_type_id: 'assignment_created',
        title: 'Nueva tarea asignada: Revisión del Sistema',
        description: 'Se te ha asignado una nueva tarea con fecha de vencimiento 10 de julio.',
        related_url: '/tareas',
        is_read: true
      },
      {
        user_id: adminId,
        notification_type_id: 'user_approved',
        title: 'Nuevo usuario aprobado',
        description: 'Has aprobado exitosamente el acceso de María González a la plataforma.',
        related_url: '/usuarios',
        is_read: false
      },
      {
        user_id: adminId,
        notification_type_id: 'feedback_received',
        title: 'Nuevo feedback recibido',
        description: 'Un usuario ha enviado comentarios sobre el sistema de cursos.',
        related_url: '/admin/feedback',
        is_read: false
      }
    ];
    
    console.log('\n📝 Creating notifications...');
    
    const { data, error } = await supabase
      .from('user_notifications')
      .insert(testNotifications)
      .select();
    
    if (error) {
      console.error('❌ Error creating notifications:', error.message);
    } else {
      console.log('✅ Successfully created', data.length, 'notifications');
      console.log('\nCreated notifications:');
      data.forEach(n => {
        console.log(`- ${n.title} (${n.is_read ? 'read' : 'unread'})`);
      });
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

createTestNotifications();