/**
 * QA Test User Mapping
 *
 * Maps role types to their corresponding QA test user accounts.
 * These accounts are used for automated scenario assignment when
 * admins generate scenarios targeted at specific roles.
 */

export interface QATestUser {
  email: string;
  userId: string;
  role: string;
  displayName: string;
}

/**
 * Mapping of role types to their designated QA test user accounts.
 * User IDs are from the production database.
 */
export const ROLE_TO_QA_TEST_USER: Record<string, QATestUser> = {
  admin: {
    email: 'admin.qa@fne.cl',
    userId: '7650804a-fe7d-476a-b988-25ce6201aeda',
    role: 'admin',
    displayName: 'Admin QA',
  },
  docente: {
    email: 'docente.qa@fne.cl',
    userId: '14ee694e-b615-40d1-b7db-f219aa88b4b3',
    role: 'docente',
    displayName: 'Docente QA',
  },
  consultor: {
    email: 'consultor.qa@fne.cl',
    userId: '16943651-af94-41d7-8da3-2b9e3f7d3f69',
    role: 'consultor',
    displayName: 'Consultor QA',
  },
  equipo_directivo: {
    email: 'directivo.qa@fne.cl',
    userId: 'a3e29412-0903-49dc-b5f4-530eab2ffb7f',
    role: 'equipo_directivo',
    displayName: 'Directivo QA',
  },
  supervisor_de_red: {
    email: 'supervisor.qa@fne.cl',
    userId: '873ef5ad-b4b6-441f-8e14-fa7752d18af3',
    role: 'supervisor_de_red',
    displayName: 'Supervisor QA',
  },
  lider_comunidad: {
    email: 'lider.qa@fne.cl',
    userId: '71ae0033-8d35-40bd-a141-e6da44b664fa',
    role: 'lider_comunidad',
    displayName: 'Líder Comunidad QA',
  },
  lider_generacion: {
    email: 'lider.qa@fne.cl', // Shares with lider_comunidad for now
    userId: '71ae0033-8d35-40bd-a141-e6da44b664fa',
    role: 'lider_generacion',
    displayName: 'Líder Generación QA',
  },
};

/**
 * Multi-user test accounts for collaborative space testing.
 * All in the same community for real-time sync testing.
 */
export const MULTI_USER_TEST_ACCOUNTS: QATestUser[] = [
  {
    email: 'estudiante1.qa@fne.cl',
    userId: 'cda02f7e-575f-40b1-bb5f-2ce446133112',
    role: 'docente',
    displayName: 'Estudiante 1 QA (Tab 1)',
  },
  {
    email: 'estudiante2.qa@fne.cl',
    userId: 'd5549238-0f3d-4ce7-b500-37dc4e1d9b46',
    role: 'docente',
    displayName: 'Estudiante 2 QA (Tab 2)',
  },
  {
    email: 'estudiante3.qa@fne.cl',
    userId: '2898b0d8-9fa6-43fe-8a07-19f6ad4af533',
    role: 'docente',
    displayName: 'Estudiante 3 QA (Tab 3)',
  },
  {
    email: 'docente.comunidad.qa@fne.cl',
    userId: 'f8025409-aeb7-4738-93bc-0becaac133d4',
    role: 'docente',
    displayName: 'Docente Comunidad QA',
  },
];

/**
 * Get the QA test user for a given role.
 * Returns undefined if no mapping exists.
 */
export function getQATestUserForRole(role: string): QATestUser | undefined {
  return ROLE_TO_QA_TEST_USER[role];
}

/**
 * Get QA test user by email address.
 */
export function getQATestUserByEmail(email: string): QATestUser | undefined {
  // Check role mapping first
  const fromRoleMapping = Object.values(ROLE_TO_QA_TEST_USER).find(
    (u) => u.email === email
  );
  if (fromRoleMapping) return fromRoleMapping;

  // Check multi-user accounts
  return MULTI_USER_TEST_ACCOUNTS.find((u) => u.email === email);
}

/**
 * Check if an email belongs to a QA test account.
 */
export function isQATestAccount(email: string): boolean {
  return email.endsWith('.qa@fne.cl');
}

/**
 * Get all QA test user emails.
 */
export function getAllQATestEmails(): string[] {
  const roleEmails = Object.values(ROLE_TO_QA_TEST_USER).map((u) => u.email);
  const multiUserEmails = MULTI_USER_TEST_ACCOUNTS.map((u) => u.email);
  return [...new Set([...roleEmails, ...multiUserEmails])];
}
