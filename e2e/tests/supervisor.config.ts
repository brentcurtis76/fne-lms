/**
 * Configuration for Supervisor de Red E2E tests
 */

export const SUPERVISOR_TEST_CONFIG = {
  // Test network configuration
  networks: {
    prefix: 'E2E-Network',
    defaultDescription: 'Created by automated E2E test suite'
  },

  // Test schools to use (should exist in your test database)
  schools: {
    primary: ['Los Pellines', 'San Rafael'],
    secondary: ['Santa María', 'San José'],
    all: ['Los Pellines', 'San Rafael', 'Santa María', 'San José']
  },

  // Timeouts
  timeouts: {
    navigation: 30000,
    modal: 10000,
    notification: 5000,
    apiCall: 15000
  },

  // Selectors
  selectors: {
    // Network management page
    networkCard: '.bg-white.shadow-sm, .network-card',
    networkName: '[data-testid="network-name"], .network-name',
    schoolCount: '[data-testid="school-count"], .school-count',
    supervisorCount: '[data-testid="supervisor-count"], .supervisor-count',
    
    // Buttons
    newNetworkButton: 'button:has-text("Nueva Red")',
    manageSchoolsButton: 'button:has-text("Gestionar Escuelas")',
    manageSupervisorsButton: 'button:has-text("Gestionar Supervisores")',
    deleteButton: 'button:has-text("Eliminar"), button[aria-label="Delete"]',
    
    // Forms
    networkNameInput: 'input[name="name"], input[placeholder*="nombre"]',
    networkDescriptionInput: 'textarea[name="description"], textarea[placeholder*="descripción"]',
    
    // Notifications
    successNotification: '.toast-success, [role="alert"].bg-green-50, text=exitosamente',
    errorNotification: '.toast-error, [role="alert"].bg-red-50, text=error'
  },

  // Test user templates
  testUsers: {
    supervisorTemplate: {
      emailPrefix: 'supervisor-e2e',
      domain: '@test.com',
      defaultPassword: 'Test123456!',
      namePrefix: 'Test Supervisor'
    }
  },

  // Expected role permissions
  permissions: {
    supervisor_de_red: {
      canAccess: ['/dashboard', '/profile', '/reports'],
      cannotAccess: ['/admin/network-management', '/admin/users', '/admin/settings'],
      sidebarItems: ['Mi Panel', 'Mi Perfil', 'Reportes'],
      hiddenItems: ['Usuarios', 'Gestión de Redes', 'Configuración']
    }
  }
};

/**
 * Helper to generate unique test data
 */
export function generateTestData() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  
  return {
    networkName: `${SUPERVISOR_TEST_CONFIG.networks.prefix}-${timestamp}-${random}`,
    supervisorEmail: `${SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.emailPrefix}-${timestamp}${SUPERVISOR_TEST_CONFIG.testUsers.supervisorTemplate.domain}`,
    timestamp,
    random
  };
}

/**
 * Cleanup utilities
 */
export const cleanupActions = {
  networks: new Set<string>(),
  users: new Set<string>(),
  
  addNetwork(name: string) {
    this.networks.add(name);
  },
  
  addUser(email: string) {
    this.users.add(email);
  },
  
  async performCleanup(page: any) {
    console.log('🧹 Performing test cleanup...');
    
    // Cleanup would be implemented here
    // In practice, you might want to use API calls or database access
    // rather than UI automation for cleanup
    
    this.networks.clear();
    this.users.clear();
  }
};