import { describe, it, expect } from 'vitest';
import { KripkeStructure, successors } from './kripke';
import { parseCTL } from './ctl-parser';
import { checkCTL } from './ctl-checker';
import { findEvidence, Evidence } from './evidence';

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

function evidenceFor(formula: string, from = 's0'): Evidence | null {
  const root = parseCTL(formula);
  return findEvidence(k, checkCTL(k, root), root, from);
}

function isRealPath(e: Evidence) {
  for (let i = 0; i + 1 < e.path.length; i++) {
    expect(successors(k, e.path[i])).toContain(e.path[i + 1]);
  }
}

describe('findEvidence', () => {
  it('EF witness is a shortest real path to a q-state', () => {
    const e = evidenceFor('EF q')!;
    expect(e.kind).toBe('witness');
    expect(e.path).toEqual(['s0', 's1', 's2']);
    isRealPath(e);
  });
  it('AG counterexample reaches a violating state', () => {
    const e = evidenceFor('AG p')!;
    expect(e.kind).toBe('counterexample');
    expect(e.path[e.path.length - 1]).toBe('s1');
    isRealPath(e);
  });
  it('EG witness is a lasso staying in the region', () => {
    const e = evidenceFor('EG p')!;
    expect(e.kind).toBe('witness');
    expect(e.loopIndex).toBeDefined();
    expect(e.path[e.loopIndex!]).toBe(e.path[e.path.length - 1]);
    isRealPath(e);
  });
  it('AF counterexample is a lasso avoiding q', () => {
    const e = evidenceFor('AF q')!;
    expect(e.kind).toBe('counterexample');
    expect(e.loopIndex).toBeDefined();
    for (const s of e.path) expect(s).not.toBe('s2');
    isRealPath(e);
  });
  it('EU witness routes through φ-states only', () => {
    const e = evidenceFor('E[true U q]')!;
    expect(e.path[e.path.length - 1]).toBe('s2');
    isRealPath(e);
  });
  it('returns null when there is nothing to show', () => {
    expect(evidenceFor('EF q', 's2')?.path).toEqual(['s2']); // trivial witness
    expect(evidenceFor('AG EF q')).toBe(null); // AG holds — this API only shows AG counterexamples, not witnesses
    expect(evidenceFor('p & q')).toBe(null); // non-temporal root
  });
  it('EG witness handles a lasso with a stem and multi-state cycle', () => {
    const k2: KripkeStructure = {
      states: [
        { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
        { id: 's1', name: 's1', propositions: ['p'], isInitial: false, x: 0, y: 0 },
        { id: 's2', name: 's2', propositions: ['p'], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [
        { from: 's0', to: 's1' }, { from: 's1', to: 's2' }, { from: 's2', to: 's1' },
      ],
    };
    const root = parseCTL('EG p');
    const e = findEvidence(k2, checkCTL(k2, root), root, 's0')!;
    expect(e.path).toEqual(['s0', 's1', 's2', 's1']);
    expect(e.loopIndex).toBe(1);
  });
  it('AF counterexample and EG witness can be finite maximal paths on deadlock models', () => {
    // s0[p] -> s1[] (deadlock, no p): AF p fails at s1 (deadlock, no successor
    // to discharge AF); the finite maximal path ['s1'] IS the counterexample.
    const kd: KripkeStructure = {
      states: [
        { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
        { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [{ from: 's0', to: 's1' }],
    };
    const af = parseCTL('AF p');
    const resAF = findEvidence(kd, checkCTL(kd, af), af, 's1')!;
    expect(resAF.kind).toBe('counterexample');
    expect(resAF.path).toEqual(['s1']);
    expect(resAF.loopIndex).toBeUndefined();

    // s0[p] -> s1[p] (deadlock, p holds): the finite maximal path s0->s1
    // satisfies G p throughout, so EG p holds at s0; the witness is that
    // finite path ending at the deadlock (no loop).
    const kd2: KripkeStructure = {
      ...kd,
      states: kd.states.map((s) => ({ ...s, propositions: ['p'] })),
    };
    const eg = parseCTL('EG p');
    const resEG = findEvidence(kd2, checkCTL(kd2, eg), eg, 's0')!;
    expect(resEG.kind).toBe('witness');
    expect(resEG.path).toEqual(['s0', 's1']);
    expect(resEG.loopIndex).toBeUndefined();
  });
  it('EU witness respects the φ-restriction on intermediate states', () => {
    const k3: KripkeStructure = {
      states: [
        { id: 'a', name: 'a', propositions: ['p'], isInitial: true, x: 0, y: 0 },
        { id: 'b', name: 'b', propositions: [], isInitial: false, x: 0, y: 0 },
        { id: 'c1', name: 'c1', propositions: ['p'], isInitial: false, x: 0, y: 0 },
        { id: 'c2', name: 'c2', propositions: ['p'], isInitial: false, x: 0, y: 0 },
        { id: 'd', name: 'd', propositions: ['q'], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [
        { from: 'a', to: 'b' }, { from: 'b', to: 'd' },
        { from: 'a', to: 'c1' }, { from: 'c1', to: 'c2' }, { from: 'c2', to: 'd' },
      ],
    };
    const root = parseCTL('E[p U q]');
    const e = findEvidence(k3, checkCTL(k3, root), root, 'a')!;
    expect(e.path).toEqual(['a', 'c1', 'c2', 'd']); // must NOT shortcut through non-p state b
  });
});
