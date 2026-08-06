import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => localStorage.clear());
  it('renders the three panes with the default example', () => {
    render(<App />);
    expect(screen.getByText('Temporal Logic Explorer')).toBeTruthy();
    expect(screen.getByText('AG EF r')).toBeTruthy(); // formula row (pretty-printed)
    expect(screen.getByPlaceholderText(/add formula/i)).toBeTruthy();
  });
});
