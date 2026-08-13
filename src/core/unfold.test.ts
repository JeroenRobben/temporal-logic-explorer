import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { unfoldTree, countNodes, TreeNode } from './unfold';

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
});
