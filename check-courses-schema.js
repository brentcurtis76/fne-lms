#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

console.log('🔍 CHECKING COURSES TABLE SCHEMA');
console.log('=================================');

async function checkCoursesSchema() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('📊 Getting sample course data to see available columns...');
    
    const { data: courses, error } = await supabase
      .from('courses')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    if (courses && courses.length > 0) {
      console.log('✅ Sample course found:');
      console.log('📋 Available columns:', Object.keys(courses[0]).join(', '));
      console.log('📄 Sample data:');
      console.log(JSON.stringify(courses[0], null, 2));
    } else {
      console.log('⚠️  No courses found in database');
    }

    // Also check learning_path_courses table
    console.log('\n📚 Checking learning_path_courses table...');
    
    const { data: pathCourses, error: pathCoursesError } = await supabase
      .from('learning_path_courses')
      .select('*')
      .limit(1);

    if (pathCoursesError) {
      console.error('❌ learning_path_courses Error:', pathCoursesError);
    } else if (pathCourses && pathCourses.length > 0) {
      console.log('✅ Sample learning_path_courses found:');
      console.log('📋 Available columns:', Object.keys(pathCourses[0]).join(', '));
      console.log('📄 Sample data:');
      console.log(JSON.stringify(pathCourses[0], null, 2));
    } else {
      console.log('⚠️  No learning_path_courses found in database');
    }

  } catch (error) {
    console.error('❌ Unexpected Error:', error);
  }
}

checkCoursesSchema();