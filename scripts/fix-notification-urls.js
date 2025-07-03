/**
 * Script to fix existing notification URLs for non-admin users
 * This will update notifications that point to admin-only pages
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixNotificationUrls() {
  console.log('🔧 Starting notification URL fix...\n');

  try {
    // Step 1: Get all non-admin users
    const { data: nonAdminUsers, error: userError } = await supabase
      .from('profiles')
      .select('id, role, email')
      .neq('role', 'admin');

    if (userError) {
      console.error('❌ Error fetching non-admin users:', userError);
      return;
    }

    console.log(`📊 Found ${nonAdminUsers.length} non-admin users\n`);

    // Step 2: For each non-admin user, find notifications with admin URLs
    let totalFixed = 0;
    
    for (const user of nonAdminUsers) {
      const { data: notifications, error: notifError } = await supabase
        .from('user_notifications')
        .select('id, related_url, title')
        .eq('user_id', user.id)
        .or('related_url.like./admin/%,related_url.like./configuracion%,related_url.like./usuarios%,related_url.like./gestion%')
        .not('related_url', 'is', null);

      if (notifError) {
        console.error(`❌ Error fetching notifications for user ${user.email}:`, notifError);
        continue;
      }

      if (notifications && notifications.length > 0) {
        console.log(`\n👤 User: ${user.email} (${user.role})`);
        console.log(`   Found ${notifications.length} notifications with admin URLs`);

        // Update these notifications to remove the URL
        const notificationIds = notifications.map(n => n.id);
        
        const { error: updateError } = await supabase
          .from('user_notifications')
          .update({ related_url: null })
          .in('id', notificationIds);

        if (updateError) {
          console.error(`   ❌ Error updating notifications:`, updateError);
        } else {
          console.log(`   ✅ Fixed ${notifications.length} notifications`);
          totalFixed += notifications.length;
          
          // Log some examples
          notifications.slice(0, 3).forEach(n => {
            console.log(`      - "${n.title}" (was: ${n.related_url})`);
          });
          if (notifications.length > 3) {
            console.log(`      ... and ${notifications.length - 3} more`);
          }
        }
      }
    }

    console.log(`\n✅ Fix complete! Updated ${totalFixed} notifications total.`);
    
    // Step 3: Show summary of remaining admin URLs (should only be for admin users)
    const { data: remainingAdminUrls, error: remainingError } = await supabase
      .from('user_notifications')
      .select('id')
      .or('related_url.like./admin/%,related_url.like./configuracion%,related_url.like./usuarios%,related_url.like./gestion%')
      .not('related_url', 'is', null);

    if (!remainingError && remainingAdminUrls) {
      console.log(`\n📊 Remaining notifications with admin URLs: ${remainingAdminUrls.length}`);
      console.log('   (These should all belong to admin users)');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the fix
fixNotificationUrls();