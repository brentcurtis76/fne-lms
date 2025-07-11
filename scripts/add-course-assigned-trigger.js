const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addCourseAssignedTrigger() {
  console.log('Adding course_assigned notification trigger...');

  try {
    // Insert the new trigger
    const { data: insertData, error: insertError } = await supabase
      .from('notification_triggers')
      .upsert({
        event_type: 'course_assigned',
        notification_template: {
          title_template: "Nuevo curso asignado",
          description_template: "Se te ha asignado el curso '{course_name}'",
          url_template: "/student/course/{course_id}",
          importance: "normal"
        },
        category: 'cursos',
        trigger_condition: {
          enabled: true,
          immediate: true
        }
      }, {
        onConflict: 'event_type'
      });

    if (insertError) {
      console.error('Error inserting trigger:', insertError);
      return;
    }

    console.log('✅ Successfully added course_assigned notification trigger');

    // Verify it was created
    const { data: verifyData, error: verifyError } = await supabase
      .from('notification_triggers')
      .select('*')
      .eq('event_type', 'course_assigned')
      .single();

    if (verifyError) {
      console.error('Error verifying trigger:', verifyError);
      return;
    }

    console.log('\n📋 Trigger details:');
    console.log(JSON.stringify(verifyData, null, 2));

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

addCourseAssignedTrigger();