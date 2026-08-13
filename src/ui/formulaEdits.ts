import { CTLNode, parseCTL, pretty as prettyCTL } from '../core/ctl-parser';
import { LTLNode, parseLTL, pretty as prettyLTL } from '../core/ltl-parser';
import { StarNode, parseCTLStar, pretty as prettyStar } from '../core/ctlstar-parser';
import { Logic } from './types';

type AnyNode = CTLNode | LTLNode | StarNode;

const SWAP: Record<string, string> = {
  AG: 'EG', EG: 'AG', AF: 'EF', EF: 'AF', AX: 'EX', EX: 'AX', AU: 'EU', EU: 'AU',
  A: 'E', E: 'A',
};

function parseOf(logic: Logic, text: string): AnyNode {
  return logic === 'ctl' ? parseCTL(text) : logic === 'ltl' ? parseLTL(text) : parseCTLStar(text);
}
function prettyOf(logic: Logic, node: AnyNode): string {
  return logic === 'ctl'
    ? prettyCTL(node as CTLNode)
    : logic === 'ltl'
      ? prettyLTL(node as LTLNode)
      : prettyStar(node as StarNode);
}

/** Structurally clone `root`, applying `edit` to the node with `targetId`.
 *  Returns [newRoot, found]. */
function mapNode(root: AnyNode, targetId: number, edit: (n: AnyNode) => AnyNode): [AnyNode, boolean] {
  let found = false;
  function go(n: AnyNode): AnyNode {
    if (n.id === targetId) {
      found = true;
      return edit(n);
    }
    if ('child' in n) return { ...n, child: go(n.child as AnyNode) } as AnyNode;
    if ('left' in n) {
      return { ...n, left: go(n.left as AnyNode), right: go(n.right as AnyNode) } as AnyNode;
    }
    return n;
  }
  const out = go(root);
  return [out, found];
}

/** Wrap the identified subformula in a unary operator ('not', a temporal, or a
 *  quantifier legal for the logic) and re-emit the whole formula. Null when the
 *  node isn't found or the result would be invalid (e.g. CTL* path-level root). */
export function wrapNode(logic: Logic, text: string, nodeId: number, wrapper: string): string | null {
  try {
    const ast = parseOf(logic, text);
    const [wrapped, found] = mapNode(ast, nodeId, (n) => ({
      id: -1, kind: wrapper, child: n,
    } as unknown as AnyNode));
    if (!found) return null;
    const out = prettyOf(logic, wrapped);
    parseOf(logic, out); // validation: CTL* path-level roots throw here
    return out;
  } catch {
    return null;
  }
}

/** Swap A↔E on a quantified node (CTL operator pairs; CTL* A/E). Null for LTL,
 *  non-quantified nodes, or invalid results. */
export function swapQuantifier(logic: Logic, text: string, nodeId: number): string | null {
  if (logic === 'ltl') return null;
  try {
    const ast = parseOf(logic, text);
    let applicable = false;
    const [swapped, found] = mapNode(ast, nodeId, (n) => {
      const to = SWAP[n.kind];
      if (!to) return n;
      applicable = true;
      return { ...n, kind: to } as AnyNode;
    });
    if (!found || !applicable) return null;
    const out = prettyOf(logic, swapped);
    parseOf(logic, out);
    return out;
  } catch {
    return null;
  }
}
