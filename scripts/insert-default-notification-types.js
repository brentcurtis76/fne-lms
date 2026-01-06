#!/usr/bin/env node

/**
 * Genera - Insert Default Notification Types
 * 
 * This script inserts the specific default notification types
 * and verifies they were added correctly.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Default notification types to insert
const defaultNotificationTypes = [
  {
    id: 'course_assigned',
    name: 'Curso Asignado',
    description: 'Notificación cuando se asigna un nuevo curso',
    category: 'courses',
    default_enabled: true
  },
  {
    id: 'message_received',
    name: 'Mensaje Recibido',
    description: 'Notificación cuando recibes un mensaje directo',
    category: 'messaging',
    default_enabled: true
  },
  {
    id: 'message_mentioned',
    name: 'Mencionado en Mensaje',
    description: 'Notificación cuando te mencionan en un mensaje',
    category: 'messaging',
    default_enabled: true
  },
  {
    id: 'post_mentioned',
    name: 'Mencionado en Publicación',
    description: 'Notificación cuando te mencionan en una publicación',
    category: 'social',
    default_enabled: true
  },
  {
    id: 'assignment_assigned',
    name: 'Tarea Asignada',
    description: 'Notificación cuando te asignan una nueva tarea',
    category: 'assignments',
    default_enabled: true
  },
  {
    id: 'feedback_received',
    name: 'Retroalimentación Recibida',
    description: 'Notificación cuando recibes feedback de un instructor',
    category: 'feedback',
    default_enabled: true
  }
];

async function insertNotificationTypes() {
  try {
    console.log('🚀 Inserting default notification types...\n');
    
    // First, check if any types already exist
    const { data: existingTypes, error: checkError } = await supabase
      .from('notification_types')
      .select('id, name')
      .in('id', defaultNotificationTypes.map(t => t.id));
    
    if (checkError) {
      throw new Error(`Failed to check existing types: ${checkError.message}`);
    }
    
    if (existingTypes && existingTypes.length > 0) {
      console.log('📋 Found existing notification types:');
      existingTypes.forEach(type => {
        console.log(`  • ${type.id}: ${type.name}`);
      });
      console.log('');
    }
    
    // Insert new notification types using upsert
    console.log('⚡ Inserting/updating notification types...');
    
    const { data, error } = await supabase
      .from('notification_types')
      .upsert(defaultNotificationTypes, {
        onConflict: 'id'
      });
    
    if (error) {
      throw new Error(`Failed to insert notification types: ${error.message}`);
    }
    
    console.log('✅ Notification types inserted successfully');
    
    // Verify the insertion
    console.log('\n🔍 Verifying inserted data...');
    
    const { data: allTypes, error: verifyError } = await supabase
      .from('notification_types')
      .select('id, name, description, category, default_enabled')
      .order('category', { ascending: true });
    
    if (verifyError) {
      throw new Error(`Failed to verify data: ${verifyError.message}`);
    }
    
    if (allTypes && allTypes.length > 0) {
      console.log(`\n📦 Total notification types in database: ${allTypes.length}`);
      console.log('\n📋 Complete list by category:');
      
      // Group by category
      const typesByCategory = allTypes.reduce((acc, type) => {
        if (!acc[type.category]) {
          acc[type.category] = [];
        }
        acc[type.category].push(type);
        return acc;
      }, {});
      
      Object.keys(typesByCategory).sort().forEach(category => {
        console.log(`\n  📂 ${category.toUpperCase()}:`);
        typesByCategory[category].forEach(type => {
          const enabledStatus = type.default_enabled ? '✅' : '❌';
          console.log(`    ${enabledStatus} ${type.id}`);
          console.log(`       ${type.name}`);
          console.log(`       ${type.description}`);
        });
      });
      
      // Verify the specific types we wanted to insert
      console.log('\n✅ Verification of requested notification types:');
      defaultNotificationTypes.forEach(requestedType => {
        const found = allTypes.find(t => t.id === requestedType.id);
        if (found) {
          console.log(`  ✅ ${requestedType.id} - Successfully inserted`);
        } else {
          console.log(`  ❌ ${requestedType.id} - Missing`);
        }
      });
      
    } else {
      console.log('❌ No notification types found in database');
    }
    
    console.log('\n🎉 Default notification types setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Failed to insert notification types:', error.message);
    process.exit(1);
  }
}

insertNotificationTypes();