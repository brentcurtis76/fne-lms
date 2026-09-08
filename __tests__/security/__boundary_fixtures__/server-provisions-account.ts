// SYNTHETIC FIXTURE — provisioning outside the allow-list.
export async function make(admin: any, email: string, password: string) {
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
}
