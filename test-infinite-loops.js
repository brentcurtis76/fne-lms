const puppeteer = require('puppeteer');

async function testInfiniteLoops() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  
  // Collect console logs
  const logs = [];
  page.on('console', msg => {
    logs.push(`${new Date().toISOString()}: ${msg.text()}`);
  });
  
  try {
    console.log('Testing for infinite loops...');
    
    // Go to the app
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0' });
    
    // Wait 10 seconds and collect logs
    await page.waitForTimeout(10000);
    
    // Count occurrences of specific repeated messages
    const environmentIssues = logs.filter(log => log.includes('Environment Issue Detected')).length;
    const fetchingNotifications = logs.filter(log => log.includes('Fetching notifications for user')).length;
    const courseBuilderAuth = logs.filter(log => log.includes('Course builder auth check')).length;
    
    console.log('\n=== INFINITE LOOP TEST RESULTS ===');
    console.log(`Environment Issues: ${environmentIssues} occurrences`);
    console.log(`Notification Fetches: ${fetchingNotifications} occurrences`);
    console.log(`Course Builder Auth: ${courseBuilderAuth} occurrences`);
    
    if (environmentIssues > 2 || fetchingNotifications > 3 || courseBuilderAuth > 2) {
      console.log('❌ INFINITE LOOPS DETECTED!');
    } else {
      console.log('✅ No infinite loops detected');
    }
    
    // Test navigation stability
    console.log('\nTesting sidebar navigation...');
    await page.click('[title="Mi Panel"]'); // Dashboard
    await page.waitForTimeout(1000);
    await page.click('[title="Mi Perfil"]'); // Profile
    await page.waitForTimeout(1000);
    console.log('✅ Navigation test completed');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

testInfiniteLoops();