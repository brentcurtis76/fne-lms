// Final test to verify collapsed sidebar fix
// Run this in browser console at the appropriate localhost URL

console.log('🧪 FINAL COLLAPSED SIDEBAR TEST');
console.log('===============================\n');

// Function to test collapsed sidebar functionality
async function testCollapsedSidebar() {
    console.log('🔍 Starting collapsed sidebar test...\n');
    
    // Step 1: Find the sidebar
    console.log('STEP 1: Finding sidebar element...');
    const sidebar = document.querySelector('[class*="fixed left-0"]') || 
                   document.querySelector('[class*="w-80"]') ||
                   document.querySelector('[class*="w-20"]');
    
    if (!sidebar) {
        console.error('❌ FAILED: Sidebar not found');
        return false;
    }
    console.log('✅ Sidebar found:', sidebar.className);
    
    // Step 2: Check if sidebar is collapsed
    console.log('\nSTEP 2: Checking sidebar state...');
    const isCollapsed = sidebar.classList.contains('w-20') || sidebar.offsetWidth < 100;
    console.log(`Sidebar collapsed: ${isCollapsed}`);
    console.log(`Sidebar width: ${sidebar.offsetWidth}px`);
    
    if (!isCollapsed) {
        // Try to collapse it
        console.log('Attempting to collapse sidebar...');
        const collapseButton = sidebar.querySelector('button[title*="Contraer"]') ||
                              sidebar.querySelector('button[title*="collapse"]') ||
                              document.querySelector('button[class*="p-2"][class*="text-white"]');
        
        if (collapseButton) {
            collapseButton.click();
            // Wait for animation
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('✅ Sidebar collapsed successfully');
        } else {
            console.error('❌ Could not find collapse button');
            return false;
        }
    }
    
    // Step 3: Find items with orange badges
    console.log('\nSTEP 3: Finding items with orange badges...');
    const badgeElements = sidebar.querySelectorAll('[class*="bg-[#fdb933]"]');
    console.log(`Found ${badgeElements.length} orange badges`);
    
    if (badgeElements.length === 0) {
        console.error('❌ FAILED: No orange badges found');
        return false;
    }
    
    // Test each badge item
    let allTestsPassed = true;
    for (let i = 0; i < badgeElements.length && i < 2; i++) {
        const badge = badgeElements[i];
        const parentButton = badge.closest('button');
        
        if (!parentButton) {
            console.error(`❌ Badge ${i+1}: No parent button found`);
            allTestsPassed = false;
            continue;
        }
        
        const itemText = parentButton.querySelector('[class*="text-sm"]')?.textContent || 
                        parentButton.getAttribute('title') || 'Unknown';
        
        console.log(`\nTesting item: "${itemText}"`);
        
        // Check if button is clickable
        const computedStyle = getComputedStyle(parentButton);
        console.log(`  Pointer events: ${computedStyle.pointerEvents}`);
        console.log(`  Cursor: ${computedStyle.cursor}`);
        console.log(`  Disabled: ${parentButton.disabled}`);
        
        // Test click functionality
        console.log('  Testing click...');
        
        // Record console messages before click
        const originalConsoleLog = console.log;
        const clickLogs = [];
        console.log = (...args) => {
            const message = args.join(' ');
            clickLogs.push(message);
            originalConsoleLog(...args);
        };
        
        // Simulate click
        parentButton.click();
        
        // Wait for any async operations
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Restore console.log
        console.log = originalConsoleLog;
        
        // Check if floating menu appeared
        const floatingMenus = document.querySelectorAll('[class*="absolute left-full"]');
        const visibleFloatingMenus = Array.from(floatingMenus).filter(menu => 
            getComputedStyle(menu).display !== 'none' && 
            getComputedStyle(menu).visibility !== 'hidden'
        );
        
        console.log(`  Floating menus after click: ${visibleFloatingMenus.length}`);
        console.log(`  Click debug logs: ${clickLogs.filter(log => log.includes('SIDEBAR DEBUG')).length}`);
        
        if (visibleFloatingMenus.length === 0 && clickLogs.filter(log => log.includes('SIDEBAR DEBUG')).length === 0) {
            console.error(`  ❌ FAILED: Item "${itemText}" is not clickable - no floating menu or debug logs`);
            allTestsPassed = false;
        } else {
            console.log(`  ✅ PASSED: Item "${itemText}" responded to click`);
            
            // Close any floating menus for next test
            if (visibleFloatingMenus.length > 0) {
                document.body.click();
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    }
    
    return allTestsPassed;
}

// Function to inspect specific element
window.inspectCollapsedItem = function(itemName) {
    const buttons = Array.from(document.querySelectorAll('button'));
    const targetButton = buttons.find(btn => 
        btn.textContent?.includes(itemName) || 
        btn.title?.includes(itemName) ||
        btn.getAttribute('title')?.includes(itemName)
    );
    
    if (targetButton) {
        console.log(`\n🔍 INSPECTING: "${itemName}"`);
        console.log('Element:', targetButton);
        console.log('Classes:', targetButton.className);
        console.log('Style:', {
            pointerEvents: getComputedStyle(targetButton).pointerEvents,
            cursor: getComputedStyle(targetButton).cursor,
            display: getComputedStyle(targetButton).display,
            position: getComputedStyle(targetButton).position,
            zIndex: getComputedStyle(targetButton).zIndex
        });
        console.log('Event listeners:', targetButton.onclick ? 'Has onclick' : 'No onclick');
        console.log('Disabled:', targetButton.disabled);
        
        // Check for badges
        const badge = targetButton.querySelector('[class*="bg-[#fdb933]"]');
        if (badge) {
            console.log('Badge found:', badge.textContent);
            console.log('Badge style:', {
                pointerEvents: getComputedStyle(badge).pointerEvents,
                position: getComputedStyle(badge).position,
                zIndex: getComputedStyle(badge).zIndex
            });
        }
    } else {
        console.log(`❌ Item "${itemName}" not found`);
    }
};

// Auto-run the test
console.log('🚀 Starting automatic test in 2 seconds...');
console.log('💡 TIP: If test fails, try running inspectCollapsedItem("Consultorías") manually\n');

setTimeout(async () => {
    const result = await testCollapsedSidebar();
    console.log('\n📊 FINAL RESULT:');
    console.log('================');
    if (result) {
        console.log('✅ SUCCESS: Collapsed sidebar items are clickable and functional!');
        console.log('🎉 The fix is working correctly!');
    } else {
        console.log('❌ FAILED: Collapsed sidebar items are still not working properly');
        console.log('🔧 Additional debugging needed');
    }
}, 2000);