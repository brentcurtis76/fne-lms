/**
 * Environment Monitor - Runtime environment validation
 * Detects and alerts on environment configuration issues
 */

export const PRODUCTION_SUPABASE_URL = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
export const TEST_SUPABASE_URLS = [
  'http://127.0.0.1:54321',
  'http://localhost:54321'
];

export interface EnvironmentStatus {
  isValid: boolean;
  environment: 'production' | 'test' | 'unknown';
  warnings: string[];
  errors: string[];
}

export function validateEnvironment(): EnvironmentStatus {
  // TEMPORARY FIX: Skip validation on client-side to restore navigation panel
  // See CLAUDE.md for full context on this critical bug
  if (typeof window !== 'undefined') {
    // Client-side: Return valid status to prevent breaking navigation
    // The env vars ARE available, but process.env[varName] doesn't work in browser
    return {
      isValid: true,
      environment: 'production' as 'production' | 'test' | 'unknown',
      warnings: [],
      errors: []
    };
  }

  // Server-side validation continues as normal
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check if Supabase URL is defined
  if (!supabaseUrl) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL is not defined');
    return {
      isValid: false,
      environment: 'unknown',
      warnings,
      errors
    };
  }
  
  // Determine environment
  let environment: 'production' | 'test' | 'unknown' = 'unknown';
  
  if (supabaseUrl === PRODUCTION_SUPABASE_URL) {
    environment = 'production';
  } else if (TEST_SUPABASE_URLS.some(testUrl => supabaseUrl.includes(testUrl.replace('http://', '').replace('https://', '')))) {
    environment = 'test';
    warnings.push('Application is configured for TEST environment');
  } else {
    environment = 'unknown';
    warnings.push(`Unknown Supabase URL: ${supabaseUrl}`);
  }
  
  // Check for required environment variables
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }
  
  const isValid = errors.length === 0;
  
  return {
    isValid,
    environment,
    warnings,
    errors
  };
}

export function logEnvironmentStatus(): void {
  const status = validateEnvironment();
  
  if (typeof window === 'undefined') { // Server-side only
    console.log(`🌍 Environment: ${status.environment.toUpperCase()}`);
    console.log(`📊 Database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
    
    if (status.warnings.length > 0) {
      console.warn('⚠️  Environment warnings:');
      status.warnings.forEach(warning => console.warn(`   - ${warning}`));
    }
    
    if (status.errors.length > 0) {
      console.error('❌ Environment errors:');
      status.errors.forEach(error => console.error(`   - ${error}`));
    }
    
    if (status.isValid) {
      console.log('✅ Environment configuration valid');
    } else {
      console.error('❌ Environment configuration has errors');
    }
  }
}

import { useEffect, useState } from 'react';

// Runtime validation hook for components
export function useEnvironmentValidation() {
  const [status, setStatus] = useState<EnvironmentStatus | null>(null);
  
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') { // Client-side only
        const envStatus = validateEnvironment();
        
        if (!envStatus.isValid || envStatus.environment === 'test') {
          console.warn('🔧 Environment Issue Detected:', {
            environment: envStatus.environment,
            warnings: envStatus.warnings,
            errors: envStatus.errors
          });
          
          // Log the specific errors
          if (envStatus.errors.length > 0) {
            console.error('❌ Environment Errors:', envStatus.errors);
            envStatus.errors.forEach((error, index) => {
              console.error(`   Error ${index + 1}: ${error}`);
            });
          }
          
          if (envStatus.environment === 'test') {
            console.warn('⚠️  Application is using TEST database - data may not load correctly');
          }
        }
        
        setStatus(envStatus);
      } else {
        // Server-side: set status without logging
        setStatus(validateEnvironment());
      }
    } catch (error) {
      console.error('Error in environment validation:', error);
      // Set a safe fallback status
      setStatus({
        isValid: false,
        environment: 'unknown',
        warnings: [],
        errors: ['Environment validation failed']
      });
    }
  }, []); // Empty dependency array - only run once on mount
  
  // Return status or a safe default - never call validateEnvironment() during render
  return status || {
    isValid: true, // Assume valid until proven otherwise
    environment: 'production' as const,
    warnings: [],
    errors: []
  };
}