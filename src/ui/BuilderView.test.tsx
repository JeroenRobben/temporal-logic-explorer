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

function textarea(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/add .*formula/i) as HTMLTextAreaElement;
}

function toggleBuilder() {
  fireEvent.click(screen.getByText('⌗ Builder'));
  return document.querySelector('.builder-view') as HTMLElement;
}

function popover(): HTMLElement | null {
  return document.querySelector('.builder-popover');
}

describe('BuilderView in the composer', () => {
  it('has a ⌗ Builder toggle; opening with a parseable draft seeds the tree and locks the textarea', () => {
    render(<Harness />);
    expect(screen.getByText('⌗ Builder')).toBeTruthy();
    expect(document.querySelector('.builder-view')).toBeNull(); // closed by default
    fireEvent.change(textarea(), { target: { value: 'AG go' } });
    const view = toggleBuilder();
    expect(view).toBeTruthy();
    expect(within(view).getByText('AG')).toBeTruthy(); // AG node label
    expect(within(view).getByText('go')).toBeTruthy(); // prop leaf
    expect(textarea().readOnly).toBe(true);
  });

  it('opens with a bare hole and a notice when a non-empty draft cannot be imported', () => {
    render(<Harness />);
    fireEvent.change(textarea(), { target: { value: 'AG (' } });
    const view = toggleBuilder();
    expect(within(view).getByText('▢')).toBeTruthy();
    expect(document.querySelector('.builder-notice')).toBeTruthy();
  });

  it('opens with a bare hole and no notice when the draft is empty', () => {
    render(<Harness />);
    const view = toggleBuilder();
    expect(within(view).getByText('▢')).toBeTruthy();
    expect(document.querySelector('.builder-notice')).toBeNull();
  });

  it('hole click opens a position-legal palette: CTL* bare-hole root offers A and ∧ and props but not F', () => {
    render(<Harness initial="ctlstar" />);
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('▢'));
    const pop = popover()!;
    expect(pop).toBeTruthy();
    expect(within(pop).getByText('A')).toBeTruthy();
    expect(within(pop).getByText('∧')).toBeTruthy();
    expect(within(pop).getByText('go')).toBeTruthy();
    expect(within(pop).queryByText('F')).toBeNull();
  });

  it('picking AG replaces the hole with an AG node + child hole and writes AG ▢ to the draft', () => {
    render(<Harness />);
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('▢'));
    fireEvent.click(within(popover()!).getByText('AG'));
    expect(textarea().value).toBe('AG ▢');
    expect(within(view).getByText('AG')).toBeTruthy();
    expect(within(view).getByText('▢')).toBeTruthy(); // child hole
    expect(popover()).toBeNull(); // closed after picking
  });

  it('completing the formula flips the status line to ✓ with a gloss', () => {
    render(<Harness />);
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('▢'));
    fireEvent.click(within(popover()!).getByText('AG'));
    fireEvent.click(within(view).getByText('▢'));
    fireEvent.click(within(popover()!).getByText('go'));
    expect(textarea().value).toBe('AG go');
    expect(screen.getByText(/on every path, at every step, go/)).toBeTruthy();
  });

  it('node menu wraps a prop in ¬ (draft becomes AG (! go))', () => {
    render(<Harness />);
    fireEvent.change(textarea(), { target: { value: 'AG go' } });
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('go'));
    fireEvent.click(within(popover()!).getByText('¬'));
    expect(textarea().value).toBe('AG (! go)');
    expect(popover()).toBeNull();
  });

  it('node menu deletes a node back to a hole', () => {
    render(<Harness />);
    fireEvent.change(textarea(), { target: { value: 'AG go' } });
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('go'));
    fireEvent.click(within(popover()!).getByText('delete to hole'));
    expect(textarea().value).toBe('AG ▢');
    expect(within(view).getByText('▢')).toBeTruthy();
  });

  it('node menu replace… reopens the palette for that position', () => {
    render(<Harness />);
    fireEvent.change(textarea(), { target: { value: 'AG go' } });
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('go'));
    fireEvent.click(within(popover()!).getByText('replace…'));
    fireEvent.click(within(popover()!).getByText('stop'));
    expect(textarea().value).toBe('AG stop');
  });

  it('keeps one popover at a time; Escape and outside mousedown close it', () => {
    render(<Harness />);
    fireEvent.change(textarea(), { target: { value: '(go & stop)' } });
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('go'));
    expect(document.querySelectorAll('.builder-popover').length).toBe(1);
    fireEvent.click(within(view).getByText('stop'));
    expect(document.querySelectorAll('.builder-popover').length).toBe(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(popover()).toBeNull();
    fireEvent.click(within(view).getByText('go'));
    expect(popover()).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(popover()).toBeNull();
  });

  it('toggling off returns to an editable textarea with the built draft intact', () => {
    render(<Harness />);
    const view = toggleBuilder();
    fireEvent.click(within(view).getByText('▢'));
    fireEvent.click(within(popover()!).getByText('AG'));
    fireEvent.click(screen.getByText('⌗ Builder')); // off
    expect(document.querySelector('.builder-view')).toBeNull();
    const ta = textarea();
    expect(ta.readOnly).toBe(false);
    expect(ta.value).toBe('AG ▢');
  });

  it('editing mode composes: entering edit with the builder open reseeds from the row text via the row logic', () => {
    const saved: string[] = [];
    const props = {
      logic: 'ctl' as Logic, model: MODEL,
      onSave: (t: string) => saved.push(t), onCancelEdit: () => {},
      onSwitchLogic: () => {}, onOpenLearn: () => {},
    };
    const { rerender } = render(<Composer {...props} editing={null} />);
    fireEvent.change(textarea(), { target: { value: 'AG go' } });
    let view = toggleBuilder();
    expect(within(view).getByText('AG')).toBeTruthy();

    // THE transition under test: ✎ on a row while the builder is open. The
    // builder must remount seeded from the row's text (via the row's logic),
    // not from the stale pre-edit draft.
    rerender(<Composer {...props} editing={{ id: 'f1', text: 'G stop', logic: 'ltl' }} />);
    view = document.querySelector('.builder-view') as HTMLElement;
    expect(within(view).getByText('G')).toBeTruthy(); // LTL temporal node, seeded via effLogic
    expect(within(view).getByText('stop')).toBeTruthy();
    expect(within(view).queryByText('AG')).toBeNull();
    expect(textarea().value).toBe('G stop');
    expect(textarea().readOnly).toBe(true);

    // One builder edit + Enter saves the ROW's formula, not the old draft.
    fireEvent.click(within(view).getByText('stop'));
    fireEvent.click(within(popover()!).getByText('replace…'));
    fireEvent.click(within(popover()!).getByText('go'));
    expect(textarea().value).toBe('G go');
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(saved).toEqual(['G go']);

    // Leaving edit mode restores the pre-edit draft AND reseeds the builder
    // from it — the same remount race in the other direction.
    rerender(<Composer {...props} editing={null} />);
    view = document.querySelector('.builder-view') as HTMLElement;
    expect(textarea().value).toBe('AG go');
    expect(within(view).getByText('AG')).toBeTruthy();
    expect(within(view).queryByText('stop')).toBeNull();
  });

  it('locks out text-side draft writers while open: palette + prop chips disabled, PatternPicker hidden', () => {
    render(<Harness />);
    const chip = () => [...document.querySelectorAll('.prop-chip')]
      .find((c) => c.textContent === 'go' && !c.closest('.builder-view')) as HTMLButtonElement;
    const opBtn = () => [...document.querySelectorAll('.op-btn')]
      .find((b) => b.textContent === 'AG' && !b.closest('.builder-view')) as HTMLButtonElement;
    expect(chip().disabled).toBe(false);
    expect(opBtn().disabled).toBe(false);
    expect(document.querySelector('.pattern-toggle')).toBeTruthy();
    toggleBuilder();
    expect(chip().disabled).toBe(true);
    expect(opBtn().disabled).toBe(true);
    expect(document.querySelector('.pattern-toggle')).toBeNull();
    fireEvent.click(screen.getByText('⌗ Builder')); // off again
    expect(chip().disabled).toBe(false);
    expect(opBtn().disabled).toBe(false);
    expect(document.querySelector('.pattern-toggle')).toBeTruthy();
  });

  it('failed import collapses the draft to the single hole the builder holds', () => {
    render(<Harness />);
    fireEvent.change(textarea(), { target: { value: 'AG (' } });
    toggleBuilder();
    expect(document.querySelector('.builder-notice')).toBeTruthy(); // notice still shown
    expect(textarea().value).toBe('▢'); // draft == tree
  });

  it('successful import normalizes the draft to the printed form', () => {
    render(<Harness />);
    fireEvent.change(textarea(), { target: { value: 'AG(go)' } });
    const view = toggleBuilder();
    expect(within(view).getByText('AG')).toBeTruthy();
    expect(textarea().value).toBe('AG go');
  });
});
