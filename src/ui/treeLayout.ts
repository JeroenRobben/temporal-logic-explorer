import { TreeNode } from '../core/unfold';

export interface TreePos { x: number; y: number }

export const X_SLOT = 70;
export const Y_STEP = 90;
const X_MARGIN = 60;
const Y_MARGIN = 48;

/** Deterministic tidy layout: leaves take sequential x-slots starting at
 *  startSlot; parents center over their first and last child; y = depth step.
 *  Returns positions keyed by TreeNode.key plus the number of slots consumed
 *  (so a forest can lay trees side by side). */
export function layoutTree(root: TreeNode, startSlot = 0): { positions: Map<string, TreePos>; slots: number } {
  const positions = new Map<string, TreePos>();
  let nextSlot = startSlot;

  function assign(n: TreeNode): number {
    const y = Y_MARGIN + n.depth * Y_STEP;
    if (n.children.length === 0) {
      const x = X_MARGIN + nextSlot * X_SLOT;
      nextSlot++;
      positions.set(n.key, { x, y });
      return x;
    }
    const xs = n.children.map(assign);
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    positions.set(n.key, { x, y });
    return x;
  }

  assign(root);
  return { positions, slots: nextSlot - startSlot };
}
