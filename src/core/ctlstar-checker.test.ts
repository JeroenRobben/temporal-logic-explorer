import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { parseCTLStar } from './ctlstar-parser';
import { parseCTL } from './ctl-parser';
import { parseLTL } from './ltl-parser';
import { checkCTL } from './ctl-checker';
import { checkLTL } from './ltl-checker';
import { validateLasso } from './trace';
import { AutomatonTooLarge } from './buchi';
import { checkCTLStar, findStarEvidence } from './ctlstar-checker';

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
const resetNoLoop: KripkeStructure = {
  ...reset,
  transitions: reset.transitions.filter((t) => !(t.from === 'w' && t.to === 'w')),
};
const mutex: KripkeStructure = {
  states: [
    { id: 'n', name: 'idle', propositions: [], isInitial: true, x: 0, y: 0 },
    { id: 'c1', name: 'crit1', propositions: ['c1'], isInitial: false, x: 0, y: 0 },
    { id: 'c2', name: 'crit2', propositions: ['c2'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'n', to: 'c1' }, { from: 'n', to: 'c2' },
    { from: 'c1', to: 'n' }, { from: 'c2', to: 'n' },
  ],
};

function starSat(model: KripkeStructure, formula: string): string[] {
  const root = parseCTLStar(formula);
  const res = checkCTLStar(model, root);
  return [...res.sat.get(root.id)!].sort();
}
function ctlSat(model: KripkeStructure, formula: string): string[] {
  const root = parseCTL(formula);
  return [...checkCTL(model, root).results.get(root.id)!.sat].sort();
}

describe('checkCTLStar — CTL cross-check battery', () => {
  const pairs: [string, string][] = [
    ['A F r', 'AF r'],
    ['E G w', 'EG w'],
    ['A X w', 'AX w'],
    ['E X r', 'EX r'],
    ['A G (E F r)', 'AG EF r'],
    ['E (w U r)', 'E[w U r]'],
    ['A (w U r)', 'A[w U r]'],
    ['A G (w -> E F r)', 'AG (w -> EF r)'],
  ];
  for (const model of [
    { name: 'reset', k: reset }, { name: 'resetNoLoop', k: resetNoLoop }, { name: 'mutex', k: mutex },
  ]) {
    for (const [star, ctl] of pairs) {
      it(`${star} ≡ ${ctl} on ${model.name}`, () => {
        expect(starSat(model.k, star)).toEqual(ctlSat(model.k, ctl));
      });
    }
  }
});

describe('checkCTLStar — beyond CTL', () => {
  it('E F G w: reachable-forever-work exists iff the self-loop does', () => {
    expect(starSat(reset, 'E F G w')).toEqual(['e', 'r', 'w']);
    expect(starSat(resetNoLoop, 'E F G w')).toEqual([]);
  });
  it('E (G F r): the cycle keeps r reachable infinitely often', () => {
    expect(starSat(reset, 'E (G F r)')).toEqual(['e', 'r', 'w']);
  });
  it('A F G w fails everywhere on reset (the cycle path never settles)', () => {
    expect(starSat(reset, 'A F G w')).toEqual([]);
  });
  it('E ψ is the complement of A ¬ψ', () => {
    for (const psi of ['F r', 'G w', 'w U r']) {
      const e = starSat(reset, `E (${psi})`);
      const an = new Set(starSat(reset, `A (!(${psi}))`));
      const compl = reset.states.map((s) => s.id).filter((x) => !an.has(x)).sort();
      expect(e).toEqual(compl);
    }
  });
  it('verdict is over initial states; null without initials', () => {
    const root = parseCTLStar('A G (E F r)');
    expect(checkCTLStar(reset, root).verdict).toBe(true);
    const noInit = { ...reset, states: reset.states.map((s) => ({ ...s, isInitial: false })) };
    expect(checkCTLStar(noInit, parseCTLStar('A F r')).verdict).toBe(null);
  });
  it('quantifier info exposes automaton, labeled model, and legend', () => {
    const root = parseCTLStar('A G (E F r)');
    const res = checkCTLStar(reset, root);
    // root A-node has quantifier info; legend maps a pseudo-prop to the E-subformula
    const q = res.quantifiers.get(root.id)!;
    expect(q.automaton.states.length).toBeGreaterThan(0);
    expect([...q.legend.values()]).toContain('E F r');
    // labeled model carries the pseudo-prop on states satisfying E F r (all of them here)
    const pseudo = [...q.legend.keys()][0];
    expect(q.labeledModel.states.every((s) => s.propositions.includes(pseudo))).toBe(true);
  });
  it('propagates AutomatonTooLarge when capped', () => {
    expect(() => checkCTLStar(reset, parseCTLStar('A G F r'), 1)).toThrow(AutomatonTooLarge);
  });
  it('records sat for state-level leaves inside path formulas', () => {
    const root = parseCTLStar('A G (E F r)');
    const res = checkCTLStar(reset, root);
    let found = 0;
    (function walk(n: import('./ctlstar-parser').StarNode) {
      if (n.kind === 'prop' && n.name === 'r') { found++; expect(res.sat.get(n.id)).toBeDefined(); }
      if ('child' in n) walk(n.child);
      if ('left' in n) { walk(n.left); walk(n.right); }
    })(root);
    expect(found).toBeGreaterThan(0);
  });
  it('reports deadlock states', () => {
    const withDead: KripkeStructure = {
      states: [...reset.states, { id: 'd', name: 'dead', propositions: [], isInitial: false, x: 0, y: 0 }],
      transitions: [...reset.transitions, { from: 'r', to: 'd' }],
    };
    expect(checkCTLStar(withDead, parseCTLStar('A F r')).deadlocks).toEqual(['d']);
  });
});

describe('deadlock caveat: CTL* infinite-path semantics vs CTL maximal-path semantics (audit C)', () => {
  // s0[r] initial, s1[p] deadlock, s2[p,q]; the only transition is s2 -> s0
  // (so s0 is ALSO a deadlock: nothing leaves it).
  const deadlocky: KripkeStructure = {
    states: [
      { id: 's0', name: 's0', propositions: ['r'], isInitial: true, x: 0, y: 0 },
      { id: 's1', name: 's1', propositions: ['p'], isInitial: false, x: 0, y: 0 },
      { id: 's2', name: 's2', propositions: ['p', 'q'], isInitial: false, x: 0, y: 0 },
    ],
    transitions: [{ from: 's2', to: 's0' }],
  };
  it('CTL (maximal-path) AG EF r sat = {s0, s2}; CTL* (infinite-path) A is vacuous everywhere', () => {
    // Under CTL's maximal-path semantics, finite paths ending at a deadlock
    // count: EF r = {s0, s2} (s2 -> s0 reaches r; s1 has no path to r at
    // all). AG (EF r): s0 and s1 are deadlocks, so AG holds there vacuously
    // over the trivial one-state maximal path — s0's own EF-r membership
    // still gates it (true), s1's doesn't (false). s2's only maximal path is
    // s2 -> s0, both members of EF r. Net: {s0, s2}.
    expect(ctlSat(deadlocky, 'AG (EF r)')).toEqual(['s0', 's2']);

    // Under CTL*'s infinite-path semantics, NO infinite path exists anywhere
    // in this model (every state eventually deadlocks), so "A ψ" (no path
    // violates ψ) is vacuously true at every state regardless of ψ.
    expect(starSat(deadlocky, 'A G (E F r)')).toEqual(['s0', 's1', 's2']);
  });
});

describe('findStarEvidence', () => {
  it('failing root A yields a counterexample lasso that falsifies ψ', () => {
    const root = parseCTLStar('A (G F r)');
    const res = checkCTLStar(reset, root);
    expect(res.verdict).toBe(false); // work self-loop violates
    const ev = findStarEvidence(reset, root, res)!;
    expect(ev.kind).toBe('counterexample');
    expect(validateLasso(reset, ev.lasso)).toBe(null);
    const psi = parseLTL('G F r');
    expect(checkLTL(reset, ev.lasso, psi).get(psi.id)![0]).toBe(false);
  });
  it('holding root E yields a witness lasso that satisfies ψ', () => {
    const root = parseCTLStar('E (F G w)');
    const res = checkCTLStar(reset, root);
    expect(res.verdict).toBe(true);
    const ev = findStarEvidence(reset, root, res)!;
    expect(ev.kind).toBe('witness');
    expect(validateLasso(reset, ev.lasso)).toBe(null);
    const psi = parseLTL('F G w');
    expect(checkLTL(reset, ev.lasso, psi).get(psi.id)![0]).toBe(true);
  });
  it('returns null for holding A, failing E, and non-quantified roots', () => {
    const holdA = parseCTLStar('A G (E F r)');
    expect(findStarEvidence(reset, holdA, checkCTLStar(reset, holdA))).toBe(null);
    const failE = parseCTLStar('E G r');
    const resE = checkCTLStar(reset, failE);
    expect(resE.verdict).toBe(false);
    expect(findStarEvidence(reset, failE, resE)).toBe(null);
    const bool = parseCTLStar('w & A F r');
    expect(findStarEvidence(reset, bool, checkCTLStar(reset, bool))).toBe(null);
  });
});
