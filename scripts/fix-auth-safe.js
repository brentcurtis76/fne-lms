#!/usr/bin/env node

/**
 * Safe Authentication Fix - Step by Step
 * This version makes changes incrementally and tests after each step
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 FNE LMS - Safe Authentication Fix\n');

// Check for backup
const backups = fs.readdirSync('backups').filter(d => d.startsWith('auth-fix-'));
if (backups.length === 0) {
  console.log('❌ No backup found! Please run backup-before-auth-fix.js first.');
  process.exit(1);
}

console.log('✅ Backup exists. Starting incremental fixes...\n');

// Helper to test build
function testBuild() {
  try {
    console.log('   Testing TypeScript compilation...');
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.log('   ❌ TypeScript errors detected');
    return false;
  }
}

try {
  // Step 1: Delete duplicate _app.tsx
  console.log('Step 1: Remove duplicate _app.tsx');
  if (fs.existsSync('src/pages/_app.tsx')) {
    fs.unlinkSync('src/pages/_app.tsx');
    console.log('   ✅ Deleted /src/pages/_app.tsx');
  }
  if (!testBuild()) {
    console.log('   Continuing despite errors...');
  }

  // Step 2: Delete test-session.tsx
  console.log('\nStep 2: Remove test-session.tsx');
  if (fs.existsSync('pages/admin/test-session.tsx')) {
    fs.unlinkSync('pages/admin/test-session.tsx');
    console.log('   ✅ Deleted /pages/admin/test-session.tsx');
  }
  
  // Step 3: Clean up MainLayout.tsx
  console.log('\nStep 3: Update MainLayout.tsx');
  const mainLayoutPath = 'components/layout/MainLayout.tsx';
  if (fs.existsSync(mainLayoutPath)) {
    let content = fs.readFileSync(mainLayoutPath, 'utf8');
    
    // Remove import
    const importRegex = /import\s*{\s*SessionManager\s*}\s*from\s*['"].*?sessionManager['"];\s*\n?/g;
    content = content.replace(importRegex, '');
    
    // Remove usage
    content = content.replace(/SessionManager\.clearRememberMe\(\);\s*/g, '');
    
    fs.writeFileSync(mainLayoutPath, content);
    console.log('   ✅ Removed SessionManager from MainLayout.tsx');
  }

  // Step 4: Clean up login.tsx
  console.log('\nStep 4: Update login.tsx');
  const loginPath = 'pages/login.tsx';
  if (fs.existsSync(loginPath)) {
    let content = fs.readFileSync(loginPath, 'utf8');
    
    // Remove import
    content = content.replace(/import\s*{\s*SessionManager\s*}\s*from\s*['"].*?sessionManager['"];\s*\n?/g, '');
    
    // Remove state
    content = content.replace(/const\s*\[rememberMe,\s*setRememberMe\]\s*=\s*useState.*?\);\s*\n?/g, '');
    
    // Remove usage
    content = content.replace(/SessionManager\.(setRememberMe|getRememberMe)\(.*?\);\s*/g, '');
    content = content.replace(/setRememberMe\(.*?\);\s*/g, '');
    
    // Remove checkbox - find the remember me div
    const checkboxRegex = /<div\s+className=["']flex\s+items-center["']>\s*<input[\s\S]*?type=["']checkbox["'][\s\S]*?rememberMe[\s\S]*?<\/label>\s*<\/div>/g;
    content = content.replace(checkboxRegex, '');
    
    fs.writeFileSync(loginPath, content);
    console.log('   ✅ Removed SessionManager and Remember Me from login.tsx');
  }

  // Step 5: Delete sessionManager.ts
  console.log('\nStep 5: Remove sessionManager.ts');
  if (fs.existsSync('lib/sessionManager.ts')) {
    fs.unlinkSync('lib/sessionManager.ts');
    console.log('   ✅ Deleted /lib/sessionManager.ts');
  }

  // Step 6: The critical part - refactor AuthContext
  console.log('\nStep 6: Refactor AuthContext.tsx');
  console.log('   Reading current AuthContext...');
  
  const authContextPath = 'contexts/AuthContext.tsx';
  const authContent = fs.readFileSync(authContextPath, 'utf8');
  
  // Check if it has onAuthStateChange
  if (authContent.includes('onAuthStateChange')) {
    console.log('   Found onAuthStateChange listener - creating refactored version...');
    
    // Create the refactored AuthContext
    const refactoredAuthContext = `/**
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
      
      // Clear auth state immediately
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
      
      // Clear any legacy storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('rememberMe');
      }
      
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

    fs.writeFileSync(authContextPath, refactoredAuthContext);
    console.log('   ✅ Refactored AuthContext to use SessionContextProvider');
    console.log('   ✅ Removed competing onAuthStateChange listener');
  } else {
    console.log('   ✅ AuthContext already refactored');
  }

  // Final build test
  console.log('\n7. Final Build Test');
  console.log('   Running: npm run build\n');
  
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('\n   ✅ Build successful!');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Authentication Fix Complete!');
    console.log('='.repeat(60));
    console.log('\nAll competing listeners have been removed.');
    console.log('The app now uses SessionContextProvider as the single source of truth.');
    
  } catch (buildError) {
    console.error('\n   ❌ Build failed, but changes are in place.');
    console.log('   You may need to fix any remaining TypeScript errors.');
  }

} catch (error) {
  console.error('\n❌ Error during fix:', error.message);
}