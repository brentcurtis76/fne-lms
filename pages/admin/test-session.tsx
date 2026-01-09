import { useSession } from '@supabase/auth-helpers-react';

export default function TestSessionPage() {
  const session = useSession();

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      <h1>Supabase Session Test Page</h1>
      <h2>Session Status (from useSession hook):</h2>
      {session === undefined && <p>Loading session...</p>}
      {session === null && <p>No active session.</p>}
      {session && (
        <>
          <h2>User Info:</h2>
          <p>User ID: {session.user.id}</p>
          <p>Email: {session.user.email}</p>
          <p>Last Signed In: {session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString() : 'N/A'}</p>
          <h2>Full Session Object:</h2>
          <pre>{JSON.stringify(session, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
