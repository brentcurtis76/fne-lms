const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyNotificationTypeFix() {
  console.log('🔧 Applying notification type fixes...\n');
  
  try {
    // First, let's update NULL notification_type_id values based on title patterns
    const nullUpdates = [
      { pattern: '%tarea%', type: 'assignment_created' },
      { pattern: '%curso%', type: 'course_assigned' },
      { pattern: '%mensaje%', type: 'message_received' },
      { pattern: '%comentario%', type: 'message_received' },
      { pattern: '%feedback%', type: 'feedback_received' },
      { pattern: '%consultor%', type: 'consultant_assigned' },
      { pattern: '%aprobad%', type: 'user_approved' },
      { pattern: '%actualiza%', type: 'system_update' },
      { pattern: '%sistema%', type: 'system_update' }
    ];
    
    for (const update of nullUpdates) {
      const { data, error } = await supabase
        .from('user_notifications')
        .update({ notification_type_id: update.type })
        .is('notification_type_id', null)
        .ilike('title', update.pattern);
      
      if (error) {
        console.error(`Error updating notifications with pattern ${update.pattern}:`, error);
      } else {
        console.log(`✅ Updated notifications matching "${update.pattern}" to type "${update.type}"`);
      }
    }
    
    // Set any remaining NULL values to a default type
    const { data: remainingNulls, error: remainingError } = await supabase
      .from('user_notifications')
      .update({ notification_type_id: 'system_update' })
      .is('notification_type_id', null);
    
    if (remainingError) {
      console.error('Error updating remaining NULL notifications:', remainingError);
    } else {
      console.log('✅ Updated remaining NULL notifications to "system_update"');
    }
    
    // Check the final state
    const { data: finalCheck, error: checkError } = await supabase
      .from('user_notifications')
      .select('notification_type_id')
      .is('notification_type_id', null);
    
    if (checkError) {
      console.error('Error checking final state:', checkError);
    } else {
      console.log(`\n✅ Final check: ${finalCheck.length} notifications still have NULL notification_type_id`);
    }
    
    // Get distribution of notification types
    const { data: allNotifs, error: distError } = await supabase
      .from('user_notifications')
      .select('notification_type_id');
    
    if (!distError && allNotifs) {
      const typeCounts = {};
      allNotifs.forEach(n => {
        const typeId = n.notification_type_id || 'NULL';
        typeCounts[typeId] = (typeCounts[typeId] || 0) + 1;
      });
      
      console.log('\n📊 Final notification type distribution:');
      console.table(typeCounts);
    }
    
    console.log('\n✅ Notification type fix completed!');
    
  } catch (error) {
    console.error('Error applying notification type fix:', error);
    process.exit(1);
  }
}

applyNotificationTypeFix()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Script error:', err);
    process.exit(1);
  });