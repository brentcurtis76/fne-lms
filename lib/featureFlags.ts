// Feature flag management system
// All flags default to false for production safety

export function isFeatureEnabled(flag: string): boolean {
  // Server-side check
  if (typeof window === 'undefined') {
    return process.env[flag] === 'true';
  }
  
  // Client-side check - Next.js requires direct property access
  // Cannot use dynamic keys with process.env in browser
  switch (flag) {
    case 'FEATURE_SUPERADMIN_RBAC':
      return process.env.NEXT_PUBLIC_FEATURE_SUPERADMIN_RBAC === 'true';
    case 'RBAC_DEV_MOCK':
      return process.env.NEXT_PUBLIC_RBAC_DEV_MOCK === 'true';
    default:
      return false;
  }
}

// Type-safe feature flags
export const FeatureFlags = {
  SUPERADMIN_RBAC: 'FEATURE_SUPERADMIN_RBAC',
  RBAC_DEV_MOCK: 'RBAC_DEV_MOCK'
} as const;

export type FeatureFlagKey = typeof FeatureFlags[keyof typeof FeatureFlags];