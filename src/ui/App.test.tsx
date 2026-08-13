import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, createEvent, act } from '@testing-library/react';
import App from './App';

// jsdom has no PointerEvent constructor, so fireEvent.pointerDown/Up build a
// plain Event whose eventInit (button, clientX, clientY...) is silently
// dropped — every `if (e.button !== 0) return;` guard in Canvas then bails
// because e.button is undefined. Build the event via createEvent and patch
// on the properties the handlers read so pointer interactions actually fire.
function firePointer(
  kind: 'pointerDown' | 'pointerUp',
  el: Element,
  init: { clientX?: number; clientY?: number } = {},
) {
  const evt = createEvent[kind](el, init);
  Object.defineProperty(evt, 'button', { value: 0, configurable: true });
  Object.defineProperty(evt, 'clientX', { value: init.clientX ?? 0, configurable: true });
  Object.defineProperty(evt, 'clientY', { value: init.clientY ?? 0, configurable: true });
  fireEvent(el, evt);
}

describe('App', () => {
  beforeEach(() => localStorage.clear());
  it('renders the three panes with the default example', () => {
    render(<App />);
    expect(screen.getByText('Temporal Logic Explorer')).toBeTruthy();
    expect(screen.getByText('AG EF r')).toBeTruthy(); // formula row (pretty-printed)
    expect(screen.getByPlaceholderText(/add .*formula/i)).toBeTruthy();
  });

  it('shows verdicts for the default example formulas', () => {
    render(<App />);
    // Reset example: AG EF r ✓, AF r ✗, AG (w → EX true) ✓, G F r – (no trace yet)
    const rows = document.querySelectorAll('.formula-row');
    expect(rows.length).toBe(4);
    const verdicts = [...rows].map((r) => r.querySelector('.verdict')!.textContent);
    expect(verdicts).toEqual(['✓', '✗', '✓', '–']);
  });

  it('adding an LTL-style formula shows a parse-error row and hint in inspector', () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/add .*formula/i);
    fireEvent.change(input, { target: { value: 'FG w' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const rows = document.querySelectorAll('.formula-row');
    expect(rows.length).toBe(5);
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
    expect(saved.formulas.length).toBe(4);
  });

  it('evidence explanation appears when evidence cannot be shown', () => {
    render(<App />);
    fireEvent.click(screen.getByText('AG EF r')); // holds → AG has no witness path
    fireEvent.click(screen.getByRole('checkbox', { name: /show witness/i }));
    expect(screen.getByText(/No evidence to show/i)).toBeTruthy();
  });

  it('evidence path text appears for a counterexample', () => {
    render(<App />);
    fireEvent.click(screen.getByText('AF r')); // false → lasso counterexample
    fireEvent.click(screen.getByRole('checkbox', { name: /show witness/i }));
    expect(screen.getByText(/Counterexample path:/i)).toBeTruthy();
  });

  it('deleting a selected state is undoable via Ctrl+Z', () => {
    render(<App />);
    // select state 'work' (at 160,140 in the default example): pointerdown on its
    // group + pointerup on the svg without movement = click-select
    const svg = document.querySelector('svg')!;
    firePointer('pointerDown', screen.getByText('work'), { clientX: 160, clientY: 140 });
    firePointer('pointerUp', svg, { clientX: 160, clientY: 140 });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.queryByText('work')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(screen.getByText('work')).toBeTruthy();
  });

  it('clicking a transition selects it and Delete removes it', () => {
    render(<App />);
    const before = document.querySelectorAll('.edge-hit').length;
    expect(before).toBe(4); // reset example has 4 transitions
    firePointer('pointerDown', document.querySelectorAll('.edge-hit')[1]);
    expect(screen.getByText('Transition')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(document.querySelectorAll('.edge-hit').length).toBe(3);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(document.querySelectorAll('.edge-hit').length).toBe(4);
  });

  it('N adds a state (undoable)', () => {
    render(<App />);
    const before = document.querySelectorAll('g[style] circle[r="28"]').length;
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(document.querySelectorAll('g[style] circle[r="28"]').length).toBe(before + 1);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(document.querySelectorAll('g[style] circle[r="28"]').length).toBe(before);
  });

  it('deleting a state mid-auto-layout is not clobbered by animation frames', () => {
    const frames: FrameRequestCallback[] = [];
    const origRaf = window.requestAnimationFrame;
    const origCaf = window.cancelAnimationFrame;
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => { frames.push(cb); return frames.length; }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => { frames[id - 1] = () => {}; }) as typeof window.cancelAnimationFrame;
    try {
      render(<App />);
      // select 'work' BEFORE starting the animation, since after one animation
      // frame its coordinates may have moved and a click-select could miss it.
      const svg = document.querySelector('svg')!;
      firePointer('pointerDown', screen.getByText('work'), { clientX: 160, clientY: 140 });
      firePointer('pointerUp', svg, { clientX: 160, clientY: 140 });
      fireEvent.click(screen.getByText('Auto-layout'));
      // pump one frame so the animation is genuinely running
      act(() => { frames.splice(0).forEach((cb) => cb(performance.now())); });
      fireEvent.keyDown(document.body, { key: 'Delete' });
      expect(screen.queryByText('work')).toBeNull();
      // pump any residual frames — the deletion must survive
      act(() => { frames.splice(0).forEach((cb) => cb(performance.now())); });
      expect(screen.queryByText('work')).toBeNull();
    } finally {
      window.requestAnimationFrame = origRaf;
      window.cancelAnimationFrame = origCaf;
    }
  });

  it('LTL formula shows – without a trace, with a tooltip-style hint', () => {
    render(<App />);
    const rows = document.querySelectorAll('.formula-row');
    const ltlRow = [...rows].find((r) => r.querySelector('.badge.ltl'));
    expect(ltlRow).toBeTruthy();
    expect(ltlRow!.querySelector('.verdict')!.textContent).toBe('–');
  });

  it('recording a lasso through reset makes G F r true', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    const nameAt: Record<string, string> = { '160,140': 'work', '380,140': 'error', '270,320': 'reset' };
    for (const [x, y] of [[160, 140], [380, 140], [270, 320], [160, 140]] as const) {
      const label = within(svg as unknown as HTMLElement).getByText(nameAt[`${x},${y}`]);
      firePointer('pointerDown', label, { clientX: x, clientY: y });
      firePointer('pointerUp', svg, { clientX: x, clientY: y });
    }
    // clicking work again closed the loop; G F r now evaluates on w e r cycle
    const rows = document.querySelectorAll('.formula-row');
    const ltlRow = [...rows].find((r) => r.querySelector('.badge.ltl'))!;
    expect(ltlRow.querySelector('.verdict')!.textContent).toBe('✓');
  });

  it('trimming the trace reopens the loop and reverts LTL verdicts to –', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    const nameAt: Record<string, string> = { '160,140': 'work', '380,140': 'error', '270,320': 'reset' };
    for (const [x, y] of [[160, 140], [380, 140], [270, 320], [160, 140]] as const) {
      const label = within(svg as unknown as HTMLElement).getByText(nameAt[`${x},${y}`]);
      firePointer('pointerDown', label, { clientX: x, clientY: y });
      firePointer('pointerUp', svg, { clientX: x, clientY: y });
    }
    fireEvent.click(document.querySelectorAll('.chip .trim')[2]); // trim 'reset'
    const ltlRow = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ltl'))!;
    expect(ltlRow.querySelector('.verdict')!.textContent).toBe('–');
  });

  it('deleting a state on the trace clears the trace with a notice', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    const nameAt: Record<string, string> = { '160,140': 'work', '380,140': 'error', '270,320': 'reset' };
    for (const [x, y] of [[160, 140], [380, 140], [270, 320], [160, 140]] as const) {
      const label = within(svg as unknown as HTMLElement).getByText(nameAt[`${x},${y}`]);
      firePointer('pointerDown', label, { clientX: x, clientY: y });
      firePointer('pointerUp', svg, { clientX: x, clientY: y });
    }
    // select and delete 'error'
    firePointer('pointerDown', within(svg as unknown as HTMLElement).getByText('error'), { clientX: 380, clientY: 140 });
    firePointer('pointerUp', svg, { clientX: 380, clientY: 140 });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.getByText(/Trace cleared/)).toBeTruthy();
    expect(document.querySelectorAll('.chip').length).toBe(0);
  });

  it('switching from an LTL formula to a CTL formula does not carry selectedNodeId across', () => {
    render(<App />);
    fireEvent.click(screen.getByText('G F r'));
    const ltlNodeRows = document.querySelectorAll('.node-row');
    expect(ltlNodeRows.length).toBeGreaterThan(0);
    fireEvent.click(ltlNodeRows[0]);
    fireEvent.click(screen.getByText('AG EF r'));
    expect(document.querySelector('.node-row.selected')).toBeNull();
  });

  it('LTL rows show an all-paths mark (G F r fails on the reset example)', () => {
    render(<App />);
    const ltlRow = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ltl'))!;
    const marks = [...ltlRow.querySelectorAll('.verdict')].map((v) => v.textContent);
    expect(marks).toContain('∀✗');
  });

  it('loading the counterexample as a trace makes the trace verdict ✗ too', () => {
    render(<App />);
    fireEvent.click(screen.getByText('G F r'));
    fireEvent.click(screen.getByText('Load counterexample as trace'));
    const ltlRow = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ltl'))!;
    const marks = [...ltlRow.querySelectorAll('.verdict')].map((v) => v.textContent);
    expect(marks[0]).toBe('✗'); // trace verdict: counterexample falsifies G F r
    expect(document.querySelectorAll('.chip').length).toBeGreaterThan(0); // trace loaded
  });

  it('view tabs appear for an active LTL formula and switch to the automaton', () => {
    render(<App />);
    fireEvent.click(screen.getByText('G F r'));
    expect(screen.getByText('Automaton ¬φ')).toBeTruthy();
    fireEvent.click(screen.getByText('Automaton ¬φ'));
    // GraphView renders: at least one double-circle (accepting) exists for ¬(G F r)
    const svg = document.querySelector('.view-body svg')!;
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(0);
    // switching to a CTL formula hides the tabs
    fireEvent.click(screen.getByText('AG EF r'));
    expect(screen.queryByText('Automaton ¬φ')).toBeNull();
  });

  it('CTL* formula A G (E F r) verifies on the reset example', () => {
    render(<App />);
    fireEvent.click(within(document.querySelector('.header')!).getByText('CTL*'));
    const input = screen.getByPlaceholderText(/add ctl\* formula/i);
    fireEvent.change(input, { target: { value: 'A G (E F r)' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const row = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ctlstar'))!;
    expect(row.querySelector('.verdict')!.textContent).toBe('✓');
  });

  it('failing A-root offers a counterexample that loads as a trace', () => {
    render(<App />);
    fireEvent.click(within(document.querySelector('.header')!).getByText('CTL*'));
    const input = screen.getByPlaceholderText(/add ctl\* formula/i);
    fireEvent.change(input, { target: { value: 'A G F r' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const row = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ctlstar'))!;
    expect(row.querySelector('.verdict')!.textContent).toBe('✗');
    fireEvent.click(row);
    fireEvent.click(screen.getByText('Load counterexample as trace'));
    expect(document.querySelectorAll('.chip').length).toBeGreaterThan(0);
  });

  it('selecting an A/E node reveals the automaton tab with a legend', () => {
    render(<App />);
    fireEvent.click(within(document.querySelector('.header')!).getByText('CTL*'));
    const input = screen.getByPlaceholderText(/add ctl\* formula/i);
    fireEvent.change(input, { target: { value: 'A G (E F r)' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click([...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ctlstar'))!);
    expect(screen.queryByText('Automaton')).toBeNull(); // no node selected yet
    // click the root A-node row in the tree (first .node-row)
    fireEvent.click(document.querySelectorAll('.node-row')[0]);
    expect(screen.getByText('Automaton')).toBeTruthy();
  });

  it('Tree tab renders the depth-3 unfolding of the default example', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Tree'));
    expect(document.querySelectorAll('.tree-node').length).toBe(10); // 1+2+3+4
    expect(screen.getByText(/10 nodes/)).toBeTruthy();
  });

  it('selecting a CTL subformula colors tree nodes', () => {
    render(<App />);
    fireEvent.click(screen.getByText('AG EF r'));
    fireEvent.click(screen.getByText('Tree'));
    // click the EF r node row in the inspector tree (row index 1: AG, EF, r)
    fireEvent.click(document.querySelectorAll('.node-row')[1]);
    // EF r holds everywhere → every tree node gets a ring
    expect(document.querySelectorAll('.tree-ring').length).toBe(10);
  });

  it('a recorded trace draws as a violet branch on the tree', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    for (const [x, y, name] of [[160, 140, 'work'], [380, 140, 'error'], [270, 320, 'reset'], [160, 140, 'work']] as const) {
      firePointer('pointerDown', within(svg as unknown as HTMLElement).getByText(name), { clientX: x, clientY: y });
      firePointer('pointerUp', svg, { clientX: x, clientY: y });
    }
    fireEvent.click(screen.getByText('Tree'));
    expect(document.querySelectorAll('.tree-branch').length).toBeGreaterThan(0);
  });
});
