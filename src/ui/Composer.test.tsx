import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from './App';

function composerInput(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/add .*formula/i) as HTMLTextAreaElement;
}

describe('Composer', () => {
  beforeEach(() => localStorage.clear());

  it('shows a live parse error with hint while typing', () => {
    render(<App />);
    fireEvent.change(composerInput(), { target: { value: 'AG (w' } });
    expect(screen.getByText(/Expected '\)'/)).toBeTruthy();
  });

  it('shows pretty + gloss when the draft parses', () => {
    render(<App />);
    fireEvent.change(composerInput(), { target: { value: 'AG EF r' } });
    expect(screen.getByText(/on every path, at every step, on some path, eventually r/)).toBeTruthy();
  });

  it('proposition chips insert at the caret', () => {
    render(<App />);
    const ta = composerInput();
    fireEvent.change(ta, { target: { value: 'AG ' } });
    ta.setSelectionRange(3, 3);
    fireEvent.click(screen.getAllByText('r').find((el) => el.className === 'prop-chip')!);
    expect(ta.value).toBe('AG r');
  });

  it('template buttons insert holes; Enter refuses while holes remain', () => {
    render(<App />);
    fireEvent.click(screen.getByText('A[▢U▢]'));
    const ta = composerInput();
    expect(ta.value).toContain('▢');
    const rows = document.querySelectorAll('.formula-row').length;
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(document.querySelectorAll('.formula-row').length).toBe(rows); // refused
    expect(screen.getByText(/fill the holes/)).toBeTruthy();
  });

  it('quick-fix rewrites the draft', () => {
    render(<App />);
    fireEvent.click(within(document.querySelector('.header')!).getByText('LTL')); // LTL entry mode
    const ta = composerInput();
    fireEvent.change(ta, { target: { value: 'AG w' } });
    fireEvent.click(screen.getByText(/Drop the quantifier/));
    expect(ta.value).toBe('G w');
  });

  it('cross-logic switch preserves the draft', () => {
    render(<App />);
    // CTL entry mode; type an LTL-ism
    const ta = composerInput();
    fireEvent.change(ta, { target: { value: 'FG w' } });
    fireEvent.click(screen.getByText('Switch to LTL'));
    expect((screen.getByPlaceholderText(/add ltl formula/i) as HTMLTextAreaElement).value).toBe('FG w');
  });

  it('edit-in-place saves under the same id', () => {
    render(<App />);
    const before = document.querySelectorAll('.formula-row').length;
    const row = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.textContent!.includes('AF r'))!;
    fireEvent.click(row.querySelector('[title="Edit"]')!);
    const ta = composerInput();
    expect(ta.value).toBe('AF r');
    fireEvent.change(ta, { target: { value: 'AF w' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(document.querySelectorAll('.formula-row').length).toBe(before);
    expect(screen.getByText('AF w')).toBeTruthy();
    expect(screen.queryByText('AF r')).toBeNull();
  });

  it('switching directly between two edits does not leak the first edit as a draft', () => {
    render(<App />);
    const rows = () => [...document.querySelectorAll('.formula-row')];
    fireEvent.click(rows().find((r) => r.textContent!.includes('AF r'))!.querySelector('[title="Edit"]')!);
    fireEvent.change(composerInput(), { target: { value: 'AF zzz' } }); // unsaved edit
    fireEvent.click(rows().find((r) => r.textContent!.includes('AG EF r'))!.querySelector('[title="Edit"]')!);
    fireEvent.keyDown(composerInput(), { key: 'Escape' }); // cancel second edit
    expect((composerInput() as HTMLTextAreaElement).value).toBe(''); // pre-edit draft (empty), not 'AF zzz'
  });

  it("editing a row uses the row's logic regardless of the current tab", () => {
    render(<App />);
    // default tab is CTL; edit the LTL row 'G F r'
    const row = [...document.querySelectorAll('.formula-row')].find((r) => r.querySelector('.badge.ltl'))!;
    fireEvent.click(row.querySelector('[title="Edit"]')!);
    const ta = composerInput() as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'AG w' } });
    expect(screen.getByText(/that's CTL, not LTL/)).toBeTruthy(); // validated as LTL
  });

  it('insertion adds a space before a following identifier', () => {
    render(<App />);
    const ta = composerInput() as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'p' } });
    ta.setSelectionRange(0, 0);
    fireEvent.click([...document.querySelectorAll('.prop-chip')].find((c) => c.textContent === 'r')!);
    expect(ta.value).toBe('r p');
  });
});
