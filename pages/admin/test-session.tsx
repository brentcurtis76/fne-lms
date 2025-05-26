import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase'; // Uses the unified client
import type { Session } from '@supabase/supabase-js';

export default function TestSessionPage() {
  const [sessionInfo, setSessionInfo] = useState<Session | null | string>('Checking session...');
  const [userInfo, setUserInfo] = useState<string>('');

  useEffect(() => {
    console.log('TestSessionPage: useEffect triggered.');

    // Initial getSession call (as before)
    console.log('TestSessionPage: Attempting initial supabase.auth.getSession()...');
    const getInitialSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        console.log('TestSessionPage (Initial GetSession): Data:', data);
        console.log('TestSessionPage (Initial GetSession): Error:', error);
        if (data.session) {
          setSessionInfo(data.session);
          setUserInfo(`User ID: ${data.session.user.id}, Email: ${data.session.user.email}`);
          console.log('TestSessionPage (Initial GetSession): Session found:', data.session);
        } else {
          setSessionInfo('No session from initial getSession().');
          console.log('TestSessionPage (Initial GetSession): No session data returned.');
        }
      } catch (e: any) {
        console.error('TestSessionPage (Initial GetSession): Exception:', e);
        setSessionInfo('Exception during initial getSession(): ' + e.message);
      }
    };
    getInitialSession();

    // Setup onAuthStateChange listener
    console.log('TestSessionPage: Setting up onAuthStateChange listener...');
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('TestSessionPage (onAuthStateChange): Event -', event);
      console.log('TestSessionPage (onAuthStateChange): Session -', session);

      if (session) {
        setSessionInfo(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(session)) {
            setUserInfo(`User ID: ${session.user.id}, Email: ${session.user.email}`);
            return session;
          }
          return prev;
        });
      } else {
        // Handle cases where session becomes null (e.g., SIGNED_OUT, or INITIAL_SESSION without a session)
        if (event === 'SIGNED_OUT') {
          setSessionInfo('Signed out.');
          setUserInfo('');
        } else if (event === 'INITIAL_SESSION') {
          setSessionInfo(prev => 
            (prev === 'Checking session...' || prev === 'No session from initial getSession().') 
            ? 'No session from INITIAL_SESSION event.' 
            : prev
          );
        } else {
          // For other events that result in a null session but aren't explicit sign-outs
          // or initial checks, you might want to log or handle differently.
          // For now, we'll just indicate no active session if not already more specific.
          setSessionInfo(prev => 
            (typeof prev === 'object' || prev === 'Signed out.' || prev === 'No session from INITIAL_SESSION event.')
            ? 'Session became null (event: ' + event + ').'
            : prev
          );
        }
      }
    });

    // Cleanup listener on component unmount
    return () => {
      console.log('TestSessionPage: Cleaning up onAuthStateChange listener.');
      if (authListener && authListener.subscription) {
        authListener.subscription.unsubscribe();
      }
    };
  }, []);

  return (
    <div>
      <h1>Supabase Session Test Page</h1>
      <h2>Session Status:</h2>
      {typeof sessionInfo === 'string' ? (
        <p>{sessionInfo}</p>
      ) : (
        <pre>{JSON.stringify(sessionInfo, null, 2)}</pre>
      )}
      {userInfo && <h2>User Info:</h2>}
      {userInfo && <p>{userInfo}</p>}
    </div>
  );
}
