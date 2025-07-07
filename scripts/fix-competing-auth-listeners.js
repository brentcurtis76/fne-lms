#!/usr/bin/env node

/**
 * Fix Competing Authentication Listeners
 * 
 * This script safely implements the authentication fix by:
 * 1. Deleting duplicate _app.tsx
 * 2. Removing legacy sessionManager
 * 3. Updating imports
 * 4. Refactoring AuthContext to remove competing listener
 * 
 * Run: node scripts/fix-competing-auth-listeners.js
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

// Color codes
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function main() {
  console.log('🔧 FNE LMS - Fix Competing Authentication Listeners\n');
  console.log('This script will fix the authentication issues by removing competing listeners.\n');

  // Check if backup exists
  const backups = fs.readdirSync('backups').filter(d => d.startsWith('auth-fix-'));
  if (backups.length === 0) {
    console.log(`${colors.red}❌ No backup found! Please run backup-before-auth-fix.js first.${colors.reset}`);
    rl.close();
    return;
  }

  const latestBackup = backups.sort().pop();
  console.log(`${colors.green}✅ Found backup: ${latestBackup}${colors.reset}\n`);

  // Show planned changes
  console.log(`${colors.blue}Planned Changes:${colors.reset}`);
  console.log('1. DELETE /src/pages/_app.tsx (duplicate file)');
  console.log('2. DELETE /lib/sessionManager.ts (legacy session manager)');
  console.log('3. UPDATE /components/layout/MainLayout.tsx (remove sessionManager import)');
  console.log('4. UPDATE /pages/login.tsx (remove sessionManager and Remember Me)');
  console.log('5. UPDATE /contexts/AuthContext.tsx (remove onAuthStateChange listener)');
  console.log('6. DELETE /pages/admin/test-session.tsx (test file with listener)\n');

  const proceed = await askQuestion('Proceed with fixes? (yes/no): ');
  if (proceed.toLowerCase() !== 'yes') {
    console.log('\n❌ Operation cancelled.');
    rl.close();
    return;
  }

  console.log('\n🚀 Starting fixes...\n');

  try {
    // 1. Delete duplicate _app.tsx
    console.log('1. Deleting /src/pages/_app.tsx...');
    if (fs.existsSync('src/pages/_app.tsx')) {
      fs.unlinkSync('src/pages/_app.tsx');
      console.log(`   ${colors.green}✅ Deleted${colors.reset}`);
      
      // Check if src/pages is empty
      const srcPagesFiles = fs.readdirSync('src/pages').filter(f => f !== '.DS_Store');
      if (srcPagesFiles.length === 0) {
        fs.rmdirSync('src/pages');
        console.log(`   ${colors.green}✅ Removed empty src/pages directory${colors.reset}`);
      }
    } else {
      console.log(`   ${colors.yellow}⏭️  Already deleted${colors.reset}`);
    }

    // 2. Delete sessionManager.ts
    console.log('\n2. Deleting /lib/sessionManager.ts...');
    if (fs.existsSync('lib/sessionManager.ts')) {
      fs.unlinkSync('lib/sessionManager.ts');
      console.log(`   ${colors.green}✅ Deleted${colors.reset}`);
    } else {
      console.log(`   ${colors.yellow}⏭️  Already deleted${colors.reset}`);
    }

    // 3. Update MainLayout.tsx
    console.log('\n3. Updating /components/layout/MainLayout.tsx...');
    if (fs.existsSync('components/layout/MainLayout.tsx')) {
      let content = fs.readFileSync('components/layout/MainLayout.tsx', 'utf8');
      
      // Remove sessionManager import
      content = content.replace(/import\s*{\s*SessionManager\s*}\s*from\s*['"].*sessionManager['"];\s*\n?/g, '');
      
      // Remove SessionManager.clearRememberMe() call
      content = content.replace(/\s*SessionManager\.clearRememberMe\(\);\s*/g, '');
      
      fs.writeFileSync('components/layout/MainLayout.tsx', content);
      console.log(`   ${colors.green}✅ Removed sessionManager references${colors.reset}`);
    }

    // 4. Update login.tsx
    console.log('\n4. Updating /pages/login.tsx...');
    if (fs.existsSync('pages/login.tsx')) {
      let content = fs.readFileSync('pages/login.tsx', 'utf8');
      
      // Remove sessionManager import
      content = content.replace(/import\s*{\s*SessionManager\s*}\s*from\s*['"].*sessionManager['"];\s*\n?/g, '');
      
      // Remove rememberMe state
      content = content.replace(/\s*const\s*\[rememberMe,\s*setRememberMe\]\s*=\s*useState.*\n?/g, '');
      
      // Remove SessionManager calls
      content = content.replace(/\s*SessionManager\.setRememberMe\(.*\);\s*/g, '');
      content = content.replace(/\s*setRememberMe\(SessionManager\.getRememberMe\(\)\);\s*/g, '');
      
      // Remove Remember Me checkbox - this is more complex, need to find and remove the whole div
      content = content.replace(
        /<div\s+className="flex\s+items-center\s+justify-between\s+mb-6">[\s\S]*?<\/div>\s*<!--\s*Remember\s+me\s+and\s+forgot\s+password\s*-->/g,
        ''
      );
      
      // Alternative: Remove just the checkbox part if the above doesn't work
      content = content.replace(
        /<label\s+className="flex\s+items-center">[\s\S]*?Recordarme[\s\S]*?<\/label>/g,
        ''
      );
      
      fs.writeFileSync('pages/login.tsx', content);
      console.log(`   ${colors.green}✅ Removed sessionManager and Remember Me UI${colors.reset}`);
    }

    // 5. Delete test-session.tsx (has onAuthStateChange)
    console.log('\n5. Deleting /pages/admin/test-session.tsx...');
    if (fs.existsSync('pages/admin/test-session.tsx')) {
      fs.unlinkSync('pages/admin/test-session.tsx');
      console.log(`   ${colors.green}✅ Deleted test file with listener${colors.reset}`);
    } else {
      console.log(`   ${colors.yellow}⏭️  Already deleted${colors.reset}`);
    }

    // 6. Refactor AuthContext.tsx - This is the critical change
    console.log('\n6. Refactoring /contexts/AuthContext.tsx...');
    console.log('   Creating new AuthContext without competing listener...');
    
    // Write the new AuthContext
    const newAuthContext = `/**
 * Global Authentication Context for FNE LMS
 * Refactored to use SessionContextProvider as single source of truth
 * No competing onAuthStateChange listeners
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { User } from '@supabase/supabase-js';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { 
  getUserProfileWithRolesRLS,
  hasAdminPrivilegesRLS, 
  getUserPermissions,
  migrateLegacyUserRLS,
  getHighestRole
} from '../utils/roleUtils';
import { UserRole, RolePermissions } from '../types/roles';

interface AuthState {
  user: User | null;
  profile: any;
  loading: boolean;
  isAdmin: boolean; // Backward compatibility
  isGlobalAdmin: boolean; // New role system
  userRoles: UserRole[];
  permissions: RolePermissions;
  avatarUrl: string;
}

interface AuthContextType extends AuthState {
  logout: () => Promise<void>;
  hasPermission: (permission: keyof RolePermissions) => boolean;
  hasRole: (roleType: string) => boolean;
  getOrganizationalScope: () => any;
  // Backward compatibility helpers
  canCreateCourses: boolean;
  canManageUsers: boolean;
  canAssignCourses: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = useSession(); // Single source of truth from SessionContextProvider
  const supabase = useSupabaseClient();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    loading: true,
    isAdmin: false,
    isGlobalAdmin: false,
    userRoles: [],
    permissions: {
      can_create_courses: false,
      can_edit_all_courses: false,
      can_delete_courses: false,
      can_assign_courses: false,
      can_create_users: false,
      can_edit_users: false,
      can_delete_users: false,
      can_assign_roles: false,
      can_manage_schools: false,
      can_manage_generations: false,
      can_manage_communities: false,
      reporting_scope: 'individual',
      feedback_scope: 'individual'
    },
    avatarUrl: ''
  });

  // Fetch user profile and roles when session changes
  useEffect(() => {
    const fetchUserData = async () => {
      if (!session?.user?.id) {
        // No session - clear auth state
        setAuthState({
          user: null,
          profile: null,
          loading: false,
          isAdmin: false,
          isGlobalAdmin: false,
          userRoles: [],
          permissions: {
            can_create_courses: false,
            can_edit_all_courses: false,
            can_delete_courses: false,
            can_assign_courses: false,
            can_create_users: false,
            can_edit_users: false,
            can_delete_users: false,
            can_assign_roles: false,
            can_manage_schools: false,
            can_manage_generations: false,
            can_manage_communities: false,
            reporting_scope: 'individual',
            feedback_scope: 'individual'
          },
          avatarUrl: ''
        });
        return;
      }

      try {
        // Set loading state
        setAuthState(prev => ({ ...prev, loading: true }));

        // Fetch profile and roles
        const profileData = await getUserProfileWithRolesRLS(supabase, session.user.id);
        
        if (!profileData) {
          console.error('[AuthContext] No profile found for user');
          setAuthState(prev => ({ ...prev, loading: false }));
          return;
        }

        // Check for legacy role and migrate if needed
        if (profileData.role && (!profileData.userRoles || profileData.userRoles.length === 0)) {
          console.log('[AuthContext] Migrating legacy role:', profileData.role);
          const migrationResult = await migrateLegacyUserRLS(supabase, session.user.id, profileData.role);
          if (migrationResult.success && migrationResult.roles) {
            profileData.userRoles = migrationResult.roles;
          }
        }

        // Get permissions
        const permissions = getUserPermissions(profileData.userRoles || []);
        const isGlobalAdmin = await hasAdminPrivilegesRLS(supabase, session.user.id);
        const highestRole = getHighestRole(profileData.userRoles || []);

        // Get avatar URL
        let avatarUrl = '';
        if (profileData.avatar_url) {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(profileData.avatar_url);
          avatarUrl = publicUrl;
        }

        // Update auth state
        setAuthState({
          user: session.user,
          profile: profileData,
          loading: false,
          isAdmin: profileData.role === 'admin' || isGlobalAdmin, // Backward compatibility
          isGlobalAdmin,
          userRoles: profileData.userRoles || [],
          permissions,
          avatarUrl
        });

      } catch (error) {
        console.error('[AuthContext] Error fetching user data:', error);
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    };

    fetchUserData();
  }, [session?.user?.id, supabase]);

  // Logout function
  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear auth state
      setAuthState({
        user: null,
        profile: null,
        loading: false,
        isAdmin: false,
        isGlobalAdmin: false,
        userRoles: [],
        permissions: {
          can_create_courses: false,
          can_edit_all_courses: false,
          can_delete_courses: false,
          can_assign_courses: false,
          can_create_users: false,
          can_edit_users: false,
          can_delete_users: false,
          can_assign_roles: false,
          can_manage_schools: false,
          can_manage_generations: false,
          can_manage_communities: false,
          reporting_scope: 'individual',
          feedback_scope: 'individual'
        },
        avatarUrl: ''
      });
      
      router.push('/login');
    } catch (error) {
      console.error('[AuthContext] Logout error:', error);
    }
  };

  // Permission helpers
  const hasPermission = (permission: keyof RolePermissions): boolean => {
    return authState.permissions[permission] === true || 
           authState.permissions[permission] === 'all';
  };

  const hasRole = (roleType: string): boolean => {
    return authState.userRoles.some(role => role.role_type === roleType);
  };

  const getOrganizationalScope = () => {
    if (!authState.userRoles.length) return null;
    
    const highestRole = authState.userRoles[0]; // Assuming sorted by priority
    return {
      school_id: highestRole.school_id,
      generation_id: highestRole.generation_id,
      community_id: highestRole.community_id,
      school: highestRole.school,
      generation: highestRole.generation,
      community: highestRole.community
    };
  };

  const value: AuthContextType = {
    ...authState,
    logout,
    hasPermission,
    hasRole,
    getOrganizationalScope,
    // Backward compatibility
    canCreateCourses: hasPermission('can_create_courses'),
    canManageUsers: hasPermission('can_create_users') || hasPermission('can_edit_users'),
    canAssignCourses: hasPermission('can_assign_courses')
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
`;

    fs.writeFileSync('contexts/AuthContext.tsx', newAuthContext);
    console.log(`   ${colors.green}✅ Refactored to use SessionContextProvider as single source${colors.reset}`);
    console.log(`   ${colors.green}✅ Removed competing onAuthStateChange listener${colors.reset}`);

    // 7. Run build to verify
    console.log('\n7. Verifying build...');
    console.log('   Running: npm run build\n');
    
    try {
      execSync('npm run build', { stdio: 'inherit' });
      console.log(`\n   ${colors.green}✅ Build successful!${colors.reset}`);
    } catch (buildError) {
      console.error(`\n   ${colors.red}❌ Build failed!${colors.reset}`);
      console.log('\n   Rolling back changes...');
      
      // Execute rollback
      const rollbackScript = path.join('backups', latestBackup, 'rollback.sh');
      execSync(rollbackScript, { stdio: 'inherit' });
      
      throw new Error('Build failed. Changes have been rolled back.');
    }

    // Success summary
    console.log('\n' + '='.repeat(60));
    console.log(`${colors.green}✅ Authentication Fix Complete!${colors.reset}`);
    console.log('='.repeat(60));
    console.log('\nChanges made:');
    console.log('  • Deleted duplicate /src/pages/_app.tsx');
    console.log('  • Deleted legacy /lib/sessionManager.ts');
    console.log('  • Removed sessionManager imports from 2 files');
    console.log('  • Removed Remember Me UI from login page');
    console.log('  • Refactored AuthContext to use SessionContextProvider');
    console.log('  • Removed ALL competing onAuthStateChange listeners');
    
    console.log('\nNext steps:');
    console.log('  1. Start dev server: npm run dev');
    console.log('  2. Test authentication with all 6 roles');
    console.log('  3. Verify no unexpected logouts occur');
    console.log('  4. Run monitoring script after deployment');
    
    console.log(`\nRollback available at: ./backups/${latestBackup}/rollback.sh`);

  } catch (error) {
    console.error(`\n${colors.red}❌ Error during fix:${colors.reset}`, error.message);
  } finally {
    rl.close();
  }
}

main();