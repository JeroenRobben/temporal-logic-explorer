import { describe, it, expect } from 'vitest';
import { validateSavedState, normalizeSavedState, SavedState } from './storage';

const good: SavedState = {
  model: {
    states: [
      { id: 'a', name: 'a', propositions: ['p'], isInitial: true, x: 0, y: 0 },
      { id: 'b', name: 'b', propositions: [], isInitial: false, x: 1, y: 1 },
    ],
    transitions: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }, { from: 'b', to: 'b' }],
  },
  formulas: [{ id: 'f1', text: 'EF p' }],
};

describe('storage', () => {
  it('validateSavedState accepts a well-formed state and rejects malformed ones', () => {
    expect(validateSavedState(good)).toBe(true);
    expect(validateSavedState(null)).toBe(false);
    expect(validateSavedState({})).toBe(false);
    expect(validateSavedState({ ...good, formulas: [{ id: 1, text: 'x' }] })).toBe(false);
    expect(validateSavedState({
      ...good,
      model: { ...good.model, transitions: [{ from: 'a', to: 'zzz' }] },
    })).toBe(false);
  });
  it('normalizeSavedState drops duplicate transitions, keeps order', () => {
    const n = normalizeSavedState(good);
    expect(n.model.transitions).toEqual([{ from: 'a', to: 'b' }, { from: 'b', to: 'b' }]);
    expect(good.model.transitions.length).toBe(3); // input untouched
  });
});
