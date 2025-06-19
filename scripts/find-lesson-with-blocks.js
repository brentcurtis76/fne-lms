const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findLessonWithBlocks() {
  console.log('Finding lessons with block structure...\n');

  try {
    // Get all lessons
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, title, content, course_id')
      .limit(10);

    if (!lessons || lessons.length === 0) {
      console.error('No lessons found');
      return;
    }

    console.log(`Checking ${lessons.length} lessons...\n`);

    for (const lesson of lessons) {
      console.log(`Lesson: ${lesson.title} (ID: ${lesson.id})`);
      
      if (lesson.content && typeof lesson.content === 'object' && lesson.content.blocks) {
        console.log('  ✓ Has blocks structure!');
        console.log('  Number of blocks:', lesson.content.blocks.length);
        console.log('  Block types:', lesson.content.blocks.map(b => b.type).join(', '));
        console.log('  Course ID:', lesson.course_id);
        
        // Add group assignment block to this lesson
        lesson.content.blocks.push({
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
          .update({ content: lesson.content })
          .eq('id', lesson.id);

        if (updateError) {
          console.error('  Error updating lesson:', updateError);
        } else {
          console.log('  ✅ Successfully added group assignment to lesson!');
          return;
        }
      } else {
        console.log('  ✗ No blocks structure');
      }
    }

    console.log('\nNo lessons with block structure found. Creating a new lesson with blocks...');
    
    // Get a course to add the lesson to
    const { data: course } = await supabase
      .from('courses')
      .select('id, title')
      .limit(1)
      .single();

    if (!course) {
      console.error('No courses found');
      return;
    }

    // Create a new lesson with blocks
    const newLesson = {
      course_id: course.id,
      title: 'Lección con Tarea Grupal',
      order_number: 999,
      content: {
        blocks: [
          {
            type: 'text',
            payload: {
              content: 'Bienvenidos a esta lección especial con tarea grupal.'
            }
          },
          {
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
          }
        ]
      }
    };

    const { data: createdLesson, error: createError } = await supabase
      .from('lessons')
      .insert(newLesson)
      .select()
      .single();

    if (createError) {
      console.error('Error creating lesson:', createError);
    } else {
      console.log('✅ Successfully created new lesson with group assignment!');
      console.log('Lesson ID:', createdLesson.id);
      console.log('Course:', course.title);
    }

  } catch (error) {
    console.error('Failed:', error);
  }
}

findLessonWithBlocks();