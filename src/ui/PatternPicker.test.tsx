import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import Composer from './Composer';
import { KripkeStructure } from '../core/kripke';
import { Logic } from './types';

/** Two-state model exposing props go / stop. */
const MODEL: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['go'], isInitial: true, x: 0, y: 0 },
    { id: 's1', name: 's1', propositions: ['stop'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 's0', to: 's1' },
    { from: 's1', to: 's0' },
  ],
};

/** Composer harness owning the entry-logic state, like App does, so a
 *  picker-triggered logic switch has an observable effect (the placeholder). */
function Harness({ initial = 'ctl' as Logic }) {
  const [logic, setLogic] = useState<Logic>(initial);
  return (
    <Composer
      logic={logic} model={MODEL} editing={null}
      onSave={() => {}} onCancelEdit={() => {}}
      onSwitchLogic={setLogic} onOpenLearn={() => {}}
    />
  );
}

function openPicker() {
  fireEvent.click(screen.getByText('Patterns'));
  return document.querySelector('.pattern-picker') as HTMLElement;
}

describe('PatternPicker in the composer', () => {
  it('renders as a collapsed disclosure row; opening shows dropdowns and logic toggle', () => {
    render(<Harness />);
    expect(screen.getByText('Patterns')).toBeTruthy();
    expect(document.querySelector('.pattern-picker')).toBeNull(); // collapsed by default
    const picker = openPicker();
    expect(picker).toBeTruthy();
    expect(within(picker).getByLabelText('Pattern')).toBeTruthy();
    expect(within(picker).getByLabelText('Scope')).toBeTruthy();
    expect(within(picker).getByText('CTL')).toBeTruthy();
    expect(within(picker).getByText('LTL')).toBeTruthy();
    expect(within(picker).getByText('CTL*')).toBeTruthy();
  });

  it('disables CTL outside the Globally scope and falls back to LTL', () => {
    render(<Harness />);
    const picker = openPicker();
    const ctlBtn = within(picker).getByText('CTL') as HTMLButtonElement;
    fireEvent.click(ctlBtn);
    expect(ctlBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(within(picker).getByLabelText('Scope'), { target: { value: 'before' } });
    expect(ctlBtn.disabled).toBe(true);
    expect((within(picker).getByText('LTL') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('slot chips fill slots from model props and the preview updates', () => {
    render(<Harness />);
    const picker = openPicker();
    fireEvent.change(within(picker).getByLabelText('Pattern'), { target: { value: 'response' } });
    const slots = [...picker.querySelectorAll('.pattern-slot')];
    const pSlot = slots.find((s) => s.textContent!.startsWith('P'))!;
    const sSlot = slots.find((s) => s.textContent!.startsWith('S'))!;
    expect(pSlot).toBeTruthy();
    expect(sSlot).toBeTruthy();
    fireEvent.click(within(pSlot as HTMLElement).getByText('go'));
    expect(within(picker).getByText('P = go')).toBeTruthy();
    // default logic choice on the CTL tab, Globally scope: CTL template
    expect(picker.querySelector('.pattern-preview')!.textContent).toContain('AG (go -> AF ▢)');
  });

  it('Insert sets the draft (holes included), switches entry logic, and selects the first hole', () => {
    render(<Harness />); // CTL tab
    const picker = openPicker();
    fireEvent.change(within(picker).getByLabelText('Pattern'), { target: { value: 'response' } });
    fireEvent.click(within(picker).getByText('LTL')); // picker logic ≠ tab logic
    const pSlot = [...picker.querySelectorAll('.pattern-slot')].find((s) => s.textContent!.startsWith('P'))!;
    fireEvent.click(within(pSlot as HTMLElement).getByText('go'));
    fireEvent.click(within(picker).getByText('Insert'));
    const ta = screen.getByPlaceholderText(/add ltl formula/i) as HTMLTextAreaElement; // logic switched
    expect(ta.value).toBe('G (go -> F ▢)');
    const hole = ta.value.indexOf('▢');
    expect(ta.selectionStart).toBe(hole);
    expect(ta.selectionEnd).toBe(hole + 1);
  });

  it('shows a gloss line only when the instantiation is fully filled', () => {
    render(<Harness />);
    const picker = openPicker();
    // absence globally, unfilled: template text with a hole, no gloss
    expect(picker.querySelector('.pattern-preview')!.textContent).toContain('▢');
    expect(picker.querySelector('.pattern-gloss')).toBeNull();
    const pSlot = [...picker.querySelectorAll('.pattern-slot')].find((s) => s.textContent!.startsWith('P'))!;
    fireEvent.click(within(pSlot as HTMLElement).getByText('stop'));
    expect(picker.querySelector('.pattern-preview')!.textContent).toContain('AG (! stop)');
    expect(picker.querySelector('.pattern-gloss')).toBeTruthy();
  });

  it('is hidden entirely while editing', () => {
    render(
      <Composer
        logic="ctl" model={MODEL}
        editing={{ id: 'f1', text: 'AG go', logic: 'ctl' }}
        onSave={() => {}} onCancelEdit={() => {}}
        onSwitchLogic={() => {}} onOpenLearn={() => {}}
      />,
    );
    expect(screen.queryByText('Patterns')).toBeNull();
  });
});
