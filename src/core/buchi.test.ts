import { describe, it, expect } from 'vitest';
import { parseLTL } from './ltl-parser';
import { toNNF, nnfKey, ltlToBuchi, AutomatonTooLarge, BuchiAutomaton } from './buchi';
import { KripkeStructure } from './kripke';
import { buildProduct } from './product';
import { findAcceptingLasso } from './emptiness';

const nnf = (s: string) => nnfKey(toNNF(parseLTL(s)));

describe('toNNF', () => {
  it('pushes negation to literals via dualities', () => {
    expect(nnf('!(p U q)')).toBe('R(¬p,¬q)');
    expect(nnf('!G p')).toBe('U(⊤,¬p)');
    expect(nnf('!F p')).toBe('R(⊥,¬p)');
    expect(nnf('!X p')).toBe('X(¬p)');
    expect(nnf('!!p')).toBe('p');
    expect(nnf('!(p & q)')).toBe('or(¬p,¬q)');
  });
  it('normalizes F and G', () => {
    expect(nnf('F p')).toBe('U(⊤,p)');
    expect(nnf('G p')).toBe('R(⊥,p)');
    expect(nnf('G F p')).toBe('R(⊥,U(⊤,p))');
  });
  it('eliminates implies and iff', () => {
    expect(nnf('p -> q')).toBe('or(¬p,q)');
    expect(nnf('!(p -> q)')).toBe('and(p,¬q)');
    expect(nnf('p <-> q')).toBe('or(and(p,q),and(¬p,¬q))');
  });
});

function transitionsFrom(aut: BuchiAutomaton, id: number) {
  return aut.transitions.filter((t) => t.from === id);
}

