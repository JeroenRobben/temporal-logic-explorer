import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

// Auto-advance has a 600ms "✓ beat" before moving on — give waitFor headroom.
const ADVANCE = { timeout: 3000 } as const;

function canvasSvg(): HTMLElement {
  return document.querySelector('.view-body svg') as unknown as HTMLElement;
}

/** render App → Learn tab → EF reference → Start tutorial (lands on step 1/5). */
function startEFTutorial() {
  render(<App />);
  fireEvent.click(screen.getByText('Learn'));
  fireEvent.click(screen.getByText('EF φ'));
  fireEvent.click(screen.getByText(/Start tutorial/));
}

describe('tutorial runner', () => {
  beforeEach(() => localStorage.clear());

  it('starting a tutorial stashes and loads the step-0 setup', () => {
    startEFTutorial();
    // sandbox model replaced the default example: canvas shows s and t
    expect(within(canvasSvg()).getByText('s')).toBeTruthy();
    expect(within(canvasSvg()).getByText('t')).toBeTruthy();
    // formula list holds the tutorial formula
    expect(screen.getByText('EF p', { selector: '.text' })).toBeTruthy();
    // banner + step counter
    const banner = document.querySelector('.tutorial-banner')!;
    expect(banner.textContent).toContain('Tutorial: EF — reachability');
    expect(banner.textContent).toContain('1/5');
    expect(screen.getByText('step 1 / 5')).toBeTruthy();
  });

  it('info Next advances; Back returns without re-running setups', async () => {
    startEFTutorial();
    fireEvent.click(screen.getByText('Next ▸'));
    expect(screen.getByText('step 2 / 5')).toBeTruthy();
    expect(screen.getByText('… waiting for you')).toBeTruthy(); // task step
    // drive through the three task steps via Show me to reach the final info step
    fireEvent.click(screen.getByText('Show me'));
    await waitFor(() => expect(screen.getByText('step 3 / 5')).toBeTruthy(), ADVANCE);
    fireEvent.click(screen.getByText('Show me'));
    await waitFor(() => expect(screen.getByText('step 4 / 5')).toBeTruthy(), ADVANCE);
    fireEvent.click(screen.getByText('Show me'));
    await waitFor(() => expect(screen.getByText('step 5 / 5')).toBeTruthy(), ADVANCE);
    // final step is info with a Back button; Back returns to step 4
    fireEvent.click(screen.getByText('◂ Back'));
    expect(screen.getByText('step 4 / 5')).toBeTruthy();
  });

  it('a task auto-advances when the user does the thing in the real UI', async () => {
    startEFTutorial();
    fireEvent.click(screen.getByText('Next ▸'));
    expect(screen.getByText('step 2 / 5')).toBeTruthy(); // selectedIs('EF p') task
    // do it for real: open the Inspector, click the EF p root node row
    fireEvent.click(screen.getByText('Inspector'));
    const nodeRows = document.querySelectorAll('.node-row');
    expect(nodeRows.length).toBeGreaterThan(0);
    fireEvent.click(nodeRows[0]); // EF p root
    fireEvent.click(screen.getByText('Learn'));
    await waitFor(() => expect(screen.getByText('step 3 / 5')).toBeTruthy(), ADVANCE);
  });

  it('Show me satisfies the checkpoint (evidence step)', async () => {
    startEFTutorial();
    fireEvent.click(screen.getByText('Next ▸'));
    fireEvent.click(screen.getByText('Show me')); // selects EF p
    await waitFor(() => expect(screen.getByText('step 3 / 5')).toBeTruthy(), ADVANCE);
    fireEvent.click(screen.getByText('Show me')); // turns on evidence
    await waitFor(() => expect(screen.getByText('step 4 / 5')).toBeTruthy(), ADVANCE);
  });

  it('Exit restores the pre-tutorial workspace', () => {
    localStorage.setItem('temporal-logic-explorer-v1', JSON.stringify({
      model: {
        states: [{ id: 'mine', name: 'mine', propositions: ['p'], isInitial: true, x: 100, y: 100 }],
        transitions: [{ from: 'mine', to: 'mine' }],
      },
      formulas: [{ id: 'f-mine', text: 'AG p', logic: 'ctl' }],
      trace: null,
    }));
    startEFTutorial();
    // sandbox is live: distinctive workspace gone
    expect(within(canvasSvg()).queryByText('mine')).toBeNull();
    fireEvent.click(screen.getByText('Next ▸')); // advance one step
    expect(screen.getByText('step 2 / 5')).toBeTruthy();
    fireEvent.click(screen.getByText('Exit tutorial'));
    // workspace restored
    expect(within(canvasSvg()).getByText('mine')).toBeTruthy();
    expect(screen.getByText('AG p', { selector: '.text' })).toBeTruthy();
    expect(screen.queryByText('EF p', { selector: '.text' })).toBeNull();
    expect(document.querySelector('.tutorial-banner')).toBeNull();
  });
});
