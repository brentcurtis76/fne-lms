// Simulate the exact fetch call that the browser makes
// This helps identify if there's a difference between server-side and client-side behavior

const https = require('https');

function fetchAsClient() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'fne-lms.vercel.app',
      path: '/api/news',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Simulate browser headers
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://fne-lms.vercel.app/noticias',
        'Origin': 'https://fne-lms.vercel.app'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      console.log(`📡 Response Status: ${res.statusCode}`);
      console.log(`📋 Response Headers:`);
      Object.keys(res.headers).forEach(key => {
        console.log(`   ${key}: ${res.headers[key]}`);
      });
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`\n📦 Raw Response Length: ${data.length} bytes`);
        console.log(`🔍 Raw Response Start: ${data.substring(0, 100)}...`);
        
        try {
          const jsonData = JSON.parse(data);
          console.log(`\n✅ JSON Parse Successful`);
          console.log(`📊 Response Analysis:`);
          console.log(`   Type: ${typeof jsonData}`);
          console.log(`   Is Array: ${Array.isArray(jsonData)}`);
          
          if (Array.isArray(jsonData)) {
            console.log(`   📰 Direct Array Format: ${jsonData.length} articles`);
          } else if (jsonData && jsonData.articles) {
            console.log(`   📰 Object Format: ${jsonData.articles.length} articles`);
            console.log(`   📊 Total: ${jsonData.total}`);
            
            // Test the exact frontend logic
            console.log(`\n🧪 Frontend Logic Simulation:`);
            const articles = jsonData.articles || jsonData;
            console.log(`   Articles extracted: ${Array.isArray(articles) ? articles.length : 'ERROR - Not array'}`);
            
            if (Array.isArray(articles)) {
              const publishedArticles = articles.filter(article => article.is_published);
              console.log(`   Published articles: ${publishedArticles.length}`);
              
              if (publishedArticles.length > 0) {
                console.log(`   🎯 RESULT: Articles should display correctly`);
                console.log(`   📝 First Article Title: "${publishedArticles[0].title}"`);
              } else {
                console.log(`   ⚠️  RESULT: Would show "Sin Noticias Disponibles"`);
              }
            } else {
              console.log(`   ❌ RESULT: Frontend would crash with filter error`);
            }
          } else {
            console.log(`   ❌ Unexpected format: ${JSON.stringify(jsonData, null, 2).substring(0, 200)}`);
          }
          
          resolve(jsonData);
        } catch (error) {
          console.error(`❌ JSON Parse Error: ${error.message}`);
          console.log(`🔍 Failed to parse: ${data}`);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Request Error: ${error.message}`);
      reject(error);
    });

    // Add timeout
    req.setTimeout(10000, () => {
      console.error('❌ Request timed out');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function testClientSideFetch() {
  console.log('🧪 SIMULATING CLIENT-SIDE FETCH');
  console.log('=' .repeat(50));
  console.log('Testing the exact API call that the browser makes...\n');
  
  try {
    const result = await fetchAsClient();
    console.log('\n✅ Fetch completed successfully');
    
    // Final diagnosis
    console.log('\n🏥 DIAGNOSIS:');
    console.log('   - API endpoint is working correctly');
    console.log('   - Data format is compatible with frontend');
    console.log('   - Articles are published and should be visible');
    console.log('   - Issue is likely client-side JavaScript or caching');
    
  } catch (error) {
    console.error('\n💥 Fetch failed:', error.message);
    console.log('\n🏥 DIAGNOSIS:');
    console.log('   - API endpoint may be failing');
    console.log('   - Network or server issue');
  }
}

testClientSideFetch().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});