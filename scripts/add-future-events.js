const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addFutureEvents() {
  console.log('🔄 Adding future events for August 2025 and beyond...\n');
  
  try {
    const futureEvents = [
      {
        title: 'Congreso de Innovación Educativa 2025',
        location: 'Santiago, Chile',
        date_start: '2025-09-15',
        date_end: '2025-09-17',
        time: '9:00 - 18:00',
        description: 'El evento más importante del año en innovación educativa.',
        link_url: 'https://nuevaeducacion.org/congreso2025',
        link_display: 'Inscríbete aquí',
        is_published: true
      },
      {
        title: 'Taller de Metodologías Activas',
        location: 'Valparaíso, Chile',
        date_start: '2025-08-28',
        time: '14:00 - 18:00',
        description: 'Aprende las últimas metodologías activas para el aula.',
        link_url: 'https://nuevaeducacion.org/taller-metodologias',
        link_display: 'Reserva tu cupo',
        is_published: true
      },
      {
        title: 'Seminario Virtual: IA en Educación',
        location: 'Online',
        date_start: '2025-09-05',
        time: '16:00 - 17:30',
        description: 'Explorando el potencial de la inteligencia artificial en el aula.',
        link_url: 'https://meet.google.com/xyz-abc-def',
        link_display: 'Únete aquí',
        is_published: true
      },
      {
        title: 'Encuentro Red FNE - Primavera',
        location: 'Viña del Mar, Chile',
        date_start: '2025-10-10',
        date_end: '2025-10-12',
        description: 'Encuentro anual de primavera de toda la red educativa.',
        link_url: 'https://nuevaeducacion.org/encuentro-primavera',
        link_display: 'Más información',
        is_published: true
      },
      {
        title: 'Pasantía Barcelona - Otoño 2025',
        location: 'Barcelona, España',
        date_start: '2025-11-03',
        date_end: '2025-11-08',
        description: 'Segunda edición de nuestra pasantía internacional en Barcelona.',
        link_url: 'https://nuevaeducacion.org/pasantia-barcelona',
        link_display: 'Postula aquí',
        is_published: true
      }
    ];
    
    console.log('📝 Inserting future events...');
    const { data: insertedEvents, error: insertError } = await supabase
      .from('events')
      .insert(futureEvents)
      .select();
    
    if (insertError) {
      console.error('❌ Error inserting events:', insertError);
      return;
    }
    
    console.log('✅ Successfully added future events:');
    insertedEvents.forEach(event => {
      console.log(`   - ${event.title} (${event.date_start})`);
    });
    
    // Count total events
    const { count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true });
    
    console.log(`\n📊 Total events in database: ${count}`);
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

addFutureEvents();