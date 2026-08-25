// SYNTHETIC NEGATIVE FIXTURE — destructuring aliases the raw method.
export async function reset(admin: any, userId: string, password: string) {
  const { updateUserById: write } = admin.auth.admin;
  await write(userId, { password });
}
