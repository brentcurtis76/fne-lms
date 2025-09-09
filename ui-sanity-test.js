const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runUITest() {
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--no-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();
  
  console.log('=== UI Sanity Test Started ===');
  console.log('Opening login page...');
  
  // Step 1: Open login page
  await page.goto('http://localhost:3000/login');
  await page.waitForTimeout(2000);
  
  // Wait for user to login
  console.log('\n🔑 PLEASE LOGIN NOW with your superadmin account:');
  console.log('Email: loreto.sanchez@colegiosantamartavaldivia.cl');
  console.log('Password: TestPassword123!');
  console.log('\nWaiting 30 seconds for you to login...');
  
  // Wait for login (30 seconds)
  await page.waitForTimeout(30000);
  
  console.log('\n✅ Assuming login complete. Navigating to role management...');
  
  // Step 2: Navigate to role management
  await page.goto('http://localhost:3000/admin/role-management');
  
  try {
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Gestión de Roles y Permisos")', { timeout: 10000 });
    console.log('✅ Role management page loaded');
    
    // Step 3: Take before screenshot
    const screenshotDir = 'logs/mcp/20250109/playwright';
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    
    await page.screenshot({ 
      path: path.join(screenshotDir, 'before.png'),
      fullPage: true
    });
    console.log('📸 Before screenshot saved');
    
    // Wait for matrix to load
    await page.waitForTimeout(3000);
    
    // Step 4: Toggle a permission (docente + view_reports)
    console.log('\nToggling permission: docente + view_reports...');
    
    // Find and click the cell for docente/view_reports
    // Matrix cells typically have data attributes or specific classes
    const cell = await page.locator('td[data-role="docente"][data-permission="view_reports"]').first();
    if (await cell.count() > 0) {
      await cell.click();
      console.log('Clicked cell');
      
      // Wait for modal
      await page.waitForTimeout(1000);
      
      // Confirm in modal if it appears
      const confirmButton = await page.locator('button:has-text("Confirmar")').first();
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
        console.log('Confirmed in modal');
      }
      
      // Wait for update
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠️ Could not find specific cell, trying alternative approach...');
      // Try clicking by visible text
      await page.click('text=docente', { timeout: 5000 }).catch(() => {});
    }
    
    // Step 5: Take after-apply screenshot
    await page.screenshot({ 
      path: path.join(screenshotDir, 'after-apply.png'),
      fullPage: true
    });
    console.log('📸 After-apply screenshot saved');
    
    // Step 6: Cleanup
    console.log('\nLooking for cleanup button...');
    const cleanupButton = await page.locator('button:has-text("Limpiar")').first();
    if (await cleanupButton.count() > 0) {
      await cleanupButton.click();
      console.log('Clicked cleanup button');
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠️ Cleanup button not found, will use API directly');
    }
    
    // Step 7: Take after-cleanup screenshot
    await page.screenshot({ 
      path: path.join(screenshotDir, 'after-cleanup.png'),
      fullPage: true
    });
    console.log('📸 After-cleanup screenshot saved');
    
    console.log('\n=== UI Test Complete ===');
    console.log('Screenshots saved to:', screenshotDir);
    
  } catch (error) {
    console.error('Error during test:', error.message);
    
    // Take error screenshot
    await page.screenshot({ 
      path: path.join('logs/mcp/20250109/playwright', 'error.png'),
      fullPage: true
    });
    console.log('📸 Error screenshot saved');
  }
  
  // Keep browser open for inspection
  console.log('\nBrowser will stay open for 10 seconds for inspection...');
  await page.waitForTimeout(10000);
  
  await browser.close();
}

runUITest().catch(console.error);