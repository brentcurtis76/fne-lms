import pg from 'pg';
import { E2E_USERS } from './auth';

/** Disclosed Production-like bucket model, exclusively for loopback synthetic tests. */
export async function prepareFneStorageFixture(): Promise<void> {
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_DB_URL']) {
    const url = new URL(process.env[key] || '');
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('FNE fixture requires a loopback stack');
  }
  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, email FROM auth.users WHERE email = ANY($1)',
      [[E2E_USERS.gcLeader.email, E2E_USERS.consultorAssigned.email]]);
    if (rows.length !== 2) throw new Error('Seed the two synthetic E2E role accounts first');
    await client.query(`INSERT INTO storage.buckets (id, name, public) VALUES
      ('facturas','facturas',true), ('resources','resources',true), ('fneanon-other','fneanon-other',true)
      ON CONFLICT (id) DO NOTHING`);
    // Do not replace production policies: these names exist only in the disposable model.
    for (const bucket of ['facturas', 'resources', 'fneanon-other']) {
      const name = `FNE CI model ${bucket}`;
      const { rowCount } = await client.query('SELECT 1 FROM pg_policy WHERE polrelid = $1::regclass AND polname=$2', ['storage.objects', name]);
      if (!rowCount) await client.query(`CREATE POLICY "${name}" ON storage.objects FOR ALL TO public
        USING (bucket_id='${bucket}') WITH CHECK (bucket_id='${bucket}')`);
    }
    const community = 'e2e00000-0000-4000-8000-000000000c01';
    const consultor = rows.find(row => row.email === E2E_USERS.consultorAssigned.email).id;
    await client.query(`INSERT INTO public.community_workspaces (community_id) SELECT $1
      WHERE NOT EXISTS (SELECT 1 FROM public.community_workspaces WHERE community_id=$1)`, [community]);
    await client.query(`INSERT INTO public.user_roles (id,user_id,role_type,school_id,community_id,is_active)
      SELECT 'fa0e0000-0000-4000-8000-000000000032',$1,'consultor',990001,$2,true
      WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role_type='consultor' AND community_id=$2 AND is_active)`, [consultor,community]);
    await client.query('REFRESH MATERIALIZED VIEW public.user_roles_cache');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
