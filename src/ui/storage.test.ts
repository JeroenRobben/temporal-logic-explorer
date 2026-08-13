import { describe, it, expect } from 'vitest';
import { validateSavedState, normalizeSavedState, save, loadSaved, SavedState } from './storage';

const good: SavedState = {
  model: {
    states: [
      { id: 'a', name: 'a', propositions: ['p'], isInitial: true, x: 0, y: 0 },
      { id: 'b', name: 'b', propositions: [], isInitial: false, x: 1, y: 1 },
    ],
    transitions: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }, { from: 'b', to: 'b' }],
  },
  formulas: [{ id: 'f1', text: 'EF p', logic: 'ctl' }],
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
  it('v1 formulas without a logic tag validate, and normalizeSavedState defaults them to ctl', () => {
    const v1 = { ...good, formulas: [{ id: 'f1', text: 'EF p' }] };
    expect(validateSavedState(v1)).toBe(true);
    const n = normalizeSavedState(v1 as SavedState);
    expect(n.formulas).toEqual([{ id: 'f1', text: 'EF p', logic: 'ctl' }]);
  });
  it('rejects (does not throw on) null/non-object entries in states/transitions/formulas arrays', () => {
    const cases = [
      { model: { states: [null], transitions: [] }, formulas: [] },
      { model: { states: [], transitions: [null] }, formulas: [] },
      { model: { states: [], transitions: [] }, formulas: [null] },
      { model: { states: [42], transitions: [] }, formulas: [] },
    ];
    for (const c of cases) {
      expect(() => validateSavedState(c)).not.toThrow();
      expect(validateSavedState(c)).toBe(false);
    }
  });
  it('save() does not propagate when localStorage.setItem throws (quota exceeded)', () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    try { expect(() => save(good)).not.toThrow(); } finally { Storage.prototype.setItem = orig; }
  });
  it('loadSaved() returns null when localStorage.getItem throws', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error('boom'); };
    try { expect(loadSaved()).toBeNull(); } finally { Storage.prototype.getItem = orig; }
  });
});