describe('ltlToBuchi', () => {
  it('produces a small automaton for F p with an accepting sink', () => {
    const aut = ltlToBuchi(parseLTL('F p'));
    expect(aut.states.length).toBeGreaterThan(0);
    expect(aut.states.length).toBeLessThanOrEqual(6);
    expect(aut.states.some((q) => q.initial)).toBe(true);
    expect(aut.states.some((q) => q.accepting)).toBe(true);
    // some accepting state is reachable-looking: has a self-loop
    const acc = aut.states.filter((q) => q.accepting);
    expect(acc.some((q) => transitionsFrom(aut, q.id).some((t) => t.to === q.id))).toBe(true);
  });
  it('G p: some state requires p forever (guard [p], self-loop, accepting)', () => {
    const aut = ltlToBuchi(parseLTL('G p'));
    const q = aut.states.find((s) =>
      s.entryGuard.length === 1 && s.entryGuard[0].prop === 'p' && !s.entryGuard[0].negated
      && s.accepting && transitionsFrom(aut, s.id).some((t) => t.to === s.id));
    expect(q).toBeTruthy();
  });
  it('guards mention only the formula propositions', () => {
    const aut = ltlToBuchi(parseLTL('G (p -> F q)'));
    for (const t of aut.transitions) {
      for (const l of t.guard) expect(['p', 'q']).toContain(l.prop);
    }
  });
  it('true yields an all-accepting universal automaton', () => {
    const aut = ltlToBuchi(parseLTL('true'));
    expect(aut.states.length).toBeGreaterThan(0);
    expect(aut.states.every((q) => q.accepting)).toBe(true);
  });
  it('is deterministic across calls', () => {
    const a = ltlToBuchi(parseLTL('G F p'));
    const b = ltlToBuchi(parseLTL('G F p'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('throws AutomatonTooLarge when exceeding maxStates', () => {
    expect(() => ltlToBuchi(parseLTL('G F p'), 1)).toThrow(AutomatonTooLarge);
  });
  it('every state has readable metadata', () => {
    const aut = ltlToBuchi(parseLTL('G F p'));
    for (const q of aut.states) {
      expect(q.name).toMatch(/^q\d+(·\d+)?$/);
      expect(Array.isArray(q.obligations)).toBe(true);
    }
  });
  it('⊤-right untils stay dischargeable: G F true has an accepting state', () => {
    const aut = ltlToBuchi(parseLTL('G F true'));
    expect(aut.states.some((q) => q.accepting)).toBe(true);
  });
  it('obligations re-sugar F and G', () => {
    const aut = ltlToBuchi(parseLTL('G F p'));
    expect(aut.states.some((q) => q.obligations.some((o) => o.includes('G F p')))).toBe(true);
  });
});

function wordToModel(letters: string[][], loopIndex: number): KripkeStructure {
  const n = letters.length;
  return {
    states: letters.map((propositions, i) => ({
      id: `w${i}`, name: `w${i}`, propositions, isInitial: i === 0, x: 0, y: 0,
    })),
    transitions: letters.map((_, i) => ({
      from: `w${i}`, to: i + 1 < n ? `w${i + 1}` : `w${loopIndex}`,
    })),
  };
}
function accepts(aut: BuchiAutomaton, letters: string[][], loopIndex: number): boolean {
  return findAcceptingLasso(buildProduct(wordToModel(letters, loopIndex), aut)) !== null;
}

describe('degeneralization with k >= 2 acceptance sets', () => {
  it('F p & F q requires BOTH untils discharged', () => {
    const aut = ltlToBuchi(parseLTL('F p & F q'));
    expect(accepts(aut, [['p']], 0)).toBe(false);
    expect(accepts(aut, [['q']], 0)).toBe(false);
    expect(accepts(aut, [[]], 0)).toBe(false);
    expect(accepts(aut, [['p'], ['q']], 1)).toBe(true);
  });
  it('F p & F q & F r rejects every single omission', () => {
    const aut = ltlToBuchi(parseLTL('F p & F q & F r'));
    expect(accepts(aut, [['p'], ['q'], ['r']], 2)).toBe(true);
    expect(accepts(aut, [['p'], ['q'], []], 2)).toBe(false);
    expect(accepts(aut, [['p'], [], ['r']], 2)).toBe(false);
    expect(accepts(aut, [[], ['q'], ['r']], 2)).toBe(false);
    expect(accepts(aut, [['p', 'q', 'r']], 0)).toBe(true);
  });
  it('G F p & G F q: the counter must cycle through both sets in the LOOP', () => {
    const aut = ltlToBuchi(parseLTL('G F p & G F q'));
    expect(accepts(aut, [['p'], ['q']], 0)).toBe(true);
    expect(accepts(aut, [['q'], ['p']], 1)).toBe(false);
    expect(accepts(aut, [['p'], ['q']], 1)).toBe(false);
    expect(accepts(aut, [['p', 'q'], []], 1)).toBe(false);
  });
  it('(p U q) & (q U p) — two distinct untils', () => {
    const aut = ltlToBuchi(parseLTL('(p U q) & (q U p)'));
    expect(accepts(aut, [['p', 'q']], 0)).toBe(true);
    expect(accepts(aut, [['q']], 0)).toBe(false);
    expect(accepts(aut, [['p']], 0)).toBe(false);
    expect(accepts(aut, [['p'], ['q']], 1)).toBe(true);
  });
  it('G F true & F p keeps a non-empty language', () => {
    const aut = ltlToBuchi(parseLTL('G F true & F p'));
    expect(aut.states.some((s) => s.accepting)).toBe(true);
    expect(accepts(aut, [['p']], 0)).toBe(true);
    expect(accepts(aut, [[]], 0)).toBe(false);
  });
  it('(p U true) & (q U true) & G F p still tracks the real until', () => {
    const aut = ltlToBuchi(parseLTL('(p U true) & (q U true) & G F p'));
    expect(accepts(aut, [['p']], 0)).toBe(true);
    expect(accepts(aut, [['p'], []], 1)).toBe(false);
  });
});
