const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://sxlogxqzmarhqsblxmtj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function run() {
  const { data: courses, error } = await supabase
    .from('courses')
    .select('id, title, status, instructor_id, instructors (id, full_name, photo_url)')
    .eq('status', 'published')
    .order('title');

  if (error) {
    console.error(error);
    return;
  }

  const instructorMap = new Map();

  for (const course of courses) {
    if (course.instructors) {
      const id = course.instructors.id;
      if (!instructorMap.has(id)) {
        instructorMap.set(id, {
          name: course.instructors.full_name,
          photo: course.instructors.photo_url,
          courses: []
        });
      }
      instructorMap.get(id).courses.push(course.title);
    }
  }

  console.log('\n=== RELATORES CON CURSOS PUBLICADOS ===\n');

  for (const [id, i] of instructorMap) {
    console.log('📚 Relator: ' + i.name);
    console.log('   ID: ' + id);
    console.log('   Foto: ' + (i.photo || '❌ Sin foto'));
    console.log('   Cursos (' + i.courses.length + '):');
    i.courses.forEach(c => console.log('     - ' + c));
    console.log('');
  }

  const noInstructor = courses.filter(c => !c.instructors);
  if (noInstructor.length > 0) {
    console.log('\n⚠️  CURSOS SIN RELATOR:');
    noInstructor.forEach(c => console.log('   - ' + c.title + ' (ID: ' + c.id + ')'));
  }

  console.log('\n=== RESUMEN ===');
  console.log('Total relatores: ' + instructorMap.size);
  console.log('Total cursos publicados: ' + courses.length);
  console.log('Cursos sin relator: ' + noInstructor.length);
}

run();
