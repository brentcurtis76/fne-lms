#!/usr/bin/env node

/**
 * Test frontend login by simulating what the E2E test does
 */

const { chromium } = require('playwright');
require('dotenv').config({ path: '.env.test.local' });

async function testFrontendLogin() {
  console.log('🎭 Testing frontend login flow...');
  
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const page = await browser.newPage();
  
  // Enable console logging from the page
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  try {
    console.log('📍 Navigating to login page...');
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');
    
    console.log('📝 Filling login form...');
    await page.fill('input[type="email"]', 'brent@perrotuertocm.cl');
    await page.fill('input[type="password"]', 'NuevaEdu2025!');
    
    console.log('🔄 Submitting form...');
    await page.click('button[type="submit"]');
    
    // Wait for either redirect or error message
    await page.waitForTimeout(3000);
    
    // Check if we're still on login page (error) or redirected (success)
    const currentUrl = page.url();
    const hasLoginButton = await page.locator('text=Iniciar Sesión').isVisible();
    const hasErrorMessage = await page.locator('text=incorrectos').isVisible();
    
    console.log('📊 Results:');
    console.log('Current URL:', currentUrl);
    console.log('Still has login button:', hasLoginButton);
    console.log('Has error message:', hasErrorMessage);
    
    if (hasErrorMessage) {
      const errorText = await page.locator('text=incorrectos').textContent();
      console.log('Error message:', errorText);
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'login-test-result.png' });
    console.log('📸 Screenshot saved as login-test-result.png');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testFrontendLogin().then(() => {
  console.log('🏁 Frontend login test complete');
  process.exit(0);
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});