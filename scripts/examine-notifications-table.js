const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function examineNotificationsTable() {
  console.log('🔍 EXAMINING NOTIFICATIONS TABLE STRUCTURE\n');
  
  try {
    // 1. Get table structure by attempting to select all columns
    console.log('📊 NOTIFICATIONS TABLE STRUCTURE:');
    console.log('=' * 50);
    
    const { data: sample, error: sampleError } = await supabase
      .from('notifications')
      .select('*')
      .limit(1);

    if (sampleError) {
      console.error('❌ Error fetching notifications sample:', sampleError);
      return;
    }

    if (sample && sample.length > 0) {
      console.log('✅ Table columns found:');
      Object.keys(sample[0]).forEach(column => {
        console.log(`   - ${column}: ${typeof sample[0][column]} (${sample[0][column] !== null ? 'has data' : 'null'})`);
      });
      
      console.log('\n📋 Sample notification:');
      console.log(JSON.stringify(sample[0], null, 2));
    } else {
      console.log('⚠️  Table is empty, trying to get structure via error...');
      
      // Try to select a non-existent column to get actual column list
      const { error: structureError } = await supabase
        .from('notifications')
        .select('non_existent_column');
      
      console.log('Structure error message:', structureError?.message);
    }

    // 2. Count total notifications
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`\n📊 Total notifications: ${count}`);
    }

    // 3. Get recent notifications with all available columns
    console.log('\n\n🕒 RECENT NOTIFICATIONS:');
    console.log('=' * 50);
    
    const { data: recent, error: recentError } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) {
      console.error('❌ Error fetching recent notifications:', recentError);
    } else if (recent && recent.length > 0) {
      recent.forEach((notification, index) => {
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
      console.log('   ⚠️  No recent notifications found');
    }

    // 4. Check specifically for null related_url using correct column structure
    console.log('\n\n🚨 NOTIFICATIONS WITH NULL RELATED_URL:');
    console.log('=' * 50);
    
    const { data: nullUrls, error: nullError } = await supabase
      .from('notifications')
      .select('*')
      .is('related_url', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (nullError) {
      console.error('❌ Error fetching null URL notifications:', nullError);
    } else {
      console.log(`✅ Found ${nullUrls ? nullUrls.length : 0} notifications with null related_url`);
      
      if (nullUrls && nullUrls.length > 0) {
        nullUrls.forEach((notification, index) => {
          console.log(`\n${index + 1}. ID: ${notification.id}`);
          console.log(`   Type: ${notification.type}`);
          console.log(`   Title: ${notification.title}`);
          console.log(`   Message: ${notification.message || notification.content || 'N/A'}`);
          console.log(`   Related URL: ${notification.related_url || '❌ NULL'}`);
          console.log(`   Created: ${notification.created_at}`);
        });
      }
    }

    // 5. Check for feedback-related notifications
    console.log('\n\n💬 FEEDBACK-RELATED NOTIFICATIONS:');
    console.log('=' * 50);
    
    const { data: feedbackNotifs, error: feedbackError } = await supabase
      .from('notifications')
      .select('*')
      .or('type.eq.new_feedback,title.ilike.%feedback%,type.eq.assignment_feedback')
      .order('created_at', { ascending: false })
      .limit(10);

    if (feedbackError) {
      console.error('❌ Error fetching feedback notifications:', feedbackError);
    } else {
      console.log(`✅ Found ${feedbackNotifs ? feedbackNotifs.length : 0} feedback-related notifications`);
      
      if (feedbackNotifs && feedbackNotifs.length > 0) {
        feedbackNotifs.forEach((notification, index) => {
          console.log(`\n${index + 1}. ID: ${notification.id}`);
          console.log(`   Type: ${notification.type}`);
          console.log(`   Title: ${notification.title}`);
          console.log(`   Related URL: ${notification.related_url || '❌ NULL'}`);
          console.log(`   Created: ${notification.created_at}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

async function main() {
  await examineNotificationsTable();
}

main();