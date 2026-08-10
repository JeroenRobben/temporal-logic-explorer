import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { BuchiAutomaton } from './buchi';
import { buildProduct } from './product';

// Hand-built automaton for F p: q0 (initial) --true--> q0, --p--> q1; q1 (accepting) --true--> q1
const fpAut: BuchiAutomaton = {
  states: [
    { id: 0, name: 'q0', obligations: ['F p'], entryGuard: [], accepting: false, initial: true },
    { id: 1, name: 'q1', obligations: [], entryGuard: [{ prop: 'p', negated: false }], accepting: true, initial: false },
  ],
  transitions: [
    // NOTE: per the construction's convention, a transition's guard always
    // equals the TARGET state's entry guard — keep this hand-built automaton
    // consistent with that (q1's entry guard is [p], so every edge INTO q1
    // carries [p]).
    { from: 0, to: 0, guard: [] },
    { from: 0, to: 1, guard: [{ prop: 'p', negated: false }] },
    { from: 1, to: 1, guard: [{ prop: 'p', negated: false }] },
  ],
};

const k: KripkeStructure = {
  states: [
    { id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 },
    { id: 'b', name: 'b', propositions: ['p'], isInitial: false, x: 0, y: 0 },
    { id: 'd', name: 'd', propositions: [], isInitial: false, x: 0, y: 0 }, // deadlock
  ],
  transitions: [
    { from: 'a', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'd' },
  ],
};

describe('buildProduct', () => {
  it('creates only guard-consistent, reachable states', () => {
    const prod = buildProduct(k, fpAut);
    const ids = prod.states.map((s) => s.id).sort();
    // a×q1 impossible (a lacks p); b×q1 possible; d reachable with q0/q1
    expect(ids).toContain('a×q0');
    expect(ids).toContain('b×q1');
    expect(ids).not.toContain('a×q1');
  });
  it('marks initial and accepting correctly', () => {
    const prod = buildProduct(k, fpAut);
    const init = prod.states.filter((s) => s.initial);
    expect(init.map((s) => s.id)).toEqual(['a×q0']);
    expect(prod.states.find((s) => s.id === 'b×q1')!.accepting).toBe(true);
  });
  it('deadlock model states produce successor-less product states', () => {
    const prod = buildProduct(k, fpAut);
    const dStates = prod.states.filter((s) => s.modelStateId === 'd');
    expect(dStates.length).toBeGreaterThan(0);
    for (const ds of dStates) {
      expect(prod.edges.some((e) => e.from === ds.id)).toBe(false);
    }
  });
  it('edges respect both relations', () => {
    const prod = buildProduct(k, fpAut);
    expect(prod.edges.some((e) => e.from === 'a×q0' && e.to === 'b×q1')).toBe(true);
    expect(prod.edges.some((e) => e.from === 'b×q1' && e.to === 'a×q1')).toBe(false); // a lacks p? guard on q1 entry is p
  });
  it('initialIds overrides which model states seed the product', () => {
    const prod = buildProduct(k, fpAut, ['b']);
    const init = prod.states.filter((s) => s.initial);
    // b×q0 is initial because q0 is automaton-initial; q1 is not automaton-initial, though it admits b via its entry guard
    expect(init.map((s) => s.id).sort()).toEqual(['b×q0']);
    expect(prod.states.some((s) => s.id === 'a×q0' && s.initial)).toBe(false);
  });
  it('initialIds [] yields an empty product', () => {
    const prod = buildProduct(k, fpAut, []);
    expect(prod.states.length).toBe(0);
  });
  it('omitting initialIds keeps the default behavior', () => {
    const prod = buildProduct(k, fpAut);
    expect(prod.states.filter((s) => s.initial).map((s) => s.id)).toEqual(['a×q0']);
  });
});
