const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function examineNotificationTables() {
  console.log('🔍 EXAMINING NOTIFICATION SYSTEM CONFIGURATION\n');
  
  try {
    // 1. Check notification_templates table
    console.log('📋 NOTIFICATION TEMPLATES:');
    console.log('=' * 50);
    
    const { data: templates, error: templatesError } = await supabase
      .from('notification_templates')
      .select('*')
      .order('type');

    if (templatesError) {
      console.error('❌ Error fetching templates:', templatesError);
    } else if (templates && templates.length > 0) {
      templates.forEach((template, index) => {
        console.log(`\n${index + 1}. Type: ${template.type}`);
        console.log(`   Title: ${template.title_template || 'NOT SET'}`);
        console.log(`   Description: ${template.description_template || 'NOT SET'}`);
        console.log(`   URL Template: ${template.url_template || '❌ NULL/MISSING'}`);
        console.log(`   Category: ${template.category || 'NOT SET'}`);
        console.log(`   Importance: ${template.importance || 'NOT SET'}`);
        console.log(`   Created: ${template.created_at}`);
        console.log(`   Updated: ${template.updated_at || 'NOT SET'}`);
      });
    } else {
      console.log('   ⚠️  No notification templates found');
    }

    // 2. Check notification_triggers table
    console.log('\n\n🔔 NOTIFICATION TRIGGERS:');
    console.log('=' * 50);
    
    const { data: triggers, error: triggersError } = await supabase
      .from('notification_triggers')
      .select('*')
      .order('event_type');

    if (triggersError) {
      console.error('❌ Error fetching triggers:', triggersError);
    } else if (triggers && triggers.length > 0) {
      triggers.forEach((trigger, index) => {
        console.log(`\n${index + 1}. Event Type: ${trigger.event_type}`);
        console.log(`   Category: ${trigger.category || 'NOT SET'}`);
        
        if (trigger.notification_template) {
          console.log(`   Template Title: ${trigger.notification_template.title_template || 'NOT SET'}`);
          console.log(`   Template Description: ${trigger.notification_template.description_template || 'NOT SET'}`);
          console.log(`   Template URL: ${trigger.notification_template.url_template || '❌ NULL/MISSING'}`);
          console.log(`   Template Importance: ${trigger.notification_template.importance || 'NOT SET'}`);
        } else {
          console.log(`   Template: ❌ NOT SET`);
        }
        
        console.log(`   Trigger Condition: ${JSON.stringify(trigger.trigger_condition)}`);
        console.log(`   Created: ${trigger.created_at}`);
        console.log(`   Updated: ${trigger.updated_at || 'NOT SET'}`);
      });
    } else {
      console.log('   ⚠️  No notification triggers found');
    }

    // 3. Check recent notifications with null URLs
    console.log('\n\n🚨 RECENT NOTIFICATIONS WITH NULL RELATED_URL:');
    console.log('=' * 50);
    
    const { data: nullUrlNotifications, error: nullUrlError } = await supabase
      .from('notifications')
      .select('id, type, title, description, related_url, created_at, user_id')
      .is('related_url', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (nullUrlError) {
      console.error('❌ Error fetching null URL notifications:', nullUrlError);
    } else if (nullUrlNotifications && nullUrlNotifications.length > 0) {
      nullUrlNotifications.forEach((notification, index) => {
        console.log(`\n${index + 1}. ID: ${notification.id}`);
        console.log(`   Type: ${notification.type}`);
        console.log(`   Title: ${notification.title}`);
        console.log(`   Description: ${notification.description}`);
        console.log(`   Related URL: ${notification.related_url || '❌ NULL'}`);
        console.log(`   Created: ${notification.created_at}`);
        console.log(`   User ID: ${notification.user_id}`);
      });
    } else {
      console.log('   ✅ No notifications with null related_url found');
    }

    // 4. Check feedback-specific notifications
    console.log('\n\n💬 FEEDBACK NOTIFICATIONS ANALYSIS:');
    console.log('=' * 50);
    
    const { data: feedbackNotifications, error: feedbackError } = await supabase
      .from('notifications')
      .select('id, type, title, description, related_url, created_at')
      .or('type.ilike.%feedback%,title.ilike.%feedback%,description.ilike.%feedback%')
      .order('created_at', { ascending: false })
      .limit(10);

    if (feedbackError) {
      console.error('❌ Error fetching feedback notifications:', feedbackError);
    } else if (feedbackNotifications && feedbackNotifications.length > 0) {
      feedbackNotifications.forEach((notification, index) => {
        console.log(`\n${index + 1}. ID: ${notification.id}`);
        console.log(`   Type: ${notification.type}`);
        console.log(`   Title: ${notification.title}`);
        console.log(`   Description: ${notification.description}`);
        console.log(`   Related URL: ${notification.related_url || '❌ NULL'}`);
        console.log(`   Created: ${notification.created_at}`);
      });
    } else {
      console.log('   ⚠️  No feedback-related notifications found');
    }

    // 5. Summary analysis
    console.log('\n\n📊 SUMMARY ANALYSIS:');
    console.log('=' * 50);
    
    const templatesWithoutUrl = templates ? templates.filter(t => !t.url_template).length : 0;
    const triggersWithoutUrl = triggers ? triggers.filter(t => !t.notification_template?.url_template).length : 0;
    
    console.log(`📋 Templates: ${templates ? templates.length : 0} total, ${templatesWithoutUrl} without URL templates`);
    console.log(`🔔 Triggers: ${triggers ? triggers.length : 0} total, ${triggersWithoutUrl} without URL templates`);
    console.log(`🚨 Recent notifications with null URLs: ${nullUrlNotifications ? nullUrlNotifications.length : 0}`);
    console.log(`💬 Recent feedback notifications: ${feedbackNotifications ? feedbackNotifications.length : 0}`);

    if (templatesWithoutUrl > 0 || triggersWithoutUrl > 0) {
      console.log('\n⚠️  POTENTIAL ISSUES IDENTIFIED:');
      if (templatesWithoutUrl > 0) {
        console.log(`   - ${templatesWithoutUrl} notification templates are missing url_template values`);
      }
      if (triggersWithoutUrl > 0) {
        console.log(`   - ${triggersWithoutUrl} notification triggers are missing url_template in their template configuration`);
      }
    } else {
      console.log('\n✅ All templates and triggers have URL templates configured');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

async function main() {
  await examineNotificationTables();
}

main();