import React from 'react'; 
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

function DummyComponent() {
  return <h1>Test Component</h1>;
}

test('renders a dummy component', () => {
  render(<DummyComponent />);
  expect(screen.getByText('Test Component')).toBeInTheDocument();
});
