// Check if news articles exist in the database
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkNewsArticles() {
  console.log('🔍 CHECKING NEWS ARTICLES IN DATABASE');
  console.log('=' .repeat(50));

  try {
    // 1. Check if news_articles table exists and get all articles
    console.log('1. Checking all articles in news_articles table...');
    const { data: allArticles, error: allError } = await supabase
      .from('news_articles')
      .select('*')
      .order('created_at', { ascending: false });

    if (allError) {
      console.log('❌ Error fetching articles:', allError.message);
      console.log('   Code:', allError.code);
      console.log('   Details:', allError.details);
      return;
    }

    console.log(`✅ Found ${allArticles?.length || 0} total articles`);
    
    if (allArticles && allArticles.length > 0) {
      console.log('\n📋 ARTICLES LIST:');
      allArticles.forEach((article, index) => {
        console.log(`   ${index + 1}. "${article.title}"`);
        console.log(`      ID: ${article.id}`);
        console.log(`      Slug: ${article.slug}`);
        console.log(`      Published: ${article.is_published ? 'YES' : 'NO'}`);
        console.log(`      Created: ${article.created_at}`);
        console.log(`      Author ID: ${article.author_id}`);
        console.log('');
      });
    }

    // 2. Check specifically published articles
    console.log('2. Checking published articles only...');
    const { data: publishedArticles, error: pubError } = await supabase
      .from('news_articles')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (pubError) {
      console.log('❌ Error fetching published articles:', pubError.message);
    } else {
      console.log(`✅ Found ${publishedArticles?.length || 0} published articles`);
      
      if (publishedArticles && publishedArticles.length > 0) {
        console.log('\n📰 PUBLISHED ARTICLES:');
        publishedArticles.forEach((article, index) => {
          console.log(`   ${index + 1}. "${article.title}" - Published`);
        });
      } else {
        console.log('⚠️  No published articles found - this is why they\'re not showing on the public page');
      }
    }

    // 3. Test the exact query from the public API
    console.log('\n3. Testing public API query with author join...');
    const { data: apiArticles, error: apiError } = await supabase
      .from('news_articles')
      .select(`
        *,
        author:profiles!author_id (
          id,
          first_name,
          last_name,
          avatar_url
        )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (apiError) {
      console.log('❌ Public API query failed:', apiError.message);
      console.log('   Code:', apiError.code);
      console.log('   Details:', apiError.details);
      
      if (apiError.code === '42703') {
        console.log('   🚨 DIAGNOSIS: Column does not exist in profiles table');
      }
    } else {
      console.log(`✅ Public API query succeeded - ${apiArticles?.length || 0} articles`);
      
      if (apiArticles && apiArticles.length > 0) {
        console.log('\n📡 API RESPONSE PREVIEW:');
        apiArticles.forEach((article, index) => {
          console.log(`   ${index + 1}. "${article.title}"`);
          console.log(`      Author: ${article.author ? 
            (article.author.first_name + ' ' + article.author.last_name).trim() || 'No name' : 
            'No author'}`);
        });
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error.message);
  }
}

checkNewsArticles().then(() => {
  console.log('\n✅ Check complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Check failed:', error);
  process.exit(1);
});