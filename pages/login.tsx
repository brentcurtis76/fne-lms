import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage('Login failed: ' + error.message);
    } else {
      setMessage('Login successful!');
      router.push('/profile'); // ✅ redirect to profile page
    }
  };

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setMessage('Signup failed: ' + error.message);
    } else {
      setMessage('Signup successful! Check your email for confirmation.');
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Login or Sign Up</h1>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ padding: 8, width: '300px', marginRight: 10 }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ padding: 8, width: '300px' }}
      />
      <br /><br />
      <button onClick={handleSignIn} style={{ marginRight: 10 }}>Sign In</button>
      <button onClick={handleSignUp}>Sign Up</button>
      <p>{message}</p>
    </div>
  );
}