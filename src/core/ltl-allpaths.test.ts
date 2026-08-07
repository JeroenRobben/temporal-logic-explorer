import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { parseLTL } from './ltl-parser';
import { checkLTL } from './ltl-checker';
import { validateLasso } from './trace';
import { checkLTLAllPaths } from './ltl-allpaths';

// The reset example: work[w] (self-loop) -> error[] -> reset[r] -> work
const reset: KripkeStructure = {
  states: [
    { id: 'w', name: 'work', propositions: ['w'], isInitial: true, x: 0, y: 0 },
    { id: 'e', name: 'error', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'r', name: 'reset', propositions: ['r'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'w', to: 'w' }, { from: 'w', to: 'e' },
    { from: 'e', to: 'r' }, { from: 'r', to: 'w' },
  ],
};
// Same model without the work self-loop: every infinite path cycles through r
const resetNoLoop: KripkeStructure = {
  ...reset,
  transitions: reset.transitions.filter((t) => !(t.from === 'w' && t.to === 'w')),
};

describe('checkLTLAllPaths', () => {
  it('G F r fails on reset (work self-loop) and holds without the self-loop', () => {
    const fail = checkLTLAllPaths(reset, parseLTL('G F r'));
    expect(fail.kind).toBe('fails');
    const hold = checkLTLAllPaths(resetNoLoop, parseLTL('G F r'));
    expect(hold.kind).toBe('holds');
  });
  it('the counterexample stays inside ¬r states', () => {
    const res = checkLTLAllPaths(reset, parseLTL('G F r'));
    if (res.kind !== 'fails') throw new Error('expected fails');
    // the loop portion must avoid r
    const { stateIds, loopIndex } = res.counterexample;
    for (let i = loopIndex; i < stateIds.length; i++) expect(stateIds[i]).not.toBe('r');
  });
  it('F r holds without the self-loop, fails with it', () => {
    expect(checkLTLAllPaths(resetNoLoop, parseLTL('F r')).kind).toBe('holds');
    expect(checkLTLAllPaths(reset, parseLTL('F r')).kind).toBe('fails');
  });
  it('G w fails (path leaves work)', () => {
    expect(checkLTLAllPaths(reset, parseLTL('G w')).kind).toBe('fails');
  });
  it('true holds; false fails', () => {
    expect(checkLTLAllPaths(reset, parseLTL('true')).kind).toBe('holds');
    expect(checkLTLAllPaths(reset, parseLTL('false')).kind).toBe('fails');
  });
  it('no initial states → no-initial', () => {
    const m: KripkeStructure = {
      ...reset,
      states: reset.states.map((s) => ({ ...s, isInitial: false })),
    };
    expect(checkLTLAllPaths(m, parseLTL('F r')).kind).toBe('no-initial');
  });
  it('deadlock-only model holds vacuously (no infinite paths)', () => {
    const m: KripkeStructure = {
      states: [{ id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 }],
      transitions: [],
    };
    expect(checkLTLAllPaths(m, parseLTL('F r')).kind).toBe('holds');
  });
  it('returns automaton and product for holds/fails', () => {
    const res = checkLTLAllPaths(reset, parseLTL('G F r'));
    if (res.kind !== 'fails') throw new Error('expected fails');
    expect(res.automaton.states.length).toBeGreaterThan(0);
    expect(res.product.states.length).toBeGreaterThan(0);
  });
});

describe('cross-checker invariant: counterexamples are valid and falsify the formula', () => {
  const formulas = ['G F r', 'F r', 'G w', 'w U r', 'X w', 'G (w -> X !r)', 'F G w',
    // regression: ⊤-right untils must not collapse the automaton language (universal formulas must hold)
    'G F true', 'G (w U true)', '!(F G false)'];
  const models = { reset, resetNoLoop };
  for (const [mName, model] of Object.entries(models)) {
    for (const f of formulas) {
      it(`${f} on ${mName}`, () => {
        const root = parseLTL(f);
        const res = checkLTLAllPaths(model, root);
        if (res.kind === 'fails') {
          expect(validateLasso(model, res.counterexample)).toBe(null);
          const rows = checkLTL(model, res.counterexample, root);
          expect(rows.get(root.id)![0]).toBe(false);
        }
      });
    }
  }
});
