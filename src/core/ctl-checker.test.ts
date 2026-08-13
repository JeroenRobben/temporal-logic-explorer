import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { parseCTL, CTLNode } from './ctl-parser';
import { checkCTL } from './ctl-checker';

// s0[p] ⇄self →s1[] →s2[q] ⇄self
const k: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 's2', name: 's2', propositions: ['q'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 's0', to: 's0' }, { from: 's0', to: 's1' },
    { from: 's1', to: 's2' }, { from: 's2', to: 's2' },
  ],
};

function sat(k: KripkeStructure, formula: string): { sat: string[]; root: CTLNode; record: ReturnType<typeof checkCTL> } {
  const root = parseCTL(formula);
  const record = checkCTL(k, root);
  return { sat: [...record.results.get(root.id)!.sat].sort(), root, record };
}

describe('checkCTL', () => {
  it('atomic and boolean operators', () => {
    expect(sat(k, 'p').sat).toEqual(['s0']);
    expect(sat(k, 'true').sat).toEqual(['s0', 's1', 's2']);
    expect(sat(k, '!p').sat).toEqual(['s1', 's2']);
    expect(sat(k, 'p | q').sat).toEqual(['s0', 's2']);
    expect(sat(k, 'p -> q').sat).toEqual(['s1', 's2']);
  });
  it('EX / AX', () => {
    expect(sat(k, 'EX q').sat).toEqual(['s1', 's2']);
    expect(sat(k, 'AX q').sat).toEqual(['s1', 's2']);
    expect(sat(k, 'EX p').sat).toEqual(['s0']);
  });
  it('EF: everything reaches q', () => {
    expect(sat(k, 'EF q').sat).toEqual(['s0', 's1', 's2']);
  });
  it('EF records growing iterations', () => {
    const { root, record } = sat(k, 'EF q');
    const iters = record.results.get(root.id)!.iterations.map((s) => [...s].sort());
    expect(iters).toEqual([['s2'], ['s1', 's2'], ['s0', 's1', 's2']]);
  });
  it('AF: s0 can loop on ¬q forever', () => {
    expect(sat(k, 'AF q').sat).toEqual(['s1', 's2']);
  });
  it('EG: self-loop on p makes EG p hold at s0', () => {
    expect(sat(k, 'EG p').sat).toEqual(['s0']);
  });
  it('AG: q is invariant only from s2', () => {
    expect(sat(k, 'AG q').sat).toEqual(['s2']);
    expect(sat(k, 'AG EF q').sat).toEqual(['s0', 's1', 's2']);
  });
  it('EU: p does not bridge s1', () => {
    expect(sat(k, 'E[p U q]').sat).toEqual(['s2']);
    expect(sat(k, 'E[true U q]').sat).toEqual(['s0', 's1', 's2']);
  });
  it('AU', () => {
    expect(sat(k, 'A[true U q]').sat).toEqual(['s1', 's2']);
  });
  it('iff', () => {
    expect(sat(k, 'p <-> q').sat).toEqual(['s1']);
  });
  it('EG records shrinking iterations', () => {
    const { root, record } = sat(k, 'EG !q');
    const iters = record.results.get(root.id)!.iterations.map((s) => [...s].sort());
    expect(iters).toEqual([['s0', 's1'], ['s0']]);
  });
  it('verdict is over initial states', () => {
    expect(sat(k, 'EF q').record.verdict).toBe(true);
    expect(sat(k, 'AF q').record.verdict).toBe(false);
  });
  it('verdict is null with no initial states', () => {
    const k2: KripkeStructure = { ...k, states: k.states.map((s) => ({ ...s, isInitial: false })) };
    expect(sat(k2, 'p').record.verdict).toBe(null);
  });
  it('deadlock states vacuously satisfy AX false and are reported', () => {
    const kd: KripkeStructure = {
      states: [
        { id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 },
      ],
      transitions: [],
    };
    const r = sat(kd, 'AX false');
    expect(r.sat).toEqual(['a']);
    expect(r.record.deadlocks).toEqual(['a']);
  });
  it('deadlocks do not vacuously satisfy AF/AU, and do satisfy EG when the invariant holds', () => {
    const kd: KripkeStructure = {
      states: [
        { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
        { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [{ from: 's0', to: 's1' }],
    };
    expect(sat(kd, 'AF false').sat).toEqual([]);
    expect(sat(kd, 'AF p').sat).toEqual(['s0']);
    expect(sat(kd, 'A[true U p]').sat).toEqual(['s0']);
    // p only holds at s0, so the maximal path s0->s1 does NOT satisfy G p
    // (p fails at the deadlock s1) — EG p is false at s0 on this fixture.
    expect(sat(kd, 'EG p').sat).toEqual([]);
    // With p holding at both states, the finite maximal path s0->s1 does
    // satisfy G p throughout, so EG p holds at s0 (and at s1, vacuously).
    const kd2: KripkeStructure = {
      ...kd,
      states: kd.states.map((s) => ({ ...s, propositions: ['p'] })),
    };
    expect(sat(kd2, 'EG p').sat).toEqual(['s0', 's1']);
  });
  it('CTL duality laws hold on models with and without deadlocks', () => {
    const kd: KripkeStructure = {
      states: [
        { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
        { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [{ from: 's0', to: 's1' }],
    };
    for (const m of [k, kd]) {
      for (const phi of ['p', 'q', 'EF q', 'AG p', 'EX p']) {
        expect(sat(m, `AF (${phi})`).sat).toEqual(sat(m, `!(EG (!(${phi})))`).sat);
        expect(sat(m, `AG (${phi})`).sat).toEqual(sat(m, `!(EF (!(${phi})))`).sat);
        expect(sat(m, `AX (${phi})`).sat).toEqual(sat(m, `!(EX (!(${phi})))`).sat);
      }
    }
  });
  it('stores results for every subformula node', () => {
    const root = parseCTL('AG (p -> EF q)');
    const record = checkCTL(k, root);
    let count = 0;
    (function walk(n: CTLNode) {
      count++;
      expect(record.results.has(n.id)).toBe(true);
      if ('child' in n) walk(n.child);
      if ('left' in n) { walk(n.left); walk(n.right); }
    })(root);
    expect(count).toBe(5); // AG, ->, p, EF, q
  });
});
