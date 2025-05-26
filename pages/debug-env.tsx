export default function DebugEnv() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Environment Variables Debug</h1>
      <div className="space-y-2">
        <p><strong>NEXT_PUBLIC_SUPABASE_URL:</strong> {process.env.NEXT_PUBLIC_SUPABASE_URL || 'undefined'}</p>
        <p><strong>NEXT_PUBLIC_SUPABASE_ANON_KEY:</strong> {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Set' : 'undefined'}</p>
        <p><strong>NEXT_PUBLIC_STORAGE_BUCKET:</strong> {process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'undefined'}</p>
        <p><strong>SUPABASE_SERVICE_ROLE_KEY:</strong> {process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set' : 'undefined'}</p>
      </div>
    </div>
  );
}