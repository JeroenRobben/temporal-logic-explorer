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

describe('oversized product guard (audit C-2)', () => {
  it('a 4500-state linear-chain product returns too-large without throwing RangeError', () => {
    const n = 4500;
    const states = Array.from({ length: n }, (_, i) => ({
      id: `a${i}`, name: `a${i}`, propositions: ['p'], isInitial: i === 0, x: 0, y: 0,
    }));
    const transitions = Array.from({ length: n }, (_, i) => ({
      from: `a${i}`, to: `a${(i + 1) % n}`,
    }));
    const model: KripkeStructure = { states, transitions };
    expect(() => checkLTLAllPaths(model, parseLTL('G p'))).not.toThrow();
    expect(checkLTLAllPaths(model, parseLTL('G p')).kind).toBe('too-large');
  });
});

describe('too-large propagates through checkLTLAllPaths (audit C)', () => {
  const selfLoop: KripkeStructure = {
    states: [{ id: 's', name: 's', propositions: [], isInitial: true, x: 0, y: 0 }],
    transitions: [{ from: 's', to: 's' }],
  };
  it('!(F a & F b & F c & F d & F e) is too-large', () => {
    expect(checkLTLAllPaths(selfLoop, parseLTL('!(F a & F b & F c & F d & F e)')).kind).toBe('too-large');
  });
  it('G !a | G !b | G !c | G !d | G !e is too-large', () => {
    expect(checkLTLAllPaths(selfLoop, parseLTL('G !a | G !b | G !c | G !d | G !e')).kind).toBe('too-large');
  });
  it('!(F a & F b & F c & F d) is NOT too-large', () => {
    expect(checkLTLAllPaths(selfLoop, parseLTL('!(F a & F b & F c & F d)')).kind).not.toBe('too-large');
  });
});

describe('vacuous holds on deadlock (audit C)', () => {
  // s0[p] -> s1, s1 is a deadlock: the only maximal path is finite (s0, s1),
  // so there is no infinite path to falsify any LTL formula — everything
  // "holds" vacuously. See the Inspector's warning about infinite-path
  // semantics on models with deadlocks/finite paths.
  const m: KripkeStructure = {
    states: [
      { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
      { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
    ],
    transitions: [{ from: 's0', to: 's1' }],
  };
  it('G p holds vacuously', () => {
    expect(checkLTLAllPaths(m, parseLTL('G p')).kind).toBe('holds');
  });
  it('false holds vacuously', () => {
    expect(checkLTLAllPaths(m, parseLTL('false')).kind).toBe('holds');
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
