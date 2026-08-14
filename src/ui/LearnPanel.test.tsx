import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LearnPanel from './LearnPanel';
import { Tutorial } from '../learn/types';

const noop = () => {};
const base = { refId: null, tutorial: null, view: null, onOpenRef: noop, onStartTutorial: noop,
  onExitTutorial: noop, onNext: noop, onBack: noop, onShowMe: noop } as const;

describe('LearnPanel index', () => {
  it('lists references grouped by logic and opens one', () => {
    const onOpenRef = vi.fn();
    render(<LearnPanel {...base} onOpenRef={onOpenRef} />);
    expect(screen.getByText('CTL')).toBeTruthy();          // group header
    fireEvent.click(screen.getByText('EF φ'));             // symbol row
    expect(onOpenRef).toHaveBeenCalledWith('ctl-EF');
  });
});

describe('LearnPanel reference view', () => {
  it('renders sections and a Start tutorial button', () => {
    const onStart = vi.fn();
    render(<LearnPanel {...base} refId="ctl-EF" onStartTutorial={onStart} />);
    expect(screen.getByText('Exists-Finally (reachability)')).toBeTruthy();
    expect(screen.getByText(/some path from it reaches/)).toBeTruthy();
    expect(screen.getByText(/AG φ ≡ ¬EF ¬φ/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Start tutorial/));
    expect(onStart).toHaveBeenCalledWith('tut-ctl-EF');
    expect(screen.getByText(/← All operators/)).toBeTruthy(); // back link
  });
});

describe('LearnPanel patterns group', () => {
  it('renders Patterns (Dwyer) last and pat-response shows intent + both logics', () => {
    const onOpenRef = vi.fn();
    const { container, unmount } = render(<LearnPanel {...base} onOpenRef={onOpenRef} />);
    const headers = container.querySelectorAll('.learn-ref-section .section-title');
    expect(headers[headers.length - 1].textContent).toBe('Patterns (Dwyer)');
    fireEvent.click(screen.getByText(/Response — S responds to P/));
    expect(onOpenRef).toHaveBeenCalledWith('pat-response');
    unmount();
    render(<LearnPanel {...base} refId="pat-response" />);
    expect(screen.getByText(/reach for it when/i)).toBeTruthy();           // intent / when-to-use
    expect(screen.getByText(/AG \(P → AF S\)/)).toBeTruthy();              // CTL (globally) form
    expect(screen.getByText(/A \(G \(P → F S\)\)/)).toBeTruthy();          // CTL* form
    expect(screen.getByText(/Globally scope: G \(P → F S\)/)).toBeTruthy(); // Globally LTL template (formal, glyphed)
  });
});

const STUB_TUT: Tutorial = {
  id: 'tut-stub', title: 'Stub tutorial', logic: 'ctl',
  intro: 'intro',
  steps: [
    { text: 'Step one has **bold** and `code` bits.' },
    { text: 'Do the thing.', checkpoint: (v) => v.showEvidence, solution: { showEvidence: true } },
    { text: 'All done.' },
  ],
};

const stubView = (over: Partial<import('../learn/types').LearnView> = {}) => ({
  model: { states: [], transitions: [] },
  formulas: [],
  activeFormulaIndex: -1,
  selectedSubformulaPretty: null,
  viewTab: 'model',
  hasTrace: false,
  showEvidence: false,
  ...over,
});

describe('LearnPanel tutorial view', () => {
  it('renders title, step counter, markdown-lite text and Next on an info step', () => {
    const onNext = vi.fn();
    render(<LearnPanel {...base} tutorial={{ def: STUB_TUT, step: 0 }} view={stubView()} onNext={onNext} />);
    expect(screen.getByText('Stub tutorial')).toBeTruthy();
    expect(screen.getByText(/1 \/ 3/)).toBeTruthy();
    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
    const code = screen.getByText('code');
    expect(code.tagName).toBe('CODE');
    fireEvent.click(screen.getByText(/Next/));
    expect(onNext).toHaveBeenCalled();
    expect(screen.getByText(/Exit tutorial/)).toBeTruthy();
  });

  it('task step shows waiting status and Show me; done status when checkpoint holds', () => {
    const onShowMe = vi.fn();
    const { rerender } = render(
      <LearnPanel {...base} tutorial={{ def: STUB_TUT, step: 1 }} view={stubView()} onShowMe={onShowMe} />,
    );
    expect(screen.getByText(/waiting for you/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Show me/));
    expect(onShowMe).toHaveBeenCalled();
    rerender(
      <LearnPanel {...base} tutorial={{ def: STUB_TUT, step: 1 }} view={stubView({ showEvidence: true })} onShowMe={onShowMe} />,
    );
    expect(screen.getByText(/done — advancing/)).toBeTruthy();
  });

  it('last step shows Finish and Back', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<LearnPanel {...base} tutorial={{ def: STUB_TUT, step: 2 }} view={stubView()} onNext={onNext} onBack={onBack} />);
    expect(screen.getByText(/3 \/ 3/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Finish/));
    expect(onNext).toHaveBeenCalled();
    fireEvent.click(screen.getByText(/Back/));
    expect(onBack).toHaveBeenCalled();
  });
});
