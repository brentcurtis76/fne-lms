import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase';

export default function ProfilePage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login'); // 🚨 redirect if not authenticated
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', user.id)
        .single();

      if (error) {
        setMessage('Error loading profile');
      } else {
        setName(data.name || '');
        setEmail(data.email);
      }
    };

    getProfile();
  }, [router]);

  const handleUpdate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ name })
      .eq('id', user.id);

    if (error) {
      setMessage('Failed to update name');
    } else {
      setMessage('Profile updated');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Edit Profile</h1>
      <p>
        <strong>Email:</strong> {email}
      </p>

      <div style={{ marginTop: 20 }}>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 8, width: '300px' }}
        />
        <br />
        <br />
        <button onClick={handleUpdate}>Save</button>
        <p>{message}</p>
      </div>

      <div style={{ marginTop: 40 }}>
        <button onClick={handleLogout} style={{ padding: 8 }}>
          Logout
        </button>
      </div>
    </div>
  );
}
