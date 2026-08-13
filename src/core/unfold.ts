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
