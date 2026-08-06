import { describe, it, expect } from 'vitest';
import {
  KripkeStructure, successors, stateById, deadlockStates, allPropositions,
} from './kripke';

const k: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 's2', name: 's2', propositions: ['q'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 's0', to: 's0' }, { from: 's0', to: 's1' }, { from: 's1', to: 's2' },
  ],
};

describe('kripke helpers', () => {
  it('successors returns outgoing targets', () => {
    expect(successors(k, 's0').sort()).toEqual(['s0', 's1']);
    expect(successors(k, 's2')).toEqual([]);
  });
  it('stateById finds states', () => {
    expect(stateById(k, 's1')?.name).toBe('s1');
    expect(stateById(k, 'nope')).toBeUndefined();
  });
  it('deadlockStates finds states with no successors', () => {
    expect(deadlockStates(k)).toEqual(['s2']);
  });
  it('allPropositions collects unique props', () => {
    expect(allPropositions(k).sort()).toEqual(['p', 'q']);
  });
  it('allPropositions deduplicates across states', () => {
    const kDup: KripkeStructure = {
      states: [
        { id: 's0', name: 's0', propositions: ['p', 'q'], isInitial: true, x: 0, y: 0 },
        { id: 's1', name: 's1', propositions: ['q', 'r'], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [{ from: 's0', to: 's1' }],
    };
    expect(allPropositions(kDup).sort()).toEqual(['p', 'q', 'r']);
  });
});
