const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function examineUserNotificationsTable() {
  console.log('🔍 EXAMINING USER_NOTIFICATIONS TABLE\n');
  
  try {
    // 1. Get recent notifications from user_notifications table
    console.log('🕒 RECENT NOTIFICATIONS FROM USER_NOTIFICATIONS:');
    console.log('=' * 50);
    
    const { data: recentUserNotifs, error: recentError } = await supabase
      .from('user_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('❌ Error fetching user_notifications:', recentError);
    } else if (recentUserNotifs && recentUserNotifs.length > 0) {
      recentUserNotifs.forEach((notification, index) => {
        console.log(`\n${index + 1}. Notification ID: ${notification.id}`);
        Object.entries(notification).forEach(([key, value]) => {
          if (key === 'related_url') {
            console.log(`   ${key}: ${value || '❌ NULL/EMPTY'}`);
          } else {
            console.log(`   ${key}: ${value}`);
          }
        });
      });
    } else {
      console.log('   ⚠️  No notifications found in user_notifications table');
    }

    // 2. Count total user notifications
    const { count: userCount, error: userCountError } = await supabase
      .from('user_notifications')
      .select('*', { count: 'exact', head: true });

    if (!userCountError) {
      console.log(`\n📊 Total user_notifications: ${userCount}`);
    } else {
      console.error('Error getting user_notifications count:', userCountError);
    }

    // 3. Check for notifications with null related_url
    console.log('\n\n🚨 USER_NOTIFICATIONS WITH NULL RELATED_URL:');
    console.log('=' * 50);
    
    const { data: nullUrls, error: nullError } = await supabase
      .from('user_notifications')
      .select('*')
      .is('related_url', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (nullError) {
      console.error('❌ Error fetching null URL notifications:', nullError);
    } else {
      console.log(`✅ Found ${nullUrls ? nullUrls.length : 0} user_notifications with null related_url`);
      
      if (nullUrls && nullUrls.length > 0) {
        nullUrls.forEach((notification, index) => {
          console.log(`\n${index + 1}. ID: ${notification.id}`);
          console.log(`   Category: ${notification.category}`);
          console.log(`   Title: ${notification.title}`);
          console.log(`   Description: ${notification.description}`);
          console.log(`   Related URL: ${notification.related_url || '❌ NULL'}`);
          console.log(`   Created: ${notification.created_at}`);
          console.log(`   User ID: ${notification.user_id}`);
        });
      }
    }

    // 4. Check for feedback-related notifications
    console.log('\n\n💬 FEEDBACK-RELATED USER_NOTIFICATIONS:');
    console.log('=' * 50);
    
    const { data: feedbackNotifs, error: feedbackError } = await supabase
      .from('user_notifications')
      .select('*')
      .or('category.eq.system,title.ilike.%feedback%,description.ilike.%feedback%')
      .order('created_at', { ascending: false })
      .limit(10);

    if (feedbackError) {
      console.error('❌ Error fetching feedback notifications:', feedbackError);
    } else {
      console.log(`✅ Found ${feedbackNotifs ? feedbackNotifs.length : 0} potential feedback-related notifications`);
      
      if (feedbackNotifs && feedbackNotifs.length > 0) {
        feedbackNotifs.forEach((notification, index) => {
          console.log(`\n${index + 1}. ID: ${notification.id}`);
          console.log(`   Category: ${notification.category}`);
          console.log(`   Title: ${notification.title}`);
          console.log(`   Description: ${notification.description}`);
          console.log(`   Related URL: ${notification.related_url || '❌ NULL'}`);
          console.log(`   Created: ${notification.created_at}`);
        });
      }
    }

    // 5. Check both tables to understand relationship
    console.log('\n\n📋 TABLE COMPARISON SUMMARY:');
    console.log('=' * 50);
    
    const { count: oldNotifCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 notifications table: ${oldNotifCount || 0} records`);
    console.log(`📊 user_notifications table: ${userCount || 0} records`);
    
    if (oldNotifCount > 0 && userCount > 0) {
      console.log('\n⚠️  Both tables have data - potential migration in progress');
    } else if (oldNotifCount === 0 && userCount > 0) {
      console.log('\n✅ System is using user_notifications table (current)');
    } else if (oldNotifCount > 0 && userCount === 0) {
      console.log('\n⚠️  System might still be using old notifications table');
    } else {
      console.log('\n⚠️  No notifications found in either table');
    }

    // 6. Summary analysis
    console.log('\n\n📊 RELATED_URL NULL ANALYSIS:');
    console.log('=' * 50);
    
    if (nullUrls && nullUrls.length > 0) {
      console.log(`🚨 IDENTIFIED: ${nullUrls.length} notifications with null related_url`);
      
      // Group by category to understand patterns
      const nullByCategory = {};
      nullUrls.forEach(notif => {
        const cat = notif.category || 'unknown';
        if (!nullByCategory[cat]) nullByCategory[cat] = 0;
        nullByCategory[cat]++;
      });
      
      console.log('\n📊 Null URLs by category:');
      Object.entries(nullByCategory).forEach(([category, count]) => {
        console.log(`   ${category}: ${count} notifications`);
      });
      
      // Look for patterns in the titles
      console.log('\n🔍 Common title patterns for null URLs:');
      const titlePatterns = {};
      nullUrls.forEach(notif => {
        const title = notif.title;
        if (title) {
          if (!titlePatterns[title]) titlePatterns[title] = 0;
          titlePatterns[title]++;
        }
      });
      
      Object.entries(titlePatterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([title, count]) => {
          console.log(`   "${title}": ${count} occurrences`);
        });
    } else {
      console.log('✅ No notifications with null related_url found');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

async function main() {
  await examineUserNotificationsTable();
}

main();