const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addSampleEvents() {
  console.log('🔄 Adding sample events...');
  
  try {
    // Sample events data
    const sampleEvents = [
      // Past events
      {
        title: 'Conferencia Anual FNE 2024',
        location: 'Santiago, Chile',
        date_start: '2024-12-05',
        date_end: '2024-12-06',
        time: '9:00 - 18:00',
        description: 'Un espacio de encuentro y reflexión para educadores de toda la red.',
        is_published: true
      },
      {
        title: 'Encuentro Docentes',
        location: 'Santiago, Chile',
        date_start: '2024-12-20',
        time: '15:00 - 19:00',
        description: 'Cierre de año y presentación de logros 2024.',
        is_published: true
      },
      // Future events
      {
        title: 'Workshop Innovación Educativa',
        location: 'Santiago, Chile',
        date_start: '2025-01-15',
        time: '10:00 - 13:00',
        description: 'Metodologías transformadoras con expertos internacionales.',
        link_url: 'https://nuevaeducacion.org/workshop',
        link_display: 'Inscríbete aquí',
        is_published: true
      },
      {
        title: 'Seminario Online: Aula Generativa',
        location: 'Virtual',
        date_start: '2025-01-28',
        time: '16:00 - 17:30',
        description: 'Explorando ecosistemas de aprendizaje para el siglo XXI.',
        link_url: 'https://meet.google.com/abc-defg-hij',
        link_display: 'Regístrate',
        is_published: true
      },
      {
        title: 'Pasantía Barcelona 2025',
        location: 'Barcelona, España',
        date_start: '2025-02-10',
        date_end: '2025-02-15',
        description: '5 días de inmersión en innovación educativa con las mejores escuelas de Cataluña.',
        link_url: 'https://nuevaeducacion.org/pasantias',
        link_display: 'Más información',
        is_published: true
      },
      {
        title: 'Encuentro Red FNE',
        location: 'Los Pellines, Chile',
        date_start: '2025-02-25',
        date_end: '2025-02-27',
        time: 'Todo el día',
        description: 'Networking y formación continua con educadores de toda la red.',
        link_url: 'https://nuevaeducacion.org/encuentro',
        link_display: 'Reserva tu lugar',
        is_published: true
      },
      {
        title: 'Taller Metodologías Activas',
        location: 'Valparaíso, Chile',
        date_start: '2025-03-15',
        time: '9:00 - 14:00',
        description: 'Aprendizaje basado en proyectos y pensamiento de diseño.',
        link_url: 'https://nuevaeducacion.org/taller',
        link_display: 'Inscríbete',
        is_published: true
      },
      {
        title: 'Congreso EdTech Chile',
        location: 'Santiago, Chile',
        date_start: '2025-04-02',
        date_end: '2025-04-04',
        description: 'Tecnología y educación del futuro: tendencias y mejores prácticas.',
        link_url: 'https://edtech2025.cl',
        link_display: 'Información y entradas',
        is_published: true
      }
    ];
    
    // Check if events table exists by trying to query it
    const { data: existingEvents, error: checkError } = await supabase
      .from('events')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.message.includes('relation "public.events" does not exist')) {
      console.log('❌ Events table does not exist. Please run the migration first.');
      console.log('Run: psql $DATABASE_URL -f database/migrations/create_events_table.sql');
      return;
    }
    
    // Clear existing events (optional - comment out if you want to keep existing events)
    console.log('🗑️ Clearing existing events...');
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.log('⚠️ Could not clear existing events:', deleteError.message);
    }
    
    // Insert sample events
    console.log('📝 Inserting sample events...');
    const { data: insertedEvents, error: insertError } = await supabase
      .from('events')
      .insert(sampleEvents)
      .select();
    
    if (insertError) {
      console.error('❌ Error inserting events:', insertError);
      return;
    }
    
    console.log('✅ Successfully added sample events:');
    insertedEvents.forEach(event => {
      const isPast = new Date(event.date_start) < new Date();
      console.log(`   - ${event.title} (${event.location}) - ${isPast ? 'PAST' : 'FUTURE'}`);
    });
    
    // Count events
    const { data: countData, error: countError } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log(`\n📊 Total events in database: ${countData.length || 0}`);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

addSampleEvents();