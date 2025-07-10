import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function listAllCourses() {
  try {
    console.log('=== Listing All Courses in the System ===\n');

    const { data: courses, error } = await supabase
      .from('courses')
      .select('id, title, description, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching courses:', error);
      return;
    }

    if (!courses || courses.length === 0) {
      console.log('No courses found in the system.');
      return;
    }

    console.log(`Found ${courses.length} courses:\n`);
    
    courses.forEach((course, index) => {
      console.log(`${index + 1}. ${course.title}`);
      console.log(`   ID: ${course.id}`);
      console.log(`   Description: ${course.description?.substring(0, 80)}...`);
      console.log(`   Created: ${new Date(course.created_at).toLocaleDateString()}`);
      console.log();
    });

    // Search for mentoring-related courses
    console.log('\n=== Courses that might be related to mentoring ===\n');
    
    const mentorKeywords = ['mentor', 'tutor', 'acompañ', 'guía', 'introducción', 'personal'];
    const relatedCourses = courses.filter(course => 
      mentorKeywords.some(keyword => 
        course.title?.toLowerCase().includes(keyword) || 
        course.description?.toLowerCase().includes(keyword)
      )
    );

    if (relatedCourses.length > 0) {
      console.log('Found potentially related courses:');
      relatedCourses.forEach(course => {
        console.log(`\n- ${course.title}`);
        console.log(`  ID: ${course.id}`);
      });
    } else {
      console.log('No courses found with mentoring-related keywords.');
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

listAllCourses();