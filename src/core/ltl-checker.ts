import { KripkeStructure } from './kripke';
import { LTLNode } from './ltl-parser';
import { Lasso, nextPosition, propsAt } from './trace';

/**
 * Evaluate an LTL formula on a lasso trace.
 * Returns, per subformula node id, the truth value at every trace position.
 *
 * F/G/U are computed by two backward sweeps: values are monotone in their
 * future value, and on a lasso two sweeps suffice for the loop to stabilize
 * (the first sweep may read a not-yet-final wrap-around value; the second
 * sweep sees the corrected one).
 */
export function checkLTL(k: KripkeStructure, lasso: Lasso, root: LTLNode): Map<number, boolean[]> {
  const n = lasso.stateIds.length;
  const results = new Map<number, boolean[]>();

  function backwardFix(init: boolean, step: (i: number, nextVal: boolean) => boolean): boolean[] {
    const row = new Array<boolean>(n).fill(init);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        row[i] = step(i, row[nextPosition(lasso, i)]);
      }
    }
    return row;
  }

  function ev(node: LTLNode): boolean[] {
    let row: boolean[];
    switch (node.kind) {
      case 'true': row = new Array<boolean>(n).fill(true); break;
      case 'false': row = new Array<boolean>(n).fill(false); break;
      case 'prop':
        row = Array.from({ length: n }, (_, i) => propsAt(k, lasso, i).includes(node.name));
        break;
      case 'not': { const c = ev(node.child); row = c.map((v) => !v); break; }
      case 'and': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => v && r[i]); break; }
      case 'or': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => v || r[i]); break; }
      case 'implies': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => !v || r[i]); break; }
      case 'iff': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => v === r[i]); break; }
      case 'X': {
        const c = ev(node.child);
        row = Array.from({ length: n }, (_, i) => c[nextPosition(lasso, i)]);
        break;
      }
      case 'F': { const c = ev(node.child); row = backwardFix(false, (i, nx) => c[i] || nx); break; }
      case 'G': { const c = ev(node.child); row = backwardFix(true, (i, nx) => c[i] && nx); break; }
      case 'U': {
        const l = ev(node.left), r = ev(node.right);
        row = backwardFix(false, (i, nx) => r[i] || (l[i] && nx));
        break;
      }
    }
    results.set(node.id, row);
    return row;
  }

  ev(root);
  return results;
}
