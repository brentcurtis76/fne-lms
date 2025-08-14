const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🔄 Applying events table migration...');
  
  try {
    // Create the events table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS public.events (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        location VARCHAR(255) NOT NULL,
        date_start DATE NOT NULL,
        date_end DATE,
        time VARCHAR(50),
        description TEXT,
        link_url VARCHAR(500),
        link_display VARCHAR(255),
        is_published BOOLEAN DEFAULT true,
        created_by UUID REFERENCES public.profiles(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
      )
    `;
    
    // Since we can't directly execute SQL, let's check if the table exists first
    const { data: existingEvents, error: checkError } = await supabase
      .from('events')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.code === 'PGRST204') {
      console.log('❌ Events table does not exist. Please run the SQL migration manually.');
      console.log('\nRun this command:');
      console.log('psql $DATABASE_URL -f database/migrations/create_events_table.sql');
      process.exit(1);
    } else if (!checkError || existingEvents) {
      console.log('✅ Events table already exists!');
      
      // Let's insert a sample event to test
      const sampleEvent = {
        title: 'Congreso de Educación Innovadora',
        location: 'Santiago, Chile',
        date_start: '2025-03-15',
        date_end: '2025-03-17',
        time: '9:00 - 18:00',
        description: 'Un congreso para explorar las últimas tendencias en educación innovadora.',
        link_url: 'https://nuevaeducacion.org/congreso',
        link_display: 'Inscríbete aquí',
        is_published: true
      };
      
      const { data: insertedEvent, error: insertError } = await supabase
        .from('events')
        .insert([sampleEvent])
        .select()
        .single();
      
      if (insertError) {
        if (insertError.code === '42P01') {
          console.log('❌ Events table does not exist. Please apply the migration.');
        } else {
          console.log('⚠️ Could not insert sample event:', insertError.message);
        }
      } else {
        console.log('✅ Sample event created:', insertedEvent.title);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

applyMigration();