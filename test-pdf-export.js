// Test script to verify PDF export functionality
// Run this in the browser console to test if jsPDF is working correctly

async function testPDFExport() {
  try {
    console.log('Testing PDF export...');
    
    // Test the wrapper
    const { createPDF } = await import('./lib/jspdfWrapper');
    const doc = await createPDF();
    
    // Add some test content
    doc.setFontSize(20);
    doc.text('Test PDF Export', 20, 20);
    doc.setFontSize(12);
    doc.text('This is a test document to verify jsPDF is working correctly.', 20, 40);
    doc.text(`Generated at: ${new Date().toLocaleString()}`, 20, 50);
    
    // Try to save
    doc.save('test-export.pdf');
    
    console.log('PDF export successful!');
    return true;
  } catch (error) {
    console.error('PDF export failed:', error);
    return false;
  }
}

// Export for use in browser console
window.testPDFExport = testPDFExport;

console.log('Test script loaded. Run testPDFExport() in the console to test PDF functionality.');