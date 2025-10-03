// Wrapper for jsPDF to handle SSR issues in Next.js

// TypeScript declaration for jsPDF autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

let jsPDFConstructor: any = null;
let autoTablePlugin: any = null;

export async function getJsPDF() {
  if (typeof window === 'undefined') {
    throw new Error('jsPDF can only be used on the client side');
  }

  if (!jsPDFConstructor) {
    // Dynamic import for client-side only
    const jsPDFModule = await import('jspdf');
    jsPDFConstructor = jsPDFModule.default || jsPDFModule.jsPDF;
    
    // Import autotable plugin
    await import('jspdf-autotable');
  }

  return jsPDFConstructor;
}

export async function createPDF(options?: any) {
  const jsPDF = await getJsPDF();
  return new jsPDF(options);
}