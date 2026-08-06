import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => localStorage.clear());
  it('renders the three panes with the default example', () => {
    render(<App />);
    expect(screen.getByText('Temporal Logic Explorer')).toBeTruthy();
    expect(screen.getByText('AG EF r')).toBeTruthy(); // formula row (pretty-printed)
    expect(screen.getByPlaceholderText(/add formula/i)).toBeTruthy();
  });

  it('shows verdicts for the default example formulas', () => {
    render(<App />);
    // Reset example: AG EF r ✓, AF r ✗, AG (w → EX true) ✓
    const rows = document.querySelectorAll('.formula-row');
    expect(rows.length).toBe(3);
    const verdicts = [...rows].map((r) => r.querySelector('.verdict')!.textContent);
    expect(verdicts).toEqual(['✓', '✗', '✓']);
  });

  it('adding an LTL-style formula shows a parse-error row and hint in inspector', () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/add formula/i);
    fireEvent.change(input, { target: { value: 'FG w' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const rows = document.querySelectorAll('.formula-row');
    expect(rows.length).toBe(4);
    const last = rows[rows.length - 1];
    expect(last.querySelector('.verdict')!.textContent).toBe('⚠');
    fireEvent.click(last);
    // "path quantifier" appears in both the error message and the hint text,
    // so use getAllByText rather than getByText (which requires a single match).
    expect(screen.getAllByText(/path quantifier/i).length).toBeGreaterThan(0);
  });

  it('selecting a formula shows its subformula tree; clicking a node shows gloss', () => {
    render(<App />);
    fireEvent.click(screen.getByText('AG EF r'));
    const nodeRows = document.querySelectorAll('.node-row');
    expect(nodeRows.length).toBe(3); // AG, EF, r
    fireEvent.click(nodeRows[1]); // EF r
    expect(screen.getByText('on some path, eventually')).toBeTruthy();
  });

  it('persists model and formulas to localStorage', () => {
    render(<App />);
    const saved = JSON.parse(localStorage.getItem('temporal-logic-explorer-v1')!);
    expect(saved.model.states.length).toBe(3);
    expect(saved.formulas.length).toBe(3);
  });
});
