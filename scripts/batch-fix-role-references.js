#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Common patterns that need fixing
const fixes = [
  {
    file: 'pages/admin/configuration.tsx',
    replacements: [
      {
        old: `import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { Database } from '../../types/supabase';`,
        new: `import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { Database } from '../../types/supabase';
import { getUserPrimaryRole } from '../../utils/roleUtils';`
      },
      {
        old: `.select('role, first_name, last_name, avatar_url')`,
        new: `.select('first_name, last_name, avatar_url')`
      },
      {
        old: `const isAdmin = profileData?.role === 'admin';`,
        new: `const userRole = await getUserPrimaryRole(userData.user.id);
      const isAdmin = userRole === 'admin';`
      }
    ]
  },
  {
    file: 'pages/admin/consultant-assignments.tsx',
    replacements: [
      {
        old: `import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';`,
        new: `import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../utils/roleUtils';`
      },
      {
        old: `.select('role, first_name, last_name, avatar_url')`,
        new: `.select('first_name, last_name, avatar_url')`
      },
      {
        old: `if (profileData.role !== 'admin') {`,
        new: `const userRole = await getUserPrimaryRole(user.id);
        if (userRole !== 'admin') {`
      }
    ]
  }
];

async function applyFixes() {
  console.log('Applying batch fixes for role column references...\n');
  
  for (const fix of fixes) {
    const filePath = path.join(process.cwd(), fix.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`❌ File not found: ${fix.file}`);
      continue;
    }
    
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      let modified = false;
      
      for (const replacement of fix.replacements) {
        if (content.includes(replacement.old)) {
          content = content.replace(replacement.old, replacement.new);
          modified = true;
          console.log(`✅ Fixed pattern in ${fix.file}`);
        }
      }
      
      if (modified) {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ Saved ${fix.file}`);
      } else {
        console.log(`⏭️  ${fix.file} - No changes needed`);
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${fix.file}:`, error.message);
    }
  }
  
  console.log('\n\nNext steps:');
  console.log('1. Review the changes to ensure they are correct');
  console.log('2. Run tests to verify functionality');
  console.log('3. Continue fixing remaining files manually');
}

applyFixes().catch(console.error);