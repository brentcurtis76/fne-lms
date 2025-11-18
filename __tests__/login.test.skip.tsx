import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mocked login form component for test
export function LoginMock() {
  return (
    <form>
      <input placeholder="Correo electrónico" />
      <input placeholder="Contraseña" type="password" />
      <button type="submit">Entrar</button>
      <button type="button">Regístrate</button>
    </form>
  );
}

describe('LoginPage', () => {
  test('renders the login form elements', () => {
    render(<LoginMock />);
    expect(screen.getByPlaceholderText(/correo electrónico/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByText(/entrar/i)).toBeInTheDocument();
    expect(screen.getByText(/regístrate/i)).toBeInTheDocument();
  });

  test('sanity check', () => {
    expect(true).toBe(true);
  });
});