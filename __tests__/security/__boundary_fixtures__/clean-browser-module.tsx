// SYNTHETIC FIXTURE — the positive control. Talks about passwords in prose and
// in strings, calls the trusted endpoint, and must NOT be flagged.
//
// A regex scan for `updateUser({ password` or `must_change_password:` would trip
// on the comment above and on the strings below. This one does not, because it
// parses.
export async function change(newPassword: string) {
  const label = 'must_change_password: true';
  await fetch('/api/auth/force-password-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword, label }),
  });
  return label;
}
