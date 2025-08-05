// Test script to simulate the behavior of the news page
const https = require('https');

function fetchNewsAPI() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'fne-lms.vercel.app',
      path: '/api/news',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; TestScript/1.0)'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      console.log(`✅ Status Code: ${res.statusCode}`);
      console.log(`📋 Headers:`, res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          console.error('❌ JSON Parse Error:', error.message);
          console.log('🔍 Raw Response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request Error:', error.message);
      reject(error);
    });

    req.end();
  });
}

async function testNewsPageBehavior() {
  console.log('🧪 TESTING NEWS PAGE BEHAVIOR');
  console.log('=' .repeat(50));
  
  try {
    console.log('1. Fetching news API...');
    const apiResponse = await fetchNewsAPI();
    
    console.log('\n2. API Response Analysis:');
    console.log(`   Type: ${typeof apiResponse}`);
    console.log(`   Is Array: ${Array.isArray(apiResponse)}`);
    
    if (Array.isArray(apiResponse)) {
      console.log(`   ✅ Direct Array Format - ${apiResponse.length} articles`);
      
      if (apiResponse.length > 0) {
        console.log('\n📰 ARTICLE DETAILS:');
        apiResponse.forEach((article, index) => {
          console.log(`   ${index + 1}. Title: "${article.title}"`);
          console.log(`      Slug: ${article.slug}`);
          console.log(`      Published: ${article.is_published}`);
          console.log(`      Has Content: ${article.content_html ? 'YES' : 'NO'}`);
          console.log(`      Has Image: ${article.featured_image ? 'YES' : 'NO'}`);
          console.log(`      Author: ${article.author ? 
            (article.author.first_name + ' ' + article.author.last_name).trim() : 
            'No author'}`);
          console.log('');
        });
      }
    } else if (apiResponse && typeof apiResponse === 'object' && apiResponse.articles) {
      console.log(`   ✅ Object Format with 'articles' property - ${apiResponse.articles.length} articles`);
      console.log(`   Total: ${apiResponse.total || 'Not specified'}`);
    } else {
      console.log('   ❌ Unexpected response format');
      console.log('   Sample:', JSON.stringify(apiResponse, null, 2).substring(0, 200) + '...');
    }

    // Simulate the frontend filtering logic
    console.log('\n3. Simulating Frontend Processing:');
    const articles = apiResponse.articles || apiResponse; // Same logic as frontend
    console.log(`   Articles extracted: ${Array.isArray(articles) ? articles.length : 'Not an array'}`);
    
    if (Array.isArray(articles)) {
      const publishedArticles = articles.filter(article => article.is_published);
      console.log(`   Published articles after filter: ${publishedArticles.length}`);
      
      if (publishedArticles.length === 0) {
        console.log('   ⚠️  This would show "Sin Noticias Disponibles" on the frontend');
      } else {
        console.log('   ✅ Articles should display correctly on frontend');
      }
    } else {
      console.log('   ❌ Frontend would crash with "filter is not a function" error');
    }

  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

testNewsPageBehavior().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});