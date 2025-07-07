#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Patterns to look for
const patterns = {
  directSupabaseImport: /from ['"]@supabase\/supabase-js['"]/,
  supabaseImport: /from ['"]\.\..*\/supabase['"]/,
  createClient: /createClient\s*\(/,
  useUser: /useUser\s*\(/,
  useSupabaseClient: /useSupabaseClient\s*\(/,
  getServerSideProps: /export\s+(async\s+)?function\s+getServerSideProps/,
  getStaticProps: /export\s+(async\s+)?function\s+getStaticProps/,
  authCheck: /if\s*\(!user\)/,
  profileFetch: /from\(['"]profiles['"]\)/,
  sessionManager: /SessionManager/,
  authHelpers: /from ['"]@supabase\/auth-helpers/
};

// Categories for pages
const categories = {
  highRisk: [],
  mediumRisk: [],
  lowRisk: [],
  noAuth: []
};

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relativePath = path.relative(process.cwd(), filePath);
  
  const analysis = {
    path: relativePath,
    patterns: {},
    riskLevel: 'low',
    hasAuth: false
  };
  
  // Check each pattern
  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(content)) {
      analysis.patterns[key] = true;
      analysis.hasAuth = true;
    }
  }
  
  // Determine risk level
  if (analysis.patterns.directSupabaseImport || analysis.patterns.createClient) {
    analysis.riskLevel = 'high';
  } else if (analysis.patterns.sessionManager || analysis.patterns.profileFetch) {
    analysis.riskLevel = 'high';
  } else if (analysis.patterns.getServerSideProps && analysis.hasAuth) {
    analysis.riskLevel = 'medium';
  } else if (analysis.hasAuth) {
    analysis.riskLevel = 'medium';
  } else {
    analysis.riskLevel = 'none';
  }
  
  return analysis;
}

function scanPages() {
  const pagesDir = path.join(process.cwd(), 'pages');
  const results = [];
  
  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && file !== 'api') {
        scanDir(filePath);
      } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        if (!file.startsWith('_') && !filePath.includes('/api/')) {
          const analysis = analyzeFile(filePath);
          results.push(analysis);
          
          // Categorize
          switch (analysis.riskLevel) {
            case 'high':
              categories.highRisk.push(analysis);
              break;
            case 'medium':
              categories.mediumRisk.push(analysis);
              break;
            case 'low':
              categories.lowRisk.push(analysis);
              break;
            case 'none':
              categories.noAuth.push(analysis);
              break;
          }
        }
      }
    }
  }
  
  scanDir(pagesDir);
  return results;
}

// Run analysis
console.log('Frontend Authentication Analysis');
console.log('================================\n');

const results = scanPages();

console.log(`Total pages analyzed: ${results.length}`);
console.log(`High risk pages: ${categories.highRisk.length}`);
console.log(`Medium risk pages: ${categories.mediumRisk.length}`);
console.log(`Low risk pages: ${categories.lowRisk.length}`);
console.log(`No auth pages: ${categories.noAuth.length}`);

console.log('\n🚨 HIGH RISK PAGES (migrate first):');
console.log('=====================================');
categories.highRisk.forEach(page => {
  console.log(`\n${page.path}`);
  console.log('  Patterns found:', Object.keys(page.patterns).join(', '));
});

console.log('\n⚠️  MEDIUM RISK PAGES:');
console.log('====================');
categories.mediumRisk.slice(0, 10).forEach(page => {
  console.log(`${page.path} - ${Object.keys(page.patterns).join(', ')}`);
});
if (categories.mediumRisk.length > 10) {
  console.log(`... and ${categories.mediumRisk.length - 10} more`);
}

console.log('\n✅ LOW RISK/NO AUTH PAGES:');
console.log('========================');
console.log(`${categories.lowRisk.length} low risk pages`);
console.log(`${categories.noAuth.length} pages with no auth`);

// Write detailed report
const report = {
  summary: {
    total: results.length,
    highRisk: categories.highRisk.length,
    mediumRisk: categories.mediumRisk.length,
    lowRisk: categories.lowRisk.length,
    noAuth: categories.noAuth.length
  },
  categories,
  timestamp: new Date().toISOString()
};

fs.writeFileSync(
  path.join(process.cwd(), 'frontend-auth-analysis.json'),
  JSON.stringify(report, null, 2)
);

console.log('\n📊 Detailed report saved to frontend-auth-analysis.json');