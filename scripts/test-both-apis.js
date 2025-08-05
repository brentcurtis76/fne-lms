// Test both API endpoints to see which one is being used
const https = require('https');

function fetchAPI(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'fne-lms.vercel.app',
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; TestScript/1.0)'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: jsonData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            error: 'JSON Parse Error',
            raw: data
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function testBothAPIs() {
  console.log('🧪 TESTING BOTH NEWS API ENDPOINTS');
  console.log('=' .repeat(60));
  
  // Test /api/news
  console.log('1. Testing /api/news:');
  try {
    const response1 = await fetchAPI('/api/news');
    console.log(`   Status: ${response1.statusCode}`);
    
    if (response1.data) {
      console.log(`   Response Type: ${typeof response1.data}`);
      console.log(`   Is Array: ${Array.isArray(response1.data)}`);
      
      if (Array.isArray(response1.data)) {
        console.log(`   ✅ Direct Array - ${response1.data.length} articles`);
        if (response1.data.length > 0) {
          console.log(`   First Article: "${response1.data[0].title}"`);
        }
      } else if (response1.data.articles) {
        console.log(`   ✅ Object with articles - ${response1.data.articles.length} articles`);
        console.log(`   Total: ${response1.data.total}`);
        if (response1.data.articles.length > 0) {
          console.log(`   First Article: "${response1.data.articles[0].title}"`);
        }
      } else {
        console.log('   ❌ Unexpected format');
      }
    } else {
      console.log(`   ❌ Error: ${response1.error}`);
      console.log(`   Raw: ${response1.raw?.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
  }

  console.log('\n' + '=' .repeat(60));
  
  // Test /api/news/
  console.log('2. Testing /api/news/ (with trailing slash):');
  try {
    const response2 = await fetchAPI('/api/news/');
    console.log(`   Status: ${response2.statusCode}`);
    
    if (response2.data) {
      console.log(`   Response Type: ${typeof response2.data}`);
      console.log(`   Is Array: ${Array.isArray(response2.data)}`);
      
      if (Array.isArray(response2.data)) {
        console.log(`   ✅ Direct Array - ${response2.data.length} articles`);
        if (response2.data.length > 0) {
          console.log(`   First Article: "${response2.data[0].title}"`);
        }
      } else if (response2.data.articles) {
        console.log(`   ✅ Object with articles - ${response2.data.articles.length} articles`);
        console.log(`   Total: ${response2.data.total}`);
        if (response2.data.articles.length > 0) {
          console.log(`   First Article: "${response2.data.articles[0].title}"`);
        }
      } else {
        console.log('   ❌ Unexpected format');
      }
    } else {
      console.log(`   ❌ Error: ${response2.error}`);
      console.log(`   Raw: ${response2.raw?.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`   ❌ Request failed: ${error.message}`);
  }

  console.log('\n' + '=' .repeat(60));
  console.log('📋 SUMMARY:');
  console.log('  The frontend calls "/api/news" which should route to /api/news.ts');
  console.log('  If both endpoints work, there might be a caching or client-side issue');
  console.log('  If different formats are returned, that could cause the loading state');
}

testBothAPIs().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});