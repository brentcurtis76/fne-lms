// SYNTHETIC NEGATIVE FIXTURE — a spread hides the password-bearing property.
export async function reset(admin: any, userId: string, password: string) {
  const credential = { password };
  await admin.auth.admin.updateUserById(userId, { ...credential });
}
