const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Navigating to login page...');
  await page.goto('http://localhost:3000/login');
  
  // Login
  console.log('Logging in...');
  await page.fill('input[type="email"]', 'brent@perrotuertocm.cl');
  await page.fill('input[type="password"]', 'NuevaEdu2025!');
  await page.click('button[type="submit"]');
  
  // Wait for navigation
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('Logged in successfully!');
  
  // Navigate to My Paths
  console.log('Navigating to My Paths...');
  await page.goto('http://localhost:3000/my-paths');
  await page.waitForLoadState('networkidle');
  
  // Wait a moment for React to render
  await page.waitForTimeout(1000);
  
  // Get the updated profile data from the page
  const profileInfo = await page.evaluate(() => {
    const headerElement = document.querySelector('.bg-white.border-b.border-gray-200');
    const nameElement = headerElement?.querySelector('.text-sm.font-medium.text-gray-900');
    const subtitleElement = headerElement?.querySelector('.text-xs.text-gray-500');
    const avatarElement = document.querySelector('img[alt*="Avatar"], img[alt*="avatar"]');
    
    // Check for avatar in different possible locations
    const avatarSrc = avatarElement?.src || 
                     document.querySelector('[class*="avatar"]')?.querySelector('img')?.src || 
                     'No avatar found';
    
    return {
      name: nameElement?.textContent || 'Name not found',
      subtitle: subtitleElement?.textContent || 'Subtitle not found',
      avatarSrc: avatarSrc,
      headerHTML: headerElement?.innerHTML?.substring(0, 500) || 'Header not found'
    };
  });
  
  console.log('\n=== Profile Display Info ===');
  console.log('Name displayed:', profileInfo.name);
  console.log('Subtitle displayed:', profileInfo.subtitle);
  console.log('Avatar URL:', profileInfo.avatarSrc);
  console.log('\nFirst 500 chars of header HTML:');
  console.log(profileInfo.headerHTML);
  
  // Take a screenshot focused on the header
  const header = await page.locator('.bg-white.border-b.border-gray-200').first();
  await header.screenshot({ path: 'header-debug.png' });
  console.log('\nHeader screenshot saved as header-debug.png');
  
  // Close after 5 seconds
  setTimeout(async () => {
    await browser.close();
    process.exit(0);
  }, 5000);
})();