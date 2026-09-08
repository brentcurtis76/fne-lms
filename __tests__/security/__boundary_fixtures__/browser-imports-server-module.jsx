// SYNTHETIC FIXTURE — deliberately .jsx.
import { completeForcedPasswordChange } from '../../../lib/auth/password-completion';

export default function Bad() {
  return <span>{typeof completeForcedPasswordChange}</span>;
}
