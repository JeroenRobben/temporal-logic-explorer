import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

describe('learn ? links', () => {
  beforeEach(() => localStorage.clear());

  it('palette buttons with a known reference render a ? that opens the Learn reference', () => {
    render(<App />);
    // default entry logic is CTL: EF and the five booleans are mapped
    const efQ = document.querySelector('[data-learn="palette-EF"]');
    expect(efQ).toBeTruthy();
    expect(efQ!.textContent).toBe('?');
    expect(document.querySelector('[data-learn="palette-∧"]')).toBeTruthy();
    fireEvent.click(efQ!);
    // Learn tab opened on the EF reference
    expect(screen.getByText('Exists-Finally (reachability)')).toBeTruthy();
  });

  it('selecting a subformula node in the Inspector shows a ? link into the same reference', () => {
    localStorage.setItem('temporal-logic-explorer-v1', JSON.stringify({
      model: {
        states: [
          { id: 's', name: 's', propositions: [], isInitial: true, x: 100, y: 100 },
          { id: 't', name: 't', propositions: ['p'], isInitial: false, x: 200, y: 100 },
        ],
        transitions: [{ from: 's', to: 't' }, { from: 't', to: 't' }],
      },
      formulas: [{ id: 'f-ef', text: 'EF p', logic: 'ctl' }],
      trace: null,
    }));
    render(<App />);
    fireEvent.click(screen.getByText('EF p', { selector: '.text' }));
    const nodeRows = document.querySelectorAll('.node-row');
    expect(nodeRows.length).toBeGreaterThan(0);
    fireEvent.click(nodeRows[0]); // EF p root — kind 'EF'
    const q = screen.getByText('? what is this');
    fireEvent.click(q);
    expect(screen.getByText('Exists-Finally (reachability)')).toBeTruthy();
  });

  it('palette buttons without a mapped reference render no ?', () => {
    render(<App />);
    // the CTL Until snippets are unmapped until Task 9 lands their references
    expect(screen.getByText('A[▢U▢]')).toBeTruthy(); // the button itself exists
    expect(document.querySelector('[data-learn="palette-A[▢U▢]"]')).toBeNull();
    expect(document.querySelector('[data-learn="palette-E[▢U▢]"]')).toBeNull();
  });

  it('inspector anchors exist for tutorial highlights (tree + evidence)', () => {
    localStorage.setItem('temporal-logic-explorer-v1', JSON.stringify({
      model: {
        states: [{ id: 's', name: 's', propositions: ['p'], isInitial: true, x: 100, y: 100 }],
        transitions: [{ from: 's', to: 's' }],
      },
      formulas: [{ id: 'f-ef', text: 'EF p', logic: 'ctl' }],
      trace: null,
    }));
    render(<App />);
    fireEvent.click(screen.getByText('EF p', { selector: '.text' }));
    expect(document.querySelector('[data-learn="inspector-tree"]')).toBeTruthy();
    expect(document.querySelector('[data-learn="inspector-evidence"]')).toBeTruthy();
    expect(document.querySelector('[data-learn="palette-input"]')).toBeTruthy();
  });
});
