#!/usr/bin/env node

/**
 * Safe execution script for authentication cleanup
 * Run with: node scripts/execute-auth-cleanup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
};

async function main() {
  console.log('🔧 FNE LMS Authentication Cleanup Script\n');
  
  // 1. Create backup
  console.log('1. Creating backup...');
  const backupDir = `backups/auth-cleanup-${new Date().toISOString().split('T')[0]}`;
  fs.mkdirSync(backupDir, { recursive: true });
  
  // Backup critical files
  const filesToBackup = [
    'pages/_app.tsx',
    'src/pages/_app.tsx',
    'lib/sessionManager.ts',
    'contexts/AuthContext.tsx',
    'pages/login.tsx'
  ];
  
  filesToBackup.forEach(file => {
    if (fs.existsSync(file)) {
      const dest = path.join(backupDir, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file, dest);
      console.log(`   ✅ Backed up: ${file}`);
    }
  });
  
  console.log(`\n   Backup created at: ${backupDir}\n`);
  
  // 2. Show planned actions
  console.log('2. Planned Actions:');
  console.log('===================');
  console.log('   • DELETE: /src/pages/_app.tsx (duplicate file)');
  console.log('   • KEEP: /pages/_app.tsx (active app file)');
  console.log('   • KEEP: /lib/sessionManager.ts (only handles Remember Me)');
  console.log('   • KEEP: /contexts/AuthContext.tsx (provides auth wrapper)');
  console.log('   • NO CHANGES: /pages/login.tsx (uses sessionManager safely)\n');
  
  const proceed = await askQuestion('Proceed with cleanup? (yes/no): ');
  
  if (proceed.toLowerCase() !== 'yes') {
    console.log('\n❌ Cleanup cancelled.');
    rl.close();
    return;
  }
  
  // 3. Execute cleanup
  console.log('\n3. Executing cleanup...');
  
  try {
    // Delete duplicate _app.tsx
    if (fs.existsSync('src/pages/_app.tsx')) {
      fs.unlinkSync('src/pages/_app.tsx');
      console.log('   ✅ Deleted: /src/pages/_app.tsx');
      
      // Check if src/pages is now empty and remove it
      const srcPagesFiles = fs.readdirSync('src/pages').filter(f => f !== '.DS_Store');
      if (srcPagesFiles.length === 0) {
        fs.rmdirSync('src/pages');
        console.log('   ✅ Removed empty directory: /src/pages');
      }
    }
    
    // 4. Verify the application still builds
    console.log('\n4. Verifying build...');
    console.log('   Running: npm run build (this may take a moment)...\n');
    
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log('\n   ✅ Build successful!');
    } catch (buildError) {
      console.error('\n   ❌ Build failed! Rolling back...');
      
      // Rollback
      filesToBackup.forEach(file => {
        const backupFile = path.join(backupDir, file);
        if (fs.existsSync(backupFile)) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.copyFileSync(backupFile, file);
          console.log(`   ✅ Restored: ${file}`);
        }
      });
      
      throw new Error('Build verification failed. Changes have been rolled back.');
    }
    
    // 5. Generate test instructions
    console.log('\n5. Manual Testing Required:');
    console.log('===========================');
    console.log('   1. Start dev server: npm run dev');
    console.log('   2. Test login with each role:');
    console.log('      - Admin user');
    console.log('      - Consultant');
    console.log('      - Equipo Directivo');
    console.log('      - Líder de Generación');
    console.log('      - Líder de Comunidad');
    console.log('      - Docente');
    console.log('   3. Verify "Remember Me" checkbox works');
    console.log('   4. Test page navigation without logout');
    console.log('   5. Test explicit logout functionality');
    
    console.log('\n✅ Cleanup completed successfully!');
    console.log('\nRollback command if needed:');
    console.log(`   cp -r ${backupDir}/* .`);
    
  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
  }
  
  rl.close();
}

main();