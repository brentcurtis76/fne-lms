// Check news articles for La Fontaine image issue
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
  console.log('🔍 CHECKING LA FONTAINE ARTICLE FOR IMAGE ISSUE');
  console.log('=' .repeat(50));

  try {
    // 1. Search for La Fontaine articles
    console.log('1. Searching for La Fontaine articles...');
    const { data: laFontaineArticles, error: searchError } = await supabase
      .from('news_articles')
      .select('*')
      .ilike('title', '%La Fontaine%')
      .order('created_at', { ascending: false });

    if (searchError) {
      console.log('❌ Error searching articles:', searchError.message);
      return;
    }

    console.log(`✅ Found ${laFontaineArticles?.length || 0} La Fontaine articles`);
    
    if (laFontaineArticles && laFontaineArticles.length > 0) {
      console.log('\n📋 LA FONTAINE ARTICLES:');
      laFontaineArticles.forEach((article, index) => {
        console.log(`\n   ${index + 1}. "${article.title}"`);
        console.log(`      ID: ${article.id}`);
        console.log(`      Slug: ${article.slug}`);
        console.log(`      Published: ${article.is_published ? 'YES' : 'NO'}`);
        console.log(`      Featured Image: ${article.featured_image || '❌ NO IMAGE SET'}`);
        
        // Check for images in content
        if (article.content_html) {
          const imgMatches = article.content_html.match(/<img[^>]+src="([^"]+)"/g);
          if (imgMatches) {
            console.log(`      Images in content: ${imgMatches.length}`);
            imgMatches.forEach((img, i) => {
              const srcMatch = img.match(/src="([^"]+)"/);
              if (srcMatch) {
                console.log(`        - Image ${i + 1}: ${srcMatch[1]}`);
              }
            });
          } else {
            console.log('      Images in content: 0');
          }
        }
      });
    }

    // 2. Check for exact article match
    console.log('\n2. Searching for exact article...');
    const exactTitle = 'Colegio La Fontaine celebró 32 años de vida con Seminario Internacional de Fundación Nueva Educación';
    const { data: exactArticle, error: exactError } = await supabase
      .from('news_articles')
      .select('*')
      .eq('title', exactTitle)
      .single();

    if (exactError) {
      console.log('❌ No exact match found');
      console.log('   Trying partial match...');
      
      const { data: partialMatch } = await supabase
        .from('news_articles')
        .select('*')
        .ilike('title', '%32 años%')
        .single();
        
      if (partialMatch) {
        console.log('✅ Found partial match:');
        console.log('   Title:', partialMatch.title);
        console.log('   Featured Image:', partialMatch.featured_image || '❌ NO IMAGE');
      }
    } else {
      console.log('✅ Found exact article!');
      console.log('   ID:', exactArticle.id);
      console.log('   Featured Image:', exactArticle.featured_image || '❌ NO FEATURED IMAGE');
      console.log('   Content length:', exactArticle.content_html?.length || 0);
    }

    // 3. Check what the API returns
    console.log('\n3. Testing API endpoint...');
    try {
      const response = await fetch('http://localhost:3000/api/news');
      const apiData = await response.json();
      
      if (response.ok) {
        const articles = apiData.articles || apiData;
        console.log(`✅ API returned ${articles.length} articles`);
        
        // Find La Fontaine article in API response
        const laFontaineInApi = articles.find(a => 
          a.title && a.title.includes('La Fontaine')
        );
        
        if (laFontaineInApi) {
          console.log('\n🎯 LA FONTAINE ARTICLE IN API RESPONSE:');
          console.log('   Title:', laFontaineInApi.title);
          console.log('   Featured Image:', laFontaineInApi.featured_image || '❌ NO IMAGE');
          console.log('   Has Author?:', !!laFontaineInApi.author);
          
          if (laFontaineInApi.featured_image) {
            console.log('\n🔍 IMAGE URL ANALYSIS:');
            console.log('   Full URL:', laFontaineInApi.featured_image);
            console.log('   Is Supabase Storage?:', laFontaineInApi.featured_image.includes('supabase'));
            console.log('   Is External URL?:', laFontaineInApi.featured_image.startsWith('http'));
          }
        } else {
          console.log('⚠️  La Fontaine article not found in API response');
        }
      } else {
        console.log('❌ API error:', apiData.error);
      }
    } catch (error) {
      console.log('❌ Failed to call API:', error.message);
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