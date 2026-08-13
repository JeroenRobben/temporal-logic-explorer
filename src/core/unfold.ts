import { KripkeStructure, successors } from './kripke';

export interface TreeNode {
  /** Path key: root "0", children "0.0", "0.1", … — unique within one unfolding. */
  key: string;
  stateId: string;
  depth: number;
  /** True when stateId already occurred on this node's root-path (the branch
   *  has entered a cycle — where the infinite regress lives). */
  revisit: boolean;
  children: TreeNode[];
}

/** Bounded unfolding of the model from rootStateId. Children are generated in
 *  the model's transition order (deterministic); nodes at maxDepth get none. */
export function unfoldTree(model: KripkeStructure, rootStateId: string, maxDepth: number): TreeNode {
  function build(stateId: string, key: string, depth: number, onPath: Set<string>): TreeNode {
    const node: TreeNode = {
      key, stateId, depth,
      revisit: onPath.has(stateId),
      children: [],
    };
    if (depth < maxDepth) {
      const nextPath = new Set(onPath);
      nextPath.add(stateId);
      successors(model, stateId).forEach((succ, i) => {
        node.children.push(build(succ, `${key}.${i}`, depth + 1, nextPath));
      });
    }
    return node;
  }
  return build(rootStateId, '0', 0, new Set());
}

export function countNodes(root: TreeNode): number {
  return 1 + root.children.reduce((acc, c) => acc + countNodes(c), 0);
}

/** Count the unfolding's nodes across all roots, stopping early once the
 *  count exceeds cap (returns cap + 1 in that case). */
export function countUnfoldBounded(
  model: KripkeStructure, rootStateIds: string[], maxDepth: number, cap: number,
): number {
  let count = 0;
  function walk(stateId: string, depth: number): boolean {
    count++;
    if (count > cap) return false;
    if (depth < maxDepth) {
      for (const succ of successors(model, stateId)) {
        if (!walk(succ, depth + 1)) return false;
      }
    }
    return true;
  }
  for (const r of rootStateIds) {
    if (!walk(r, 0)) return count;
  }
  return count;
}
