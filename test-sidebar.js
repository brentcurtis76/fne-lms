// Comprehensive collapsed sidebar test
// Paste this into browser console at http://localhost:3000/admin/schools

console.log('🧪 COMPREHENSIVE COLLAPSED SIDEBAR TEST');
console.log('=======================================\n');

// Test 1: Check if sidebar exists
console.log('TEST 1: Checking sidebar existence...');
const sidebar = document.querySelector('[class*="sidebar"]') || 
                document.querySelector('[class*="fixed left-0"]') ||
                document.querySelector('div[class*="w-80"]') ||
                document.querySelector('div[class*="w-20"]');

if (sidebar) {
    console.log('✅ Sidebar element found:', sidebar);
} else {
    console.log('❌ Sidebar element not found');
    console.log('Available elements:', document.querySelectorAll('div[class*="fixed"]'));
}

// Test 2: Check if sidebar is collapsed
console.log('\nTEST 2: Checking sidebar state...');
const isCollapsed = sidebar && (
    sidebar.classList.contains('w-20') ||
    sidebar.style.width === '80px' ||
    sidebar.offsetWidth < 100
);
console.log(`Sidebar collapsed: ${isCollapsed}`);
console.log(`Sidebar width: ${sidebar ? sidebar.offsetWidth : 'N/A'}px`);

// Test 3: Find items with children/badges
console.log('\nTEST 3: Finding items with badges...');
const itemsWithBadges = sidebar ? sidebar.querySelectorAll('[class*="absolute"][class*="bg-[#fdb933]"]') : [];
console.log(`Found ${itemsWithBadges.length} items with orange badges`);

itemsWithBadges.forEach((badge, index) => {
    const parentButton = badge.closest('button');
    const itemText = parentButton?.querySelector('[class*="text-sm"]')?.textContent || 'Unknown';
    console.log(`  ${index + 1}. Badge "${badge.textContent}" on item "${itemText}"`);
    
    if (parentButton) {
        console.log(`     Button clickable: ${!parentButton.disabled}`);
        console.log(`     Button has onClick: ${!!parentButton.onclick || parentButton.hasAttribute('onclick')}`);
        console.log(`     Pointer events: ${getComputedStyle(parentButton).pointerEvents}`);
    }
});

// Test 4: Try to manually trigger click
console.log('\nTEST 4: Manual click simulation...');
if (itemsWithBadges.length > 0) {
    const firstBadge = itemsWithBadges[0];
    const parentButton = firstBadge.closest('button');
    
    if (parentButton) {
        console.log('Attempting to click first item with badge...');
        console.log('Button element:', parentButton);
        
        // Try different click methods
        console.log('Method 1: Direct click()');
        parentButton.click();
        
        setTimeout(() => {
            console.log('Method 2: Mouse events');
            parentButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            parentButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            parentButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            
            setTimeout(() => {
                console.log('Method 3: Focus and Enter key');
                parentButton.focus();
                parentButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }, 100);
        }, 100);
    }
}

// Test 5: Check for floating menus
setTimeout(() => {
    console.log('\nTEST 5: Checking for floating menus...');
    const floatingMenus = document.querySelectorAll('[class*="absolute left-full"]');
    console.log(`Found ${floatingMenus.length} potential floating menus`);
    
    floatingMenus.forEach((menu, index) => {
        console.log(`  ${index + 1}. Menu visible: ${getComputedStyle(menu).display !== 'none'}`);
        console.log(`     Menu position: ${getComputedStyle(menu).position}`);
        console.log(`     Menu z-index: ${getComputedStyle(menu).zIndex}`);
    });
    
    console.log('\n🔍 FINAL DIAGNOSIS:');
    console.log('==================');
    console.log(`Sidebar found: ${!!sidebar}`);
    console.log(`Sidebar collapsed: ${isCollapsed}`);
    console.log(`Items with badges: ${itemsWithBadges.length}`);
    console.log(`Floating menus: ${floatingMenus.length}`);
    console.log('\nIf badges exist but clicks don\'t work, check:');
    console.log('1. Console for React errors');
    console.log('2. Element pointer-events CSS');
    console.log('3. Event handlers attached');
    console.log('4. Z-index conflicts');
}, 500);

// Helper function to inspect specific element
window.inspectSidebarItem = function(itemText) {
    const items = Array.from(document.querySelectorAll('button')).filter(btn => 
        btn.textContent.includes(itemText) || btn.title?.includes(itemText)
    );
    
    if (items.length > 0) {
        const item = items[0];
        console.log(`Inspecting "${itemText}":`, {
            element: item,
            disabled: item.disabled,
            pointerEvents: getComputedStyle(item).pointerEvents,
            cursor: getComputedStyle(item).cursor,
            zIndex: getComputedStyle(item).zIndex,
            position: getComputedStyle(item).position,
            eventListeners: getEventListeners ? getEventListeners(item) : 'getEventListeners not available'
        });
    } else {
        console.log(`Item "${itemText}" not found`);
    }
};

console.log('\n💡 TIP: Use inspectSidebarItem("Consultorías") to inspect specific items');