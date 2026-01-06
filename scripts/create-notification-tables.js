#!/usr/bin/env node

/**
 * Genera - Create Notification Tables
 * 
 * This script creates the notification system tables step by step.
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

// SQL statements broken into manageable pieces
const createNotificationTypesTable = `
CREATE TABLE IF NOT EXISTS notification_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  default_enabled BOOLEAN DEFAULT TRUE,
  category VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
`;

const createNotificationsTable = `
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  CONSTRAINT notifications_title_not_empty CHECK (length(trim(title)) > 0),
  CONSTRAINT notifications_message_not_empty CHECK (length(trim(message)) > 0)
);
`;

const createUserPreferencesTable = `
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  notification_type VARCHAR(50),
  email_enabled BOOLEAN DEFAULT TRUE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, notification_type)
);
`;

const defaultNotificationTypes = [
  { id: 'course_assigned', name: 'Curso Asignado', description: 'Notificación cuando se asigna un nuevo curso', default_enabled: true, category: 'courses' },
  { id: 'course_completed', name: 'Curso Completado', description: 'Notificación cuando se completa un curso', default_enabled: true, category: 'courses' },
  { id: 'lesson_available', name: 'Nueva Lección Disponible', description: 'Notificación cuando una nueva lección está disponible', default_enabled: true, category: 'courses' },
  { id: 'assignment_created', name: 'Nueva Tarea Creada', description: 'Notificación cuando se crea una nueva tarea', default_enabled: true, category: 'assignments' },
  { id: 'assignment_due', name: 'Tarea Próxima a Vencer', description: 'Recordatorio de tarea próxima a vencer', default_enabled: true, category: 'assignments' },
  { id: 'assignment_graded', name: 'Tarea Calificada', description: 'Notificación cuando se califica una tarea', default_enabled: true, category: 'assignments' },
  { id: 'message_received', name: 'Nuevo Mensaje', description: 'Notificación de nuevo mensaje en el espacio colaborativo', default_enabled: true, category: 'workspace' },
  { id: 'mention_received', name: 'Te han Mencionado', description: 'Notificación cuando alguien te menciona', default_enabled: true, category: 'workspace' },
  { id: 'meeting_scheduled', name: 'Reunión Programada', description: 'Notificación de nueva reunión programada', default_enabled: true, category: 'workspace' },
  { id: 'document_shared', name: 'Documento Compartido', description: 'Notificación cuando se comparte un documento', default_enabled: true, category: 'workspace' },
  { id: 'system_maintenance', name: 'Mantenimiento del Sistema', description: 'Notificaciones sobre mantenimiento programado', default_enabled: true, category: 'system' },
  { id: 'user_approved', name: 'Usuario Aprobado', description: 'Notificación cuando un usuario es aprobado', default_enabled: true, category: 'admin' },
  { id: 'role_assigned', name: 'Rol Asignado', description: 'Notificación cuando se asigna un nuevo rol', default_enabled: true, category: 'admin' }
];

async function executeSQL(description, sql) {
  try {
    console.log(`⚡ ${description}...`);
    
    // Use a raw SQL query through the REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'apikey': supabaseServiceKey
      },
      body: JSON.stringify({ query: sql })
    });
    
    if (!response.ok) {
      // Try alternative approach with direct table creation
      console.log(`🔄 Trying alternative approach for ${description}...`);
      
      // For now, we'll log the SQL and expect manual execution
      console.log(`📝 SQL to execute manually in Supabase SQL Editor:`);
      console.log(sql);
      console.log('---');
      
      return true;
    }
    
    console.log(`✅ ${description} completed`);
    return true;
    
  } catch (error) {
    console.log(`❌ ${description} failed:`, error.message);
    return false;
  }
}

async function createNotificationSystem() {
  try {
    console.log('🚀 Creating notification system tables...\n');
    
    // Create tables
    await executeSQL('Creating notification_types table', createNotificationTypesTable);
    await executeSQL('Creating notifications table', createNotificationsTable);
    await executeSQL('Creating user_notification_preferences table', createUserPreferencesTable);
    
    console.log('\n📝 To complete the setup, please run the following in Supabase SQL Editor:');
    console.log('\n1. Copy the content from database/notification-system.sql');
    console.log('2. Paste and execute it in the Supabase SQL Editor');
    console.log('3. This will create tables, indexes, RLS policies, and insert default data');
    
    console.log('\n🔍 After executing the SQL, run this to verify:');
    console.log('node scripts/test-notification-tables.js');
    
  } catch (error) {
    console.error('❌ Failed to create notification system:', error.message);
  }
}

createNotificationSystem();