import { CTLNode } from '../core/ctl-parser';
import { LTLNode } from '../core/ltl-parser';
import { StarNode } from '../core/ctlstar-parser';
import { Logic } from './types';

type AnyNode = CTLNode | LTLNode | StarNode;

const MAX_DEPTH = 3;

/** Bounded-depth English paraphrase of a formula. Depth counts operator
 *  nesting; structure below MAX_DEPTH renders as an ellipsis. */
export function glossify(node: AnyNode, logic: Logic): string {
  void logic; // kinds are disjoint enough that the node shape determines the phrase
  return go(node as AnyNode, 0);
}

function go(n: AnyNode, depth: number): string {
  if (depth >= MAX_DEPTH && n.kind !== 'prop' && n.kind !== 'true' && n.kind !== 'false') {
    return '…';
  }
  const d = depth + 1;
  switch (n.kind) {
    case 'true': return 'true';
    case 'false': return 'false';
    case 'prop': return n.name;
    case 'not': return `not ${go(n.child, d)}`;
    case 'and': return `${go(n.left, d)} and ${go(n.right, d)}`;
    case 'or': return `${go(n.left, d)} or ${go(n.right, d)}`;
    case 'implies': return `if ${go(n.left, d)} then ${go(n.right, d)}`;
    case 'iff': return `${go(n.left, d)} exactly when ${go(n.right, d)}`;
    // CTL
    case 'AG': return `on every path, at every step, ${go(n.child, d)}`;
    case 'EG': return `on some path, at every step, ${go(n.child, d)}`;
    case 'AF': return `on every path, eventually ${go(n.child, d)}`;
    case 'EF': return `on some path, eventually ${go(n.child, d)}`;
    case 'AX': return `in every next state, ${go(n.child, d)}`;
    case 'EX': return `in some next state, ${go(n.child, d)}`;
    case 'AU': return `on every path, ${go(n.left, d)} until ${go(n.right, d)}`;
    case 'EU': return `on some path, ${go(n.left, d)} until ${go(n.right, d)}`;
    // LTL / CTL* path operators
    case 'G': return `at every step, ${go(n.child, d)}`;
    case 'F': return `eventually ${go(n.child, d)}`;
    case 'X': return `in the next step, ${go(n.child, d)}`;
    case 'U': return `${go(n.left, d)} until ${go(n.right, d)}`;
    // CTL* quantifiers
    case 'A': return `on every path, ${go(n.child, d)}`;
    case 'E': return `on some path, ${go(n.child, d)}`;
  }
}
