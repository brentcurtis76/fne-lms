// Script to check existing data in the database and create test data if needed
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

async function checkDatabase() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found');
    process.exit(1);
  }

  console.log('🔍 Checking database for existing data...\n');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Check courses
    const { data: courses, error: coursesError } = await supabase
      .from('courses')
      .select('id, title, created_at')
      .order('created_at', { ascending: false });
    
    if (coursesError) {
      console.error('Error fetching courses:', coursesError.message);
    } else {
      console.log(`📚 Found ${courses.length} courses:`);
      courses.forEach(course => {
        console.log(`  - ID: ${course.id}, Title: "${course.title}"`);
      });
    }
    
    // Check modules
    const { data: modules, error: modulesError } = await supabase
      .from('modules')
      .select('id, title, course_id, created_at')
      .order('created_at', { ascending: false });
    
    if (modulesError) {
      console.error('Error fetching modules:', modulesError.message);
    } else {
      console.log(`\n📖 Found ${modules.length} modules:`);
      modules.forEach(module => {
        console.log(`  - ID: ${module.id}, Title: "${module.title}", Course ID: ${module.course_id}`);
      });
    }
    
    // Check lessons
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, title, module_id, created_at')
      .order('created_at', { ascending: false });
    
    if (lessonsError) {
      console.error('Error fetching lessons:', lessonsError.message);
    } else {
      console.log(`\n📝 Found ${lessons.length} lessons:`);
      lessons.forEach(lesson => {
        console.log(`  - ID: ${lesson.id}, Title: "${lesson.title}", Module ID: ${lesson.module_id}`);
      });
    }
    
    // If no data exists, create test data
    if (courses.length === 0 || modules.length === 0 || lessons.length === 0) {
      console.log('\n🚀 Creating test data...');
      await createTestData(supabase);
    } else {
      console.log('\n✅ Database has existing data!');
      
      // Show example URLs
      if (lessons.length > 0) {
        const lesson = lessons[0];
        const module = modules.find(m => m.id === lesson.module_id);
        const course = courses.find(c => c.id === module?.course_id);
        
        if (course && module && lesson) {
          console.log(`\n🔗 Example lesson URL:`);
          console.log(`http://localhost:3001/admin/course-builder/${course.id}/${module.id}/${lesson.id}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

async function createTestData(supabase) {
  try {
    // Create a test course
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .insert({
        title: 'Fundamentos de Educación Digital',
        description: 'Curso de ejemplo para probar el LMS',
        status: 'active'
      })
      .select()
      .single();
    
    if (courseError) throw courseError;
    console.log(`✅ Created course: ${course.title} (ID: ${course.id})`);
    
    // Create a test module
    const { data: module, error: moduleError } = await supabase
      .from('modules')
      .insert({
        title: 'Creación de Contenido Interactivo',
        description: 'Módulo de ejemplo',
        course_id: course.id,
        order_number: 1
      })
      .select()
      .single();
    
    if (moduleError) throw moduleError;
    console.log(`✅ Created module: ${module.title} (ID: ${module.id})`);
    
    // Create a test lesson
    const { data: lesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        title: 'Mi Primera Lección',
        content: 'Contenido de ejemplo',
        module_id: module.id,
        order_number: 1
      })
      .select()
      .single();
    
    if (lessonError) throw lessonError;
    console.log(`✅ Created lesson: ${lesson.title} (ID: ${lesson.id})`);
    
    console.log(`\n🔗 You can now access your lesson at:`);
    console.log(`http://localhost:3001/admin/course-builder/${course.id}/${module.id}/${lesson.id}`);
    
  } catch (error) {
    console.error('Error creating test data:', error.message);
  }
}

checkDatabase();