import { describe, it, expect } from 'vitest';
import { KripkeStructure } from '../core/kripke';
import { unfoldTree } from '../core/unfold';
import { unrollLasso, branchMatch } from './TreeView';

// reset example: w (self-loop) -> e -> r -> w
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

describe('unrollLasso', () => {
  it('exact-fit prefix with no loop: continues is false', () => {
    const r = unrollLasso(['a', 'b', 'c'], null, 3);
    expect(r).toEqual({ seq: ['a', 'b', 'c'], continues: false });
  });
  it('single-state lasso repeats and continues is true', () => {
    const r = unrollLasso(['a'], 0, 3);
    expect(r).toEqual({ seq: ['a', 'a', 'a'], continues: true });
  });
  it('wraps around mid-sequence', () => {
    const r = unrollLasso(['a', 'b', 'c'], 1, 5);
    expect(r.seq).toEqual(['a', 'b', 'c', 'b', 'c']);
    expect(r.continues).toBe(true);
  });
  it('maxLen 0 yields an empty sequence', () => {
    const r = unrollLasso(['a', 'b'], null, 0);
    expect(r.seq).toEqual([]);
  });
  it('prefix shorter than maxLen: seq is the prefix, continues is false', () => {
    const r = unrollLasso(['a', 'b'], null, 5);
    expect(r).toEqual({ seq: ['a', 'b'], continues: false });
  });
});

describe('branchMatch', () => {
  const tree = unfoldTree(k, 'w', 3);

  it('sequence matching root fully within depth: keys correct, cutKey null', () => {
    // w -(0.1)-> e -(0.1.0)-> r, continues=false (sequence ends here)
    const { keys, cutKey } = branchMatch(tree, ['w', 'e', 'r'], false);
    expect(keys).toEqual(new Set(['0', '0.1', '0.1.0']));
    expect(cutKey).toBeNull();
  });

  it('sequence continuing beyond depth: cutKey is the last matched node', () => {
    // w -> e -> r -> w reaches the depth-3 leaf; continues=true marks it cut
    const { keys, cutKey } = branchMatch(tree, ['w', 'e', 'r', 'w'], true);
    expect(keys).toEqual(new Set(['0', '0.1', '0.1.0', '0.1.0.0']));
    expect(cutKey).toBe('0.1.0.0');
  });

  it('sequence starting elsewhere: empty keys, cutKey null', () => {
    const { keys, cutKey } = branchMatch(tree, ['e', 'r'], false);
    expect(keys).toEqual(new Set());
    expect(cutKey).toBeNull();
  });

  it('sequence diverging mid-tree (state not a child): cut at last match', () => {
    // w -(0.0)-> w(revisit); that node's children are [w, e], no 'r' child
    const { keys, cutKey } = branchMatch(tree, ['w', 'w', 'r'], false);
    expect(keys).toEqual(new Set(['0', '0.0']));
    expect(cutKey).toBe('0.0');
  });
});
