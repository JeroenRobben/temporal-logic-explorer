import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import App from './App';

/** App-level tests: the workbench drawer opens over the canvas (center pane)
 *  from the two launcher buttons in the left-pane composer. */

function textarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/add .*formula/i) as HTMLTextAreaElement;
}

function drawer(): HTMLElement | null {
  return document.querySelector('.workbench');
}

describe('Workbench drawer', () => {
  beforeEach(() => localStorage.clear());

  it('is closed by default; ⌗ Builder opens it in builder mode inside the center pane, over a backdrop', () => {
    render(<App />);
    expect(drawer()).toBeNull();
    fireEvent.click(screen.getByText('⌗ Builder'));
    const wb = drawer()!;
    expect(wb).toBeTruthy();
    // portal target: the drawer lives in the center pane, not the left pane
    expect(document.querySelector('.pane.center .workbench')).toBeTruthy();
    expect(document.querySelector('.pane.left .workbench')).toBeNull();
    expect(wb.querySelector('.workbench-backdrop')).toBeTruthy();
    expect(wb.querySelector('.builder-view')).toBeTruthy();
    // the canvas stays mounted behind the drawer
    expect(document.querySelector('.pane.center svg')).toBeTruthy();
  });

  it('⧉ Patterns opens the drawer in patterns mode without locking the textarea', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⧉ Patterns'));
    const wb = drawer()!;
    expect(wb.querySelector('.pattern-picker')).toBeTruthy();
    expect(wb.querySelector('.builder-view')).toBeNull();
    expect(textarea().readOnly).toBe(false);
    fireEvent.change(textarea(), { target: { value: 'AG w' } }); // still writable
    expect(textarea().value).toBe('AG w');
  });

  it('✕, Esc, and backdrop-click each close the drawer', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⌗ Builder'));
    fireEvent.click(drawer()!.querySelector('.workbench-close')!);
    expect(drawer()).toBeNull();

    fireEvent.click(screen.getByText('⌗ Builder'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(drawer()).toBeNull();

    fireEvent.click(screen.getByText('⌗ Builder'));
    fireEvent.click(drawer()!.querySelector('.workbench-backdrop')!);
    expect(drawer()).toBeNull();
  });

  it('the launcher buttons toggle: clicking the active mode again closes the drawer', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⌗ Builder'));
    expect(drawer()).toBeTruthy();
    fireEvent.click(screen.getByText('⌗ Builder'));
    expect(drawer()).toBeNull();
  });

  it('header mode switch hops builder ↔ patterns preserving the draft', () => {
    render(<App />);
    fireEvent.change(textarea(), { target: { value: 'AG r' } });
    fireEvent.click(screen.getByText('⌗ Builder'));
    const wb = drawer()!;
    expect(within(wb.querySelector('.builder-view') as HTMLElement).getByText('AG')).toBeTruthy();
    expect(textarea().readOnly).toBe(true);

    fireEvent.click(within(wb.querySelector('.workbench-header') as HTMLElement).getByText('Patterns'));
    expect(drawer()!.querySelector('.pattern-picker')).toBeTruthy();
    expect(drawer()!.querySelector('.builder-view')).toBeNull();
    expect(textarea().value).toBe('AG r'); // draft preserved
    expect(textarea().readOnly).toBe(false); // patterns mode never locks

    fireEvent.click(within(drawer()!.querySelector('.workbench-header') as HTMLElement).getByText('Builder'));
    const view = drawer()!.querySelector('.builder-view') as HTMLElement;
    expect(within(view).getByText('AG')).toBeTruthy(); // reseeded from the preserved draft
    expect(textarea().value).toBe('AG r');
    expect(textarea().readOnly).toBe(true);
  });

  it('builder mode applies the writer lockout: readonly textarea, chips and palette disabled', () => {
    render(<App />);
    const chip = () => [...document.querySelectorAll('.prop-chip')]
      .find((c) => c.textContent === 'r' && !c.closest('.workbench')) as HTMLButtonElement;
    const opBtn = () => [...document.querySelectorAll('.op-btn')]
      .find((b) => b.textContent === 'AG' && !b.closest('.workbench')) as HTMLButtonElement;
    expect(chip().disabled).toBe(false);
    fireEvent.click(screen.getByText('⌗ Builder'));
    expect(textarea().readOnly).toBe(true);
    expect(chip().disabled).toBe(true);
    expect(opBtn().disabled).toBe(true);
    fireEvent.click(drawer()!.querySelector('.workbench-close')!);
    expect(textarea().readOnly).toBe(false);
    expect(chip().disabled).toBe(false);
    expect(opBtn().disabled).toBe(false);
  });

  it('patterns Insert closes the drawer, fills the draft, and selects the first hole', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⧉ Patterns'));
    const picker = drawer()!.querySelector('.pattern-picker') as HTMLElement;
    fireEvent.change(within(picker).getByLabelText('Pattern'), { target: { value: 'response' } });
    const pSlot = [...picker.querySelectorAll('.pattern-slot')]
      .find((s) => s.textContent!.startsWith('P'))!;
    fireEvent.click(within(pSlot as HTMLElement).getByText('r'));
    fireEvent.click(within(picker).getByText('Insert'));
    expect(drawer()).toBeNull(); // closed on insert
    const ta = textarea();
    expect(ta.value).toContain('r ->');
    const hole = ta.value.indexOf('▢');
    expect(hole).toBeGreaterThanOrEqual(0);
    expect(ta.selectionStart).toBe(hole);
    expect(ta.selectionEnd).toBe(hole + 1);
  });

  it('✎-edit while the drawer is open in builder mode reseeds the builder from the row text', () => {
    render(<App />);
    fireEvent.change(textarea(), { target: { value: 'AG w' } });
    fireEvent.click(screen.getByText('⌗ Builder'));
    let view = drawer()!.querySelector('.builder-view') as HTMLElement;
    expect(within(view).getByText('AG')).toBeTruthy();

    const row = [...document.querySelectorAll('.formula-row')]
      .find((el) => el.textContent!.includes('AF r'))!;
    fireEvent.click(row.querySelector('[title="Edit"]')!);
    view = drawer()!.querySelector('.builder-view') as HTMLElement;
    expect(within(view).getByText('AF')).toBeTruthy(); // seeded from the row
    expect(within(view).queryByText('AG')).toBeNull();
    expect(textarea().value).toBe('AF r');
    expect(textarea().readOnly).toBe(true);
  });

  it('hides the ⧉ Patterns launcher while editing a row', () => {
    render(<App />);
    const row = [...document.querySelectorAll('.formula-row')]
      .find((el) => el.textContent!.includes('AF r'))!;
    fireEvent.click(row.querySelector('[title="Edit"]')!);
    expect(screen.queryByText('⧉ Patterns')).toBeNull();
    expect(screen.getByText('⌗ Builder')).toBeTruthy(); // builder still available
  });
});
