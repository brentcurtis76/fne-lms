// SYNTHETIC NEGATIVE FIXTURE — aliasing weakens a reviewable import surface.
import { updateAuthUserEmail as updateUserById } from '../../../lib/auth/admin-user-maintenance';

export const write = updateUserById;
