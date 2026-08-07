import { describe, it, expect } from 'vitest';
import { parseLTL } from './ltl-parser';
import { toNNF, nnfKey, ltlToBuchi, AutomatonTooLarge, BuchiAutomaton } from './buchi';

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
});
