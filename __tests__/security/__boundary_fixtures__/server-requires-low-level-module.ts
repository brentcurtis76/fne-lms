// SYNTHETIC NEGATIVE FIXTURE — CommonJS require bypasses a static named import.
const maintenance = require('../../../lib/auth/admin-user-maintenance');

export const write = maintenance.updateAuthUserEmail;
