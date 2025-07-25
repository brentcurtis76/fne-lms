const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function examineNotificationsCorrectSchema() {
  console.log('🔍 EXAMINING NOTIFICATIONS WITH CORRECT SCHEMA\n');
  
  try {
    // 1. Get recent notifications using correct schema
    console.log('🕒 RECENT NOTIFICATIONS:');
    console.log('=' * 50);
    
    const { data: recent, error: recentError } = await supabase
      .from('notifications')
      .select('id, type, title, message, entity_type, entity_id, metadata, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentError) {
      console.error('❌ Error fetching recent notifications:', recentError);
    } else if (recent && recent.length > 0) {
      recent.forEach((notification, index) => {
        console.log(`\n${index + 1}. Notification ID: ${notification.id}`);
        console.log(`   Type: ${notification.type}`);
        console.log(`   Title: ${notification.title}`);
        console.log(`   Message: ${notification.message}`);
        console.log(`   Entity Type: ${notification.entity_type || '❌ NULL'}`);
        console.log(`   Entity ID: ${notification.entity_id || '❌ NULL'}`);
        console.log(`   Metadata: ${notification.metadata ? JSON.stringify(notification.metadata) : '❌ NULL/EMPTY'}`);
        console.log(`   Created: ${notification.created_at}`);
        console.log(`   User ID: ${notification.user_id}`);
      });
    } else {
      console.log('   ⚠️  No notifications found');
    }

    // 2. Count total notifications
    const { count, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true });

    if (!countError) {
      console.log(`\n📊 Total notifications: ${count}`);
    } else {
      console.error('Error getting count:', countError);
    }

    // 3. Check for feedback-related notifications
    console.log('\n\n💬 FEEDBACK-RELATED NOTIFICATIONS:');
    console.log('=' * 50);
    
    const { data: feedbackNotifs, error: feedbackError } = await supabase
      .from('notifications')
      .select('*')
      .or('type.eq.new_feedback,type.eq.assignment_feedback,title.ilike.%feedback%,message.ilike.%feedback%')
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
          console.log(`   Message: ${notification.message}`);
          console.log(`   Entity Type: ${notification.entity_type || '❌ NULL'}`);
          console.log(`   Entity ID: ${notification.entity_id || '❌ NULL'}`);
          console.log(`   Metadata: ${notification.metadata ? JSON.stringify(notification.metadata) : '❌ NULL/EMPTY'}`);
          console.log(`   Created: ${notification.created_at}`);
        });
      }
    }

    // 4. Analyze metadata structure to understand URL patterns
    console.log('\n\n🔧 METADATA ANALYSIS FOR URL PATTERNS:');
    console.log('=' * 50);
    
    const { data: withMetadata, error: metadataError } = await supabase
      .from('notifications')
      .select('type, metadata')
      .not('metadata', 'eq', '{}')
      .limit(20);

    if (metadataError) {
      console.error('❌ Error fetching metadata:', metadataError);
    } else if (withMetadata && withMetadata.length > 0) {
      const metadataPatterns = {};
      withMetadata.forEach(notif => {
        if (!metadataPatterns[notif.type]) {
          metadataPatterns[notif.type] = [];
        }
        metadataPatterns[notif.type].push(notif.metadata);
      });

      console.log('📋 Metadata patterns by notification type:');
      Object.entries(metadataPatterns).forEach(([type, patterns]) => {
        console.log(`\n   Type: ${type}`);
        patterns.slice(0, 3).forEach((pattern, index) => {
          console.log(`     ${index + 1}. ${JSON.stringify(pattern)}`);
        });
        if (patterns.length > 3) {
          console.log(`     ... and ${patterns.length - 3} more examples`);
        }
      });
    } else {
      console.log('   ⚠️  No notifications with metadata found');
    }

    // 5. Check notification triggers and how URLs should be generated
    console.log('\n\n🔔 NOTIFICATION URL TEMPLATE ANALYSIS:');
    console.log('=' * 50);
    
    const { data: triggers, error: triggersError } = await supabase
      .from('notification_triggers')
      .select('event_type, notification_template, category')
      .order('event_type');

    if (!triggersError && triggers) {
      console.log('📋 URL Templates by trigger type:');
      triggers.forEach(trigger => {
        const urlTemplate = trigger.notification_template?.url_template;
        console.log(`\n   ${trigger.event_type} (${trigger.category}):`);
        console.log(`   └─ URL: ${urlTemplate || '❌ NO URL TEMPLATE'}`);
        
        if (urlTemplate) {
          // Extract placeholders
          const placeholders = urlTemplate.match(/\{([^}]+)\}/g) || [];
          if (placeholders.length > 0) {
            console.log(`   └─ Placeholders: ${placeholders.join(', ')}`);
          }
        }
      });
    }

    // 6. Look for any notifications that might have URL-like data in metadata
    console.log('\n\n🔗 CHECKING METADATA FOR URL PATTERNS:');
    console.log('=' * 50);
    
    if (withMetadata && withMetadata.length > 0) {
      let urlCount = 0;
      withMetadata.forEach(notif => {
        const metaStr = JSON.stringify(notif.metadata);
        if (metaStr.includes('url') || metaStr.includes('link') || metaStr.includes('/')) {
          urlCount++;
          console.log(`   ${notif.type}: ${metaStr}`);
        }
      });
      
      if (urlCount === 0) {
        console.log('   ⚠️  No URL patterns found in metadata');
      } else {
        console.log(`\n   ✅ Found ${urlCount} notifications with potential URL patterns`);
      }
    }

    // 7. Summary
    console.log('\n\n📊 SUMMARY:');
    console.log('=' * 50);
    console.log(`📊 Total notifications in database: ${count || 0}`);
    console.log(`💬 Feedback-related notifications: ${feedbackNotifs ? feedbackNotifs.length : 0}`);
    console.log(`🔧 Notifications with metadata: ${withMetadata ? withMetadata.length : 0}`);
    
    console.log('\n🔍 KEY FINDINGS:');
    console.log(`   ✅ notifications table uses entity_type/entity_id, NOT related_url`);
    console.log(`   ✅ URL generation should come from notification_triggers templates`);
    console.log(`   ✅ metadata column available for storing additional URL info`);
    
    if (count === 0) {
      console.log('\n⚠️  ISSUE: No notifications exist in database');
      console.log('   This suggests either:');
      console.log('   - Notification system has not been triggered');
      console.log('   - Notifications are being created in a different table');
      console.log('   - Notification creation is failing silently');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

async function main() {
  await examineNotificationsCorrectSchema();
}

main();