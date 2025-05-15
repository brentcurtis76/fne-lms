import React from 'react';
import Link from 'next/link';

export default function Header() {
  return (
    <header style={{ padding: 20, borderBottom: '1px solid #ccc' }}>
      <nav>
        <Link href="/" style={{ marginRight: 15 }}>Home</Link>
        <Link href="/profile" style={{ marginRight: 15 }}>Profile</Link>
        <Link href="/login">Login</Link>
      </nav>
    </header>
  );
}
