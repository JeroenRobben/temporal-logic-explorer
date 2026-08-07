import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { Lasso, validateLasso, validatePrefix, nextPosition, propsAt } from './trace';

const k: KripkeStructure = {
  states: [
    { id: 'a', name: 'a', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 'b', name: 'b', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'c', name: 'c', propositions: ['q'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' },
    { from: 'a', to: 'a' },
  ],
};

describe('validateLasso', () => {
  it('accepts a valid lasso', () => {
    expect(validateLasso(k, { stateIds: ['a', 'b', 'c'], loopIndex: 0 })).toBe(null);
    expect(validateLasso(k, { stateIds: ['a'], loopIndex: 0 })).toBe(null); // self-loop
  });
  it('rejects empty and out-of-range loops', () => {
    expect(validateLasso(k, { stateIds: [], loopIndex: 0 })).toMatch(/empty/);
    expect(validateLasso(k, { stateIds: ['a'], loopIndex: 1 })).toMatch(/loop/);
  });
  it('rejects unknown states and broken transitions', () => {
    expect(validateLasso(k, { stateIds: ['a', 'zzz'], loopIndex: 0 })).toMatch(/zzz/);
    expect(validateLasso(k, { stateIds: ['a', 'c'], loopIndex: 0 })).toMatch(/transition/);
  });
  it('rejects a missing loop-back transition', () => {
    // b -> a does not exist
    expect(validateLasso(k, { stateIds: ['a', 'b'], loopIndex: 0 })).toMatch(/loop/);
  });
});

describe('validatePrefix', () => {
  it('accepts valid prefixes and rejects broken ones', () => {
    expect(validatePrefix(k, ['a', 'b', 'c'])).toBe(null);
    expect(validatePrefix(k, [])).toBe(null); // empty prefix is fine (not yet started)
    expect(validatePrefix(k, ['a', 'c'])).toMatch(/transition/);
    expect(validatePrefix(k, ['nope'])).toMatch(/nope/);
  });
});

describe('helpers', () => {
  const l: Lasso = { stateIds: ['a', 'b', 'c'], loopIndex: 1 };
  it('nextPosition wraps to loopIndex', () => {
    expect(nextPosition(l, 0)).toBe(1);
    expect(nextPosition(l, 1)).toBe(2);
    expect(nextPosition(l, 2)).toBe(1);
  });
  it('propsAt reads state propositions', () => {
    expect(propsAt(k, l, 0)).toEqual(['p']);
    expect(propsAt(k, l, 2)).toEqual(['q']);
  });
});
