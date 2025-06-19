const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAndCreateGroupAssignment() {
  console.log('Verifying and creating group assignment...\n');

  try {
    // First, let's check the course that was assigned
    const { data: course } = await supabase
      .from('courses')
      .select('*')
      .eq('title', 'Fundamentos de Los Pellines')
      .single();

    if (!course) {
      console.error('Course not found');
      return;
    }

    console.log('Found course:', course.id, course.title);

    // Get lessons from this course
    const { data: lessons } = await supabase
      .from('lessons')
      .select('*')
      .eq('course_id', course.id);

    console.log(`\nFound ${lessons?.length || 0} lessons in this course`);
    
    // Check each lesson for group assignments
    let hasGroupAssignment = false;
    lessons?.forEach(lesson => {
      console.log(`\nLesson: ${lesson.title}`);
      if (lesson.content?.blocks) {
        console.log(`  Has ${lesson.content.blocks.length} blocks`);
        lesson.content.blocks.forEach((block, i) => {
          console.log(`  Block ${i}: ${block.type}`);
          if (block.type === 'group-assignment' || block.type === 'group_assignment') {
            hasGroupAssignment = true;
            console.log('  ✓ Has group assignment!');
          }
        });
      } else {
        console.log('  No blocks structure');
      }
    });

    if (!hasGroupAssignment) {
      console.log('\nNo group assignments found. Creating one...');
      
      // Get the first lesson or create a new one
      let targetLesson = lessons && lessons.length > 0 ? lessons[0] : null;
      
      if (!targetLesson) {
        // Create a new lesson
        const { data: newLesson, error: createError } = await supabase
          .from('lessons')
          .insert({
            course_id: course.id,
            title: 'Introducción con Tarea Grupal',
            order_number: 1,
            content: {
              blocks: []
            }
          })
          .select()
          .single();
          
        if (createError) {
          console.error('Error creating lesson:', createError);
          return;
        }
        
        targetLesson = newLesson;
        console.log('Created new lesson:', targetLesson.id);
      }

      // Update the lesson to add a group assignment block
      const blocks = targetLesson.content?.blocks || [];
      
      // Add a text block first
      if (blocks.length === 0) {
        blocks.push({
          type: 'text',
          payload: {
            content: 'Bienvenidos a esta lección. A continuación encontrarán una tarea grupal.'
          }
        });
      }
      
      // Add the group assignment block
      blocks.push({
        type: 'group-assignment',
        payload: {
          title: 'Análisis Colaborativo de Los Pellines',
          description: 'En esta tarea grupal, deberán analizar y documentar las características principales de la metodología de Los Pellines.',
          instructions: `
1. Formen grupos de 3-4 personas
2. Investiguen sobre la metodología de Los Pellines
3. Preparen un documento PDF con sus hallazgos
4. El documento debe incluir:
   - Introducción a Los Pellines
   - Principales características
   - Aplicación en el contexto educativo
   - Conclusiones del grupo
5. Entreguen el documento a través del espacio colaborativo
          `.trim(),
          resources: [
            {
              type: 'link',
              title: 'Documentación de Los Pellines',
              url: 'https://example.com/los-pellines-docs'
            },
            {
              type: 'link', 
              title: 'Video Introductorio',
              url: 'https://example.com/los-pellines-video'
            }
          ]
        }
      });

      // Update the lesson
      const { error: updateError } = await supabase
        .from('lessons')
        .update({
          content: { blocks }
        })
        .eq('id', targetLesson.id);

      if (updateError) {
        console.error('Error updating lesson:', updateError);
        return;
      }

      console.log('✅ Successfully added group assignment to lesson!');
      console.log('Lesson ID:', targetLesson.id);
      console.log('Course:', course.title);
      console.log('\nNow refresh the Tareas Grupales page to see the assignment.');
    } else {
      console.log('\n✓ Group assignment already exists in this course');
    }

  } catch (error) {
    console.error('Failed:', error);
  }
}

verifyAndCreateGroupAssignment();