import { describe, it, expect } from 'vitest';
import { KripkeStructure } from '../core/kripke';
import { parseLTL, LTLNode } from '../core/ltl-parser';
import { Lasso } from '../core/trace';
import { checkLTL } from '../core/ltl-checker';
import { postOrder, witnessFor } from './Timeline';

describe('postOrder', () => {
  it('visits children before parent, left before right', () => {
    const root = parseLTL('!(p & q)');
    const order = postOrder(root);
    // parser assigns ids bottom-up: p=0, q=1, and=2, not=3
    expect(order.map((n) => n.id)).toEqual([0, 1, 2, 3]);
    expect(order.map((n) => n.kind)).toEqual(['prop', 'prop', 'and', 'not']);
    expect(order[order.length - 1]).toBe(root);
  });
});

// r holds only at 'b' (the loop entry): a -> b -> c -> b (loop back to index 1)
const k: KripkeStructure = {
  states: [
    { id: 'a', name: 'a', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 'b', name: 'b', propositions: ['r'], isInitial: false, x: 0, y: 0 },
    { id: 'c', name: 'c', propositions: [], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'b' },
  ],
};

const lasso: Lasso = { stateIds: ['a', 'b', 'c'], loopIndex: 1 };

function findKind(root: LTLNode, kind: string): LTLNode {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.kind === kind) return n;
    if ('child' in n) stack.push(n.child);
    if ('left' in n) { stack.push(n.left); stack.push(n.right); }
  }
  throw new Error(`no ${kind} node found`);
}

describe('witnessFor', () => {
  it('F r at position 2 wraps around the loop to the witness at position 1', () => {
    const root = parseLTL('F r');
    const rows = checkLTL(k, lasso, root);
    expect(witnessFor(root, rows, lasso, 2)).toBe(1);
  });

  it('X at the last position points at loopIndex', () => {
    const root = parseLTL('X r');
    const rows = checkLTL(k, lasso, root);
    expect(witnessFor(root, rows, lasso, 2)).toBe(lasso.loopIndex);
  });

  it('U returns null when the left side fails before the right holds', () => {
    const root = parseLTL('p U r');
    const rows = checkLTL(k, lasso, root);
    const uNode = findKind(root, 'U');
    // at position 2 (c): p is false and r is false -> immediate failure
    expect(witnessFor(uNode, rows, lasso, 2)).toBeNull();
  });

  it('U witnesses the position where the right side first holds', () => {
    const root = parseLTL('p U r');
    const rows = checkLTL(k, lasso, root);
    const uNode = findKind(root, 'U');
    // at position 0 (a): p holds, r doesn't yet; r first holds at position 1 (b)
    expect(witnessFor(uNode, rows, lasso, 0)).toBe(1);
  });
});
