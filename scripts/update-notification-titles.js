/**
 * Script to retroactively update existing notifications with course names
 * Run with: node scripts/update-notification-titles.js
 */

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate required environment variables
if (!supabaseUrl) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  console.error('Please ensure it is set in your .env.local file');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('Please ensure it is set in your .env.local file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateNotifications() {
  console.log('🔍 Finding course assignment notifications...');

  // Get all "Nuevo curso asignado" notifications
  const { data: notifications, error } = await supabase
    .from('user_notifications')
    .select('id, user_id, title, description, related_url, created_at')
    .eq('title', 'Nuevo curso asignado')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching notifications:', error);
    return;
  }

  const count = notifications ? notifications.length : 0;
  console.log(`Found ${count} generic "Nuevo curso asignado" notifications`);

  if (count === 0) {
    console.log('No notifications to update');
    return;
  }

  // Get all course assignments to find which course was assigned to which user
  const userIds = [...new Set(notifications.map(n => n.user_id))];
  console.log(`Looking up course assignments for ${userIds.length} users...`);

  // Get recent course assignments
  const { data: assignments, error: assignError } = await supabase
    .from('course_assignments')
    .select(`
      teacher_id,
      course_id,
      assigned_at,
      courses (id, title)
    `)
    .in('teacher_id', userIds)
    .order('assigned_at', { ascending: false });

  if (assignError) {
    console.error('Error fetching assignments:', assignError);
    return;
  }

  console.log(`Found ${assignments ? assignments.length : 0} course assignments`);

  // Create a map of user_id + approximate time -> course name
  const assignmentMap = new Map();
  if (assignments) {
    for (const a of assignments) {
      const key = `${a.teacher_id}`;
      if (!assignmentMap.has(key)) {
        assignmentMap.set(key, []);
      }
      assignmentMap.get(key).push({
        courseId: a.course_id,
        courseName: a.courses ? a.courses.title : null,
        assignedAt: new Date(a.assigned_at)
      });
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const notif of notifications) {
    const userAssignments = assignmentMap.get(notif.user_id) || [];
    const notifDate = new Date(notif.created_at);

    // Find the assignment closest to the notification time (within 1 hour)
    let bestMatch = null;
    let bestDiff = Infinity;

    for (const assignment of userAssignments) {
      const diff = Math.abs(notifDate - assignment.assignedAt);
      if (diff < bestDiff && diff < 3600000) { // Within 1 hour
        bestDiff = diff;
        bestMatch = assignment;
      }
    }

    if (bestMatch && bestMatch.courseName) {
      const newTitle = `Nuevo curso asignado: ${bestMatch.courseName}`;
      const newDescription = `Se te ha asignado el curso "${bestMatch.courseName}". Haz clic para comenzar tu aprendizaje.`;

      const { error: updateError } = await supabase
        .from('user_notifications')
        .update({
          title: newTitle,
          description: newDescription
        })
        .eq('id', notif.id);

      if (updateError) {
        console.error(`Error updating notification ${notif.id}:`, updateError);
        skipped++;
      } else {
        console.log(`✅ Updated: "${newTitle}"`);
        updated++;
      }
    } else {
      // No matching assignment found - just improve the description
      const newDescription = 'Se te ha asignado un nuevo curso. Visita Mi Aprendizaje para verlo.';

      const { error: updateError } = await supabase
        .from('user_notifications')
        .update({ description: newDescription })
        .eq('id', notif.id);

      if (!updateError) {
        console.log(`📝 Updated description for notification ${notif.id} (no course match found)`);
        updated++;
      } else {
        skipped++;
      }
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total: ${count}`);
}

updateNotifications()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
