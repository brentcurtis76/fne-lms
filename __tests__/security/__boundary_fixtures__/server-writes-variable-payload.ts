// SYNTHETIC NEGATIVE FIXTURE — a variable hides the password-bearing payload.
export async function reset(admin: any, userId: string, password: string) {
  const payload = { password };
  await admin.auth.admin.updateUserById(userId, payload);
}
