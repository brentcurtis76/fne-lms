#!/usr/bin/env node

/**
 * Monitor Bibliography Block State Changes
 * 
 * This script helps debug the state management issue where uploaded PDF information
 * disappears after being saved. It monitors the browser console output to track
 * when and how the bibliography block state changes.
 * 
 * Usage: Copy this script content and paste it into your browser console
 * while on the course builder page.
 */

(() => {
  console.log('%c📊 Bibliography State Monitor Started', 'background: #0a0a0a; color: #fbbf24; font-size: 16px; padding: 10px;');
  
  let stateHistory = [];
  let changeCount = 0;
  
  // Override console.log to capture specific messages
  const originalLog = console.log;
  console.log = function(...args) {
    originalLog.apply(console, args);
    
    // Capture bibliography-related logs
    const message = args.join(' ');
    if (message.includes('Bibliography') || 
        message.includes('📚') || 
        message.includes('📊') || 
        message.includes('WARNING: PDF/Image items detected with NO URL')) {
      
      changeCount++;
      const timestamp = new Date().toISOString();
      
      stateHistory.push({
        timestamp,
        changeNumber: changeCount,
        message: args,
        stackTrace: new Error().stack
      });
      
      // Alert on data loss
      if (message.includes('NO URL') || message.includes('NO FILENAME')) {
        console.error(`%c⚠️ DATA LOSS DETECTED at change #${changeCount}`, 'background: red; color: white; font-size: 14px; padding: 5px;');
        console.trace('Stack trace for data loss:');
      }
    }
  };
  
  // Add monitoring functions to window
  window.bibliographyMonitor = {
    // Show all state changes
    showHistory: () => {
      console.table(stateHistory.map(h => ({
        '#': h.changeNumber,
        Time: h.timestamp.split('T')[1].split('.')[0],
        Message: h.message[0]?.substring(0, 100) + '...'
      })));
    },
    
    // Show detailed change
    showChange: (changeNumber) => {
      const change = stateHistory.find(h => h.changeNumber === changeNumber);
      if (change) {
        console.group(`Change #${changeNumber} at ${change.timestamp}`);
        originalLog(...change.message);
        console.log('Stack trace:', change.stackTrace);
        console.groupEnd();
      }
    },
    
    // Find when data was lost
    findDataLoss: () => {
      const losses = stateHistory.filter(h => 
        h.message.some(m => 
          m.toString().includes('NO URL') || 
          m.toString().includes('NO FILENAME')
        )
      );
      
      console.group('📉 Data Loss Events');
      losses.forEach(loss => {
        console.log(`Change #${loss.changeNumber} at ${loss.timestamp.split('T')[1].split('.')[0]}`);
      });
      console.groupEnd();
      
      return losses;
    },
    
    // Clear history
    clear: () => {
      stateHistory = [];
      changeCount = 0;
      console.log('History cleared');
    },
    
    // Stop monitoring
    stop: () => {
      console.log = originalLog;
      console.log('Monitoring stopped');
    }
  };
  
  console.log('%cMonitoring commands:', 'font-weight: bold; color: #0a0a0a;');
  console.log('- bibliographyMonitor.showHistory() - Show all state changes');
  console.log('- bibliographyMonitor.showChange(n) - Show specific change details');
  console.log('- bibliographyMonitor.findDataLoss() - Find when data was lost');
  console.log('- bibliographyMonitor.clear() - Clear history');
  console.log('- bibliographyMonitor.stop() - Stop monitoring');
})();