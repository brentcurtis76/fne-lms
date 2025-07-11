const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndAddCourseAssignedTrigger() {
  console.log('Checking notification_triggers table...');

  try {
    // First check if the trigger already exists
    const { data: existingTrigger, error: checkError } = await supabase
      .from('notification_triggers')
      .select('*')
      .eq('event_type', 'course_assigned')
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking for existing trigger:', checkError);
      return;
    }

    if (existingTrigger) {
      console.log('⚠️  course_assigned trigger already exists:');
      console.log(JSON.stringify(existingTrigger, null, 2));
      
      // Update it instead
      const { data: updateData, error: updateError } = await supabase
        .from('notification_triggers')
        .update({
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
          },
          updated_at: new Date().toISOString()
        })
        .eq('event_type', 'course_assigned')
        .select()
        .single();

      if (updateError) {
        console.error('Error updating trigger:', updateError);
        return;
      }

      console.log('✅ Successfully updated course_assigned notification trigger');
      console.log(JSON.stringify(updateData, null, 2));
      return;
    }

    // Insert the new trigger
    const { data: insertData, error: insertError } = await supabase
      .from('notification_triggers')
      .insert({
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
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting trigger:', insertError);
      return;
    }

    console.log('✅ Successfully added course_assigned notification trigger');
    console.log('\n📋 Trigger details:');
    console.log(JSON.stringify(insertData, null, 2));

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Also check all existing triggers
async function listAllTriggers() {
  const { data, error } = await supabase
    .from('notification_triggers')
    .select('event_type, category, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing triggers:', error);
    return;
  }

  console.log('\n📊 All notification triggers:');
  data.forEach(trigger => {
    console.log(`- ${trigger.event_type} (${trigger.category}) - Created: ${trigger.created_at}`);
  });
}

async function main() {
  await checkAndAddCourseAssignedTrigger();
  await listAllTriggers();
}

main();