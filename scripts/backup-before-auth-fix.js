#!/usr/bin/env node

/**
 * Backup Script: Create timestamped backup before authentication fix
 * 
 * This script:
 * 1. Creates a timestamped backup directory
 * 2. Backs up all critical authentication files
 * 3. Creates a manifest of backed up files
 * 4. Provides rollback instructions
 * 
 * Run: node scripts/backup-before-auth-fix.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔒 Genera - Authentication Fix Backup\n');

// Create timestamp for backup
const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const backupDir = path.join('backups', `auth-fix-${timestamp}`);

console.log(`Creating backup directory: ${backupDir}\n`);

// Ensure backup directory exists
fs.mkdirSync(backupDir, { recursive: true });

// Files to backup
const filesToBackup = [
  'pages/_app.tsx',
  'src/pages/_app.tsx',
  'lib/sessionManager.ts',
  'contexts/AuthContext.tsx',
  'components/layout/MainLayout.tsx',
  'pages/login.tsx',
  'pages/admin/test-session.tsx', // Has onAuthStateChange listener
  '.env.local', // In case we need environment vars
  'package.json',
  'package-lock.json'
];

// Additional patterns to backup
const patterns = [
  'hooks/useAuth.ts',
  'lib/frontend-auth-utils.ts',
  'utils/roleUtils.ts'
];

console.log('📁 Backing up files...\n');

const manifest = {
  timestamp: new Date().toISOString(),
  backupDir: backupDir,
  files: [],
  gitCommit: '',
  nodeVersion: process.version,
  description: 'Backup before removing competing authentication listeners'
};

// Get current git commit
try {
  manifest.gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  console.log('⚠️  Not in a git repository or git not available');
}

// Backup each file
filesToBackup.forEach(file => {
  if (fs.existsSync(file)) {
    const destPath = path.join(backupDir, file);
    const destDir = path.dirname(destPath);
    
    // Create destination directory
    fs.mkdirSync(destDir, { recursive: true });
    
    // Copy file
    fs.copyFileSync(file, destPath);
    
    // Get file stats
    const stats = fs.statSync(file);
    manifest.files.push({
      path: file,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      backed_up: true
    });
    
    console.log(`  ✅ ${file} (${stats.size} bytes)`);
  } else {
    manifest.files.push({
      path: file,
      backed_up: false,
      reason: 'File not found'
    });
    console.log(`  ⏭️  ${file} (not found)`);
  }
});

// Backup additional patterns
patterns.forEach(pattern => {
  if (fs.existsSync(pattern)) {
    const destPath = path.join(backupDir, pattern);
    const destDir = path.dirname(destPath);
    
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(pattern, destPath);
    
    const stats = fs.statSync(pattern);
    manifest.files.push({
      path: pattern,
      size: stats.size,
      modified: stats.mtime.toISOString(),
      backed_up: true
    });
    
    console.log(`  ✅ ${pattern} (${stats.size} bytes)`);
  }
});

// Save manifest
const manifestPath = path.join(backupDir, 'backup-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n  ✅ Backup manifest saved`);

// Create rollback script
const rollbackScript = `#!/bin/bash
# Rollback script for auth fix backup
# Created: ${new Date().toISOString()}

echo "🔄 Rolling back authentication changes..."
echo ""

# Restore files
${manifest.files
  .filter(f => f.backed_up)
  .map(f => `cp -f "${path.join(backupDir, f.path)}" "${f.path}"`)
  .join('\n')}

echo ""
echo "✅ Rollback complete!"
echo ""
echo "Next steps:"
echo "1. Run: npm install"
echo "2. Run: npm run build"
echo "3. Test the application"
`;

const rollbackPath = path.join(backupDir, 'rollback.sh');
fs.writeFileSync(rollbackPath, rollbackScript);
fs.chmodSync(rollbackPath, '755');

// Create README
const readmeContent = `# Authentication Fix Backup

Created: ${new Date().toISOString()}
Git Commit: ${manifest.gitCommit || 'N/A'}

## Purpose
This backup was created before implementing the authentication fix to remove competing session listeners.

## Files Backed Up
${manifest.files.filter(f => f.backed_up).map(f => `- ${f.path}`).join('\n')}

## Rollback Instructions

### Option 1: Use the rollback script
\`\`\`bash
cd ${process.cwd()}
./backups/auth-fix-${timestamp}/rollback.sh
\`\`\`

### Option 2: Manual rollback
\`\`\`bash
# Copy all files back
cp -r ${backupDir}/* .

# Reinstall dependencies
npm install

# Rebuild
npm run build
\`\`\`

## Changes Being Made
1. Delete /src/pages/_app.tsx (duplicate)
2. Delete /lib/sessionManager.ts (legacy)
3. Remove sessionManager imports from:
   - /components/layout/MainLayout.tsx
   - /pages/login.tsx
4. Refactor /contexts/AuthContext.tsx to remove onAuthStateChange listener
`;

fs.writeFileSync(path.join(backupDir, 'README.md'), readmeContent);

// Summary
console.log('\n' + '='.repeat(60));
console.log('📋 Backup Summary');
console.log('='.repeat(60));
console.log(`  Backup Location: ${backupDir}`);
console.log(`  Files Backed Up: ${manifest.files.filter(f => f.backed_up).length}`);
console.log(`  Total Size: ${manifest.files.filter(f => f.backed_up).reduce((acc, f) => acc + f.size, 0)} bytes`);
console.log(`  Manifest: ${manifestPath}`);
console.log(`  Rollback Script: ${rollbackPath}`);

console.log('\n🚀 Ready to proceed with authentication fix!');
console.log('\nTo rollback if needed:');
console.log(`  ./${rollbackPath}`);
console.log('\n');