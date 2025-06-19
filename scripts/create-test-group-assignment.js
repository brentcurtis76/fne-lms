const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestGroupAssignment() {
  console.log('Creating test group assignment...\n');

  try {
    // Get a test lesson
    const { data: lesson } = await supabase
      .from('lessons')
      .select('id, title, content, course_id')
      .limit(1)
      .single();

    if (!lesson) {
      console.error('No lessons found');
      return;
    }

    console.log('Found lesson:', lesson.title);
    console.log('Current content:', JSON.stringify(lesson.content, null, 2));

    // Add a group assignment block to the lesson
    let content = lesson.content || {};
    if (!content.blocks || !Array.isArray(content.blocks)) {
      content.blocks = [];
    }
    
    // Add a test group assignment block
    content.blocks.push({
      type: 'group-assignment',
      payload: {
        title: 'Tarea Grupal de Prueba',
        description: 'Esta es una tarea grupal de prueba para verificar el funcionamiento del sistema.',
        instructions: 'Trabajen en grupo para completar esta tarea. Deben entregar un documento PDF con sus conclusiones.',
        resources: [
          {
            type: 'link',
            title: 'Recurso de ejemplo',
            url: 'https://example.com'
          }
        ]
      }
    });

    // Update the lesson
    const { error: updateError } = await supabase
      .from('lessons')
      .update({ content })
      .eq('id', lesson.id);

    if (updateError) {
      console.error('Error updating lesson:', updateError);
    } else {
      console.log('Successfully added group assignment to lesson!');
      console.log('Lesson ID:', lesson.id);
      console.log('Course ID:', lesson.course_id);
    }

  } catch (error) {
    console.error('Failed:', error);
  }
}

createTestGroupAssignment();