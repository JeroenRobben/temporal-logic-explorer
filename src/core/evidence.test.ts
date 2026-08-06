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
    expect(evidenceFor('AG EF q')).toBe(null); // holds; nested — unsupported
    expect(evidenceFor('p & q')).toBe(null); // non-temporal root
  });
});
