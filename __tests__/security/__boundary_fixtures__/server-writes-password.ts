// SYNTHETIC FIXTURE — a server route reaching for the raw primitive.
export async function reset(admin: any, userId: string, password: string) {
  await admin.auth.admin.updateUserById(userId, { password });
}
