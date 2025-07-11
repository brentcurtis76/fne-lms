#!/usr/bin/env node

/**
 * Test Brent's Notification Issue
 * Checks why notifications aren't loading properly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testBrentNotifications() {
  console.log('🧪 Testing Brent\'s Notification Issues\n');

  try {
    // 1. Get Brent's user ID
    console.log('1️⃣ Finding Brent Curtis...');
    const { data: brentProfile } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'brent@perrotuertocm.cl')
      .single();

    if (!brentProfile) {
      console.error('❌ Brent\'s profile not found');
      return;
    }

    const userId = brentProfile.id;
    console.log(`   ✅ Found: ${brentProfile.first_name} ${brentProfile.last_name}`);
    console.log(`   User ID: ${userId}`);

    // 2. Check recent feedback submissions
    console.log('\n2️⃣ Checking recent feedback submissions...');
    const { data: recentFeedback } = await supabase
      .from('feedback')
      .select('id, type, description, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(5);

    console.log(`   Found ${recentFeedback?.length || 0} recent feedback items`);
    
    // 3. Check if notifications were created for feedback
    console.log('\n3️⃣ Checking notifications for feedback...');
    
    for (const feedback of recentFeedback || []) {
      console.log(`\n   Feedback: "${feedback.description.substring(0, 50)}..."`);
      console.log(`   Created: ${new Date(feedback.created_at).toLocaleString()}`);
      
      // Check if admins got notified
      const { data: feedbackNotifs } = await supabase
        .from('user_notifications')
        .select('user_id, title, created_at')
        .eq('related_entity_type', 'feedback')
        .eq('related_entity_id', feedback.id);
        
      if (feedbackNotifs && feedbackNotifs.length > 0) {
        console.log(`   ✅ ${feedbackNotifs.length} notification(s) created`);
        feedbackNotifs.forEach(n => {
          console.log(`      - Sent to user: ${n.user_id === userId ? 'YOU (Brent)' : n.user_id}`);
        });
      } else {
        console.log('   ❌ No notifications created for this feedback');
      }
    }

    // 4. Check all of Brent's notifications
    console.log('\n4️⃣ Fetching all your notifications...');
    const { data: allNotifications, error: notifError } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (notifError) {
      console.error('   ❌ Error fetching notifications:', notifError);
      return;
    }

    console.log(`   ✅ Total notifications: ${allNotifications.length}`);
    console.log(`   📊 Unread: ${allNotifications.filter(n => !n.is_read).length}`);
    console.log(`   📊 Read: ${allNotifications.filter(n => n.is_read).length}`);

    // 5. Show recent notifications
    console.log('\n5️⃣ Your recent notifications:');
    allNotifications.slice(0, 10).forEach((notif, i) => {
      console.log(`\n   ${i + 1}. ${notif.title}`);
      console.log(`      Status: ${notif.is_read ? '✅ Read' : '🔵 Unread'}`);
      console.log(`      Created: ${new Date(notif.created_at).toLocaleString()}`);
      if (notif.description) {
        console.log(`      Details: ${notif.description.substring(0, 80)}...`);
      }
    });

    // 6. Test the API endpoints
    console.log('\n6️⃣ Testing API endpoints...');
    
    // Check if /api/notifications exists
    console.log('   Note: API endpoints require authentication - testing structure only');

    // 7. Check notification types
    console.log('\n7️⃣ Checking notification system configuration...');
    const { data: notifTypes } = await supabase
      .from('notification_types')
      .select('name, category')
      .eq('category', 'feedback');

    console.log(`   Feedback notification types: ${notifTypes?.length || 0}`);
    notifTypes?.forEach(type => {
      console.log(`     - ${type.name}`);
    });

    // Summary
    console.log('\n📊 DIAGNOSIS:');
    
    if (allNotifications.length === 0) {
      console.log('❌ You have NO notifications - this explains why nothing loads');
    } else if (allNotifications.filter(n => !n.is_read).length === 0) {
      console.log('⚠️  All your notifications are marked as read');
    } else {
      console.log('✅ You have notifications that should be visible');
    }

    // Check admin status
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', userId)
      .single();

    console.log(`\n👤 Your role: ${userRole?.role_type || 'No role found'}`);
    
    if (userRole?.role_type === 'admin') {
      console.log('✅ As an admin, you should receive feedback notifications');
    } else {
      console.log('⚠️  You may not receive all notification types');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run test
testBrentNotifications();