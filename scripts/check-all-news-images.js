const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAllNewsImages() {
  console.log('📸 CHECKING ALL NEWS ARTICLES FOR IMAGES');
  console.log('=' .repeat(50));
  
  try {
    // Get all articles
    const { data: articles, error } = await supabase
      .from('news_articles')
      .select('id, title, featured_image, is_published, created_at')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log(`Total articles: ${articles.length}\n`);
    
    let withImage = 0;
    let withoutImage = 0;
    const imageUrls = [];
    
    articles.forEach(article => {
      if (article.featured_image) {
        withImage++;
        imageUrls.push(article.featured_image);
        console.log(`✅ "${article.title.substring(0, 50)}..."`);
        console.log(`   Image: ${article.featured_image}`);
      } else {
        withoutImage++;
        console.log(`❌ "${article.title.substring(0, 50)}..."`);
        console.log(`   No featured image`);
      }
      console.log('');
    });
    
    console.log('\n📊 SUMMARY:');
    console.log(`Articles with images: ${withImage}`);
    console.log(`Articles without images: ${withoutImage}`);
    
    if (imageUrls.length > 0) {
      console.log('\n🔍 IMAGE URL PATTERNS:');
      const patterns = {
        supabaseStorage: 0,
        external: 0,
        relative: 0
      };
      
      imageUrls.forEach(url => {
        if (url.includes('supabase.co/storage')) {
          patterns.supabaseStorage++;
        } else if (url.startsWith('http')) {
          patterns.external++;
        } else {
          patterns.relative++;
        }
      });
      
      console.log(`Supabase Storage: ${patterns.supabaseStorage}`);
      console.log(`External URLs: ${patterns.external}`);
      console.log(`Relative paths: ${patterns.relative}`);
      
      if (patterns.supabaseStorage > 0) {
        console.log('\n📦 SAMPLE SUPABASE STORAGE URL:');
        const sampleUrl = imageUrls.find(u => u.includes('supabase.co/storage'));
        console.log(sampleUrl);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkAllNewsImages();