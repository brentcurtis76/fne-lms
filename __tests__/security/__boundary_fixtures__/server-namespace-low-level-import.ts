// SYNTHETIC NEGATIVE FIXTURE — namespace imports expose future exports silently.
import * as maintenance from '../../../lib/auth/admin-user-maintenance';

export const write = maintenance.updateAuthUserEmail;
