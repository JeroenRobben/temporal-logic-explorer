import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Auto-advance has a 600ms "✓ beat" before moving on — give waitFor headroom.
const ADVANCE = { timeout: 3000 } as const;

function canvasSvg(): HTMLElement {
  return document.querySelector('.view-body svg') as unknown as HTMLElement;
}

function verdictOfFirstFormula(): string {
  return document.querySelector('.formula-row .verdict')!.textContent!;
}

describe('EF tutorial end-to-end', () => {
  beforeEach(() => localStorage.clear());

  it('walks the full EF tutorial against the real app and restores the workspace', async () => {
    // Distinctive pre-tutorial workspace, seeded the way App persists it.
    localStorage.setItem('temporal-logic-explorer-v1', JSON.stringify({
      model: {
        states: [{ id: 'mine', name: 'mine', propositions: ['p'], isInitial: true, x: 100, y: 100 }],
        transitions: [{ from: 'mine', to: 'mine' }],
      },
      formulas: [{ id: 'f-mine', text: 'AG p', logic: 'ctl' }],
      trace: null,
    }));

    render(<App />);
    expect(within(canvasSvg()).getByText('mine')).toBeTruthy();

    // Learn tab → EF reference → Start tutorial
    fireEvent.click(screen.getByText('Learn'));
    fireEvent.click(screen.getByText('EF φ'));
    expect(screen.getByText('Exists-Finally (reachability)')).toBeTruthy();
    fireEvent.click(screen.getByText(/Start tutorial/));

    // Step 1/5: sandbox loaded — M_REACH on canvas, EF p in the list with ✓.
    expect(screen.getByText('step 1 / 5')).toBeTruthy();
    const banner = document.querySelector('.tutorial-banner')!;
    expect(banner.textContent).toContain('Tutorial: EF — reachability');
    expect(within(canvasSvg()).getByText('s')).toBeTruthy();
    expect(within(canvasSvg()).getByText('t')).toBeTruthy();
    expect(within(canvasSvg()).queryByText('mine')).toBeNull(); // stash swapped the workspace out
    expect(screen.getByText('EF p', { selector: '.text' })).toBeTruthy();
    expect(verdictOfFirstFormula()).toBe('✓');

    // Step 1 is info: Next advances.
    fireEvent.click(screen.getByText('Next ▸'));
    expect(screen.getByText('step 2 / 5')).toBeTruthy();
    expect(screen.getByText('… waiting for you')).toBeTruthy();

    // Step 2 checkpoint selectedIs('EF p'): do it for real via the Inspector node row.
    fireEvent.click(screen.getByText('Inspector'));
    const nodeRows = document.querySelectorAll('.node-row');
    expect(nodeRows.length).toBeGreaterThan(0);
    fireEvent.click(nodeRows[0]); // EF p root
    fireEvent.click(screen.getByText('Learn'));
    await waitFor(() => expect(screen.getByText('step 3 / 5')).toBeTruthy(), ADVANCE);

    // Step 3 checkpoint evidenceShown(): Show me turns evidence on.
    fireEvent.click(screen.getByText('Show me'));
    await waitFor(() => expect(screen.getByText('step 4 / 5')).toBeTruthy(), ADVANCE);

    // Step 4 cut-the-edge: Show me swaps in M_REACH_CUT; verdict flips to ✗.
    fireEvent.click(screen.getByText('Show me'));
    await waitFor(() => expect(screen.getByText('step 5 / 5')).toBeTruthy(), ADVANCE);
    expect(verdictOfFirstFormula()).toBe('✗');

    // Step 5 is info: Finish exits and restores the stashed workspace.
    fireEvent.click(screen.getByText('Finish ✓'));
    expect(document.querySelector('.tutorial-banner')).toBeNull();
    expect(within(canvasSvg()).getByText('mine')).toBeTruthy();
    expect(screen.getByText('AG p', { selector: '.text' })).toBeTruthy();
    expect(screen.queryByText('EF p', { selector: '.text' })).toBeNull();
  });
});
