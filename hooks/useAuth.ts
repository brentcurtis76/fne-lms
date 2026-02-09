/**
 * Authentication Hook for Genera
 * Re-exports useAuth from AuthContext for backward compatibility.
 * All auth state is shared via a single AuthProvider in _app.tsx.
 */

export { useAuth } from '../contexts/AuthContext';
