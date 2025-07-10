const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixCourseImages() {
  console.log('🔍 Checking course images...\n');

  try {
    // Step 1: Check current courses with placeholder URLs
    const { data: courses, error: fetchError } = await supabase
      .from('courses')
      .select('id, title, thumbnail_url')
      .or('thumbnail_url.eq.https://example.com/default-thumbnail.png,thumbnail_url.eq.default-thumbnail.png')
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching courses:', fetchError);
      return;
    }

    console.log(`Found ${courses?.length || 0} courses with placeholder thumbnail URLs\n`);

    if (courses && courses.length > 0) {
      console.log('Courses with placeholder images:');
      courses.forEach(course => {
        console.log(`- ${course.title} (ID: ${course.id})`);
      });
      console.log('');
    }

    // Step 2: Check if course-assets bucket exists
    console.log('📦 Checking storage buckets...\n');
    
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
    } else {
      const courseAssetsBucket = buckets?.find(b => b.name === 'course-assets');
      
      if (!courseAssetsBucket) {
        console.log('⚠️  course-assets bucket does not exist!');
        console.log('Creating course-assets bucket...\n');
        
        const { data, error: createError } = await supabase.storage.createBucket('course-assets', {
          public: true,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
          fileSizeLimit: 5242880, // 5MB
        });
        
        if (createError) {
          console.error('Error creating bucket:', createError);
        } else {
          console.log('✅ course-assets bucket created successfully!\n');
        }
      } else {
        console.log('✅ course-assets bucket already exists\n');
      }
    }

    // Step 3: Update courses to remove placeholder URLs
    console.log('🔧 Fixing placeholder URLs...\n');
    
    if (courses && courses.length > 0) {
      for (const course of courses) {
        const { error: updateError } = await supabase
          .from('courses')
          .update({ thumbnail_url: null })
          .eq('id', course.id);
        
        if (updateError) {
          console.error(`Error updating course ${course.id}:`, updateError);
        } else {
          console.log(`✅ Fixed thumbnail URL for: ${course.title}`);
        }
      }
    }

    console.log('\n✨ Course image fix complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Update CourseBuilderForm.tsx to set thumbnail_url to null instead of placeholder URL');
    console.log('2. Ensure course edit page allows users to upload cover images');
    console.log('3. Consider adding a default placeholder image in the UI when thumbnail_url is null');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the fix
fixCourseImages();