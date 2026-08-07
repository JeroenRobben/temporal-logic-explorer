import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { parseLTL } from './ltl-parser';
import { Lasso } from './trace';
import { checkLTL } from './ltl-checker';

// work[w] -> error[] -> reset[r] -> work…  plus work self-loop
const k: KripkeStructure = {
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

const cycle: Lasso = { stateIds: ['w', 'e', 'r'], loopIndex: 0 };     // w e r w e r …
const stuck: Lasso = { stateIds: ['w'], loopIndex: 0 };               // w w w …
const prefixed: Lasso = { stateIds: ['w', 'w', 'e', 'r'], loopIndex: 1 }; // w (w e r)^ω

function row(lasso: Lasso, formula: string): boolean[] {
  const root = parseLTL(formula);
  return checkLTL(k, lasso, root).get(root.id)!;
}

describe('checkLTL', () => {
  it('props and booleans are pointwise', () => {
    expect(row(cycle, 'w')).toEqual([true, false, false]);
    expect(row(cycle, 'w | r')).toEqual([true, false, true]);
    expect(row(cycle, '!w')).toEqual([false, true, true]);
  });
  it('X wraps around the loop', () => {
    expect(row(cycle, 'X w')).toEqual([false, false, true]); // next of pos2 is pos0
    expect(row(stuck, 'X w')).toEqual([true]);
  });
  it('F sees the loop', () => {
    expect(row(cycle, 'F r')).toEqual([true, true, true]);
    expect(row(stuck, 'F r')).toEqual([false]);
  });
  it('G F r: true when r is inside the loop, false otherwise', () => {
    expect(row(cycle, 'G F r')).toEqual([true, true, true]);
    expect(row(stuck, 'G F r')).toEqual([false]);
  });
  it('F G w: false on the cycle (w not invariant in loop), true on stuck', () => {
    expect(row(cycle, 'F G w')).toEqual([false, false, false]);
    expect(row(stuck, 'F G w')).toEqual([true]);
  });
  it('U: q in the loop vs never', () => {
    expect(row(cycle, '!r U r')).toEqual([true, true, true]);
    expect(row(stuck, 'w U r')).toEqual([false]);
    expect(row(cycle, 'w U r')).toEqual([false, false, true]); // at pos1 w fails before r
  });
  it('prefix vs loop distinction', () => {
    // prefixed = w (w e r)^ω: G w false everywhere, F r true everywhere
    expect(row(prefixed, 'F r')).toEqual([true, true, true, true]);
    expect(row(prefixed, 'G F r')).toEqual([true, true, true, true]);
  });
  it('nested: G (w -> F r) on the cycle', () => {
    expect(row(cycle, 'G (w -> F r)')).toEqual([true, true, true]);
  });
  it('stores a row for every subformula, all of trace length', () => {
    const root = parseLTL('G (w -> F r)');
    const rows = checkLTL(k, cycle, root);
    let count = 0;
    (function walk(n: import('./ltl-parser').LTLNode) {
      count++;
      expect(rows.get(n.id)).toHaveLength(3);
      if ('child' in n) walk(n.child);
      if ('left' in n) { walk(n.left); walk(n.right); }
    })(root);
    expect(count).toBe(5); // G, ->, w, F, r
  });
});
