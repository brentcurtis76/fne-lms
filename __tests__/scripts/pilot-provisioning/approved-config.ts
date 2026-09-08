/** A fully approved allowlist, built in-test: the committed file ships unapproved on purpose. */
export const STAGING_REF = 'abcdefghijklmnopqrst';
export const PROD_REF = 'zyxwvutsrqponmlkjihg';

export function approvedConfig() {
  return Object.freeze({
    schemaVersion: 1,
    targets: {
      staging: {
        projectRef: STAGING_REF,
        supabaseUrl: `https://${STAGING_REF}.supabase.co`,
        environmentClass: 'staging',
        keyEnv: 'PILOT_STAGING_SERVICE_ROLE_KEY',
        approved: true,
      },
      realPilot: {
        projectRef: PROD_REF,
        supabaseUrl: `https://${PROD_REF}.supabase.co`,
        environmentClass: 'production',
        keyEnv: 'PILOT_REALPILOT_SERVICE_ROLE_KEY',
        approved: true,
      },
    },
  });
}
