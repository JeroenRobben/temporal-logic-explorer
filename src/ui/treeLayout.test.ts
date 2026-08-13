import { describe, it, expect } from 'vitest';
import { KripkeStructure } from '../core/kripke';
import { unfoldTree, TreeNode } from '../core/unfold';
import { layoutTree, X_SLOT, Y_STEP } from './treeLayout';

const k: KripkeStructure = {
  states: [
    { id: 'w', name: 'w', propositions: [], isInitial: true, x: 0, y: 0 },
    { id: 'e', name: 'e', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'r', name: 'r', propositions: [], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'w', to: 'w' }, { from: 'w', to: 'e' },
    { from: 'e', to: 'r' }, { from: 'r', to: 'w' },
  ],
};

describe('layoutTree', () => {
  const tree = unfoldTree(k, 'w', 3);
  const { positions, slots } = layoutTree(tree);

  it('positions every node', () => {
    let count = 0;
    (function walk(n: TreeNode) { count++; n.children.forEach(walk); })(tree);
    expect(positions.size).toBe(count);
  });
  it('y grows with depth', () => {
    expect(positions.get('0')!.y + Y_STEP).toBe(positions.get('0.0')!.y);
  });
  it('no two nodes at the same depth share an x position', () => {
    const byDepth = new Map<number, number[]>();
    (function walk(n: TreeNode) {
      const arr = byDepth.get(n.depth) ?? [];
      arr.push(positions.get(n.key)!.x);
      byDepth.set(n.depth, arr);
      n.children.forEach(walk);
    })(tree);
    for (const xs of byDepth.values()) {
      expect(new Set(xs).size).toBe(xs.length);
    }
  });
  it('parents are centered over their children', () => {
    const root = positions.get('0')!;
    const c0 = positions.get('0.0')!;
    const c1 = positions.get('0.1')!;
    expect(root.x).toBeCloseTo((c0.x + c1.x) / 2);
  });
  it('slots equals the leaf count and startSlot offsets a second tree', () => {
    let leaves = 0;
    (function walk(n: TreeNode) {
      if (n.children.length === 0) leaves++;
      n.children.forEach(walk);
    })(tree);
    expect(slots).toBe(leaves);
    const second = layoutTree(tree, slots + 1);
    const minX = Math.min(...[...second.positions.values()].map((p) => p.x));
    const maxX = Math.max(...[...positions.values()].map((p) => p.x));
    expect(minX).toBeGreaterThan(maxX + X_SLOT - 1);
  });

  describe('5-root forest', () => {
    // Same tree shape unfolded 5 times and laid out side by side, mirroring
    // how TreeView lays out multiple roots (slot += slots + 1 each time).
    const trees = Array.from({ length: 5 }, () => unfoldTree(k, 'w', 3));
    let slot = 0;
    const layouts = trees.map((t) => {
      const { positions, slots } = layoutTree(t, slot);
      slot += slots + 1;
      return positions;
    });

    it('no two nodes at the same depth share an x, across all trees', () => {
      const byDepth = new Map<number, number[]>();
      trees.forEach((t, ti) => {
        (function walk(n: TreeNode) {
          const arr = byDepth.get(n.depth) ?? [];
          arr.push(layouts[ti].get(n.key)!.x);
          byDepth.set(n.depth, arr);
          n.children.forEach(walk);
        })(t);
      });
      for (const xs of byDepth.values()) {
        expect(new Set(xs).size).toBe(xs.length);
      }
    });

    it('per-tree x-ranges are strictly increasing', () => {
      const ranges = layouts.map((positions) => {
        const xs = [...positions.values()].map((p) => p.x);
        return { min: Math.min(...xs), max: Math.max(...xs) };
      });
      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].min).toBeGreaterThan(ranges[i - 1].max);
      }
    });
  });
});
