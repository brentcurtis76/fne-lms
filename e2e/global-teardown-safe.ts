/**
 * SAFE Global teardown for Playwright tests
 * Cleans up only test-namespaced data
 */

import { FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Cleaning up test environment...');
  
  const testNamespace = process.env.TEST_NAMESPACE;
  if (!testNamespace) {
    console.log('No test namespace found, skipping cleanup');
    return;
  }
  
  console.log(`Cleaning up test data with namespace: ${testNamespace}`);
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
  
  try {
    // Delete test courses (with cascade to modules, lessons, blocks)
    const { data: testCourses } = await supabase
      .from('courses')
      .select('id')
      .like('title', `%${testNamespace}%`);
    
    if (testCourses && testCourses.length > 0) {
      console.log(`Found ${testCourses.length} test courses to clean up`);
      
      for (const course of testCourses) {
        // Delete blocks from lessons in this course
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id')
          .eq('course_id', course.id);
        
        if (lessons) {
          for (const lesson of lessons) {
            await supabase
              .from('blocks')
              .delete()
              .eq('lesson_id', lesson.id);
          }
        }
        
        // Delete lessons
        await supabase
          .from('lessons')
          .delete()
          .eq('course_id', course.id);
        
        // Delete modules
        await supabase
          .from('modules')
          .delete()
          .eq('course_id', course.id);
        
        // Delete course
        await supabase
          .from('courses')
          .delete()
          .eq('id', course.id);
      }
      
      console.log(`✅ Cleaned up ${testCourses.length} test courses`);
    }
    
    // Delete test users
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const testUsers = users.filter(u => 
      u.email?.includes(testNamespace) ||
      u.user_metadata?.test_namespace === testNamespace
    );
    
    if (testUsers.length > 0) {
      console.log(`Found ${testUsers.length} test users to clean up`);
      
      for (const user of testUsers) {
        // Delete user roles
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', user.id);
        
        // Delete profile
        await supabase
          .from('profiles')
          .delete()
          .eq('id', user.id);
        
        // Delete auth user
        await supabase.auth.admin.deleteUser(user.id);
      }
      
      console.log(`✅ Cleaned up ${testUsers.length} test users`);
    }
    
    console.log('✅ Test cleanup completed successfully');
    
  } catch (error) {
    console.error('❌ Error during test cleanup:', error);
    console.error('⚠️  Some test data may remain in the database');
  }
}

export default globalTeardown;