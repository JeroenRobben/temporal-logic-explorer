import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { unfoldTree, countNodes, countUnfoldBounded, TreeNode } from './unfold';

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

function shape(n: TreeNode): string {
  const c = n.children.map(shape).join(',');
  return `${n.stateId}${n.revisit ? '⟳' : ''}${c ? `(${c})` : ''}`;
}

describe('unfoldTree', () => {
  it('depth 0 yields the root only', () => {
    const t = unfoldTree(k, 'w', 0);
    expect(t.children).toEqual([]);
    expect(t.key).toBe('0');
    expect(t.depth).toBe(0);
    expect(t.revisit).toBe(false);
  });
  it('unrolls in transition order with revisit marking', () => {
    const t = unfoldTree(k, 'w', 2);
    expect(shape(t)).toBe('w(w⟳(w⟳,e),e(r))');
  });
  it('revisit is per root-path, not global', () => {
    // at depth 3 the branch w→e→r→w revisits w (w is on that root-path)
    const t = unfoldTree(k, 'w', 3);
    const r = t.children[1].children[0]; // w→e→r
    expect(r.stateId).toBe('r');
    expect(r.revisit).toBe(false);
    expect(r.children[0].stateId).toBe('w');
    expect(r.children[0].revisit).toBe(true);
  });
  it('keys are path-based and unique', () => {
    const t = unfoldTree(k, 'w', 3);
    const keys: string[] = [];
    (function walk(n: TreeNode) { keys.push(n.key); n.children.forEach(walk); })(t);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('0.1.0.0'); // w→e→r→w
  });
  it('countNodes matches the hand-computed unfolding', () => {
    // depth 3 from w: 1 + 2 + 3 + 4 = 10
    expect(countNodes(unfoldTree(k, 'w', 3))).toBe(10);
  });
  it('deadlock states simply have no children', () => {
    const kd: KripkeStructure = {
      states: [
        { id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 },
        { id: 'd', name: 'd', propositions: [], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [{ from: 'a', to: 'd' }],
    };
    const t = unfoldTree(kd, 'a', 3);
    expect(shape(t)).toBe('a(d)');
  });
  it('is deterministic', () => {
    expect(JSON.stringify(unfoldTree(k, 'w', 4))).toBe(JSON.stringify(unfoldTree(k, 'w', 4)));
  });
  it('countUnfoldBounded matches countNodes below the cap and stops early above it', () => {
    expect(countUnfoldBounded(k, ['w'], 3, 800)).toBe(10);
    expect(countUnfoldBounded(k, ['w'], 6, 5)).toBe(6); // cap + 1: early exit
  });

  describe('depth-6, branching-3 closed form', () => {
    // fully connected 3-state model: every state has exactly 3 successors,
    // so the unfolding is a complete ternary tree of depth 6.
    const k3: KripkeStructure = {
      states: [
        { id: 'x', name: 'x', propositions: [], isInitial: true, x: 0, y: 0 },
        { id: 'y', name: 'y', propositions: [], isInitial: false, x: 0, y: 0 },
        { id: 'z', name: 'z', propositions: [], isInitial: false, x: 0, y: 0 },
      ],
      transitions: ['x', 'y', 'z'].flatMap((from) => ['x', 'y', 'z'].map((to) => ({ from, to }))),
    };
    // sum_{i=0..6} 3^i = (3^7 - 1) / 2 = 1093
    const EXPECTED = 1093;

    it('countNodes matches the closed-form node count', () => {
      expect(countNodes(unfoldTree(k3, 'x', 6))).toBe(EXPECTED);
    });
    it('countUnfoldBounded equals countNodes when under the cap', () => {
      expect(countUnfoldBounded(k3, ['x'], 6, 2000)).toBe(EXPECTED);
    });
    it('countUnfoldBounded exits early once over the cap', () => {
      expect(countUnfoldBounded(k3, ['x'], 6, 100)).toBe(101);
    });
  });
});
