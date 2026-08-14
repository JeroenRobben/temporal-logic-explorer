import { describe, expect, it } from 'vitest';
import { findNodeByPretty, prettyOfNode, stepKind } from './engine';
import { tabIs, verdictIs, hasFormula, selectedIs, hasTransition, lacksTransition, and } from './helpers';
import { LearnView } from './types';

const view = (over: Partial<LearnView> = {}): LearnView => ({
  model: { states: [{ id: 's', name: 's', propositions: [], isInitial: true, x: 0, y: 0 },
                    { id: 't', name: 't', propositions: ['p'], isInitial: false, x: 0, y: 0 }],
           transitions: [{ from: 's', to: 't' }] },
  formulas: [{ text: 'EF p', logic: 'ctl', verdict: true }],
  activeFormulaIndex: 0,
  selectedSubformulaPretty: null,
  viewTab: 'model',
  hasTrace: false,
  showEvidence: false,
  ...over,
});

describe('engine node lookup', () => {
  it('finds a subformula node id by pretty string (all three logics)', () => {
    expect(findNodeByPretty('ctl', 'AG (EF p)', 'EF p')).not.toBeNull();
    expect(findNodeByPretty('ltl', 'G (p -> F q)', 'F q')).not.toBeNull();
    expect(findNodeByPretty('ctlstar', 'A (G (F p))', 'F p')).not.toBeNull();
    expect(findNodeByPretty('ctl', 'AG (EF p)', 'EF q')).toBeNull();
    expect(findNodeByPretty('ctl', '((broken', 'x')).toBeNull();
  });
  it('round-trips: prettyOfNode(findNodeByPretty(x)) === x', () => {
    const id = findNodeByPretty('ctl', 'AG (EF p)', 'EF p')!;
    expect(prettyOfNode('ctl', 'AG (EF p)', id)).toBe('EF p');
  });
});

describe('stepKind', () => {
  it('classifies task vs info', () => {
    expect(stepKind({ text: 'x' })).toBe('info');
    expect(stepKind({ text: 'x', checkpoint: () => true })).toBe('task');
  });
});

describe('checkpoint helpers', () => {
  it('tabIs / verdictIs / selectedIs', () => {
    expect(tabIs('model')(view())).toBe(true);
    expect(verdictIs(0, true)(view())).toBe(true);
    expect(verdictIs(0, false)(view())).toBe(false);
    expect(verdictIs(3, true)(view())).toBe(false);
    expect(selectedIs('EF p')(view({ selectedSubformulaPretty: 'EF p' }))).toBe(true);
  });
  it('hasFormula compares parse-normalized text per logic', () => {
    expect(hasFormula('ctl', 'EF(p)')(view())).toBe(true);      // normalizes to same pretty
    expect(hasFormula('ctl', 'AF p')(view())).toBe(false);
    expect(hasFormula('ltl', 'EF p')(view())).toBe(false);      // wrong logic; must not throw
  });
  it('transition predicates and conjunction', () => {
    expect(hasTransition('s', 't')(view())).toBe(true);
    expect(lacksTransition('t', 's')(view())).toBe(true);
    expect(and(tabIs('model'), verdictIs(0, true))(view())).toBe(true);
    expect(and(tabIs('tree'), verdictIs(0, true))(view())).toBe(false);
  });
});
