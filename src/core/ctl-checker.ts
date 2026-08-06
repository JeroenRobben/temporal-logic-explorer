import { KripkeStructure, successors, deadlockStates } from './kripke';
import { CTLNode } from './ctl-parser';

export interface NodeResult {
  sat: Set<string>;
  /** For fixpoint operators: successive approximations, first to last (= sat).
   *  For all other nodes: a single entry equal to sat. */
  iterations: Set<string>[];
}

export interface EvaluationRecord {
  results: Map<number, NodeResult>;
  /** true/false over initial states; null when there are no initial states. */
  verdict: boolean | null;
  deadlocks: string[];
}

export function checkCTL(k: KripkeStructure, root: CTLNode): EvaluationRecord {
  const ids = k.states.map((s) => s.id);
  const succ = new Map(ids.map((id) => [id, successors(k, id)]));
  // pre∃(Z): states with SOME successor in Z. pre∀(Z): states with ALL
  // successors in Z — vacuously true for deadlock states (empty successor set).
  const preE = (Z: Set<string>) => new Set(ids.filter((s) => succ.get(s)!.some((t) => Z.has(t))));
  const preA = (Z: Set<string>) => new Set(ids.filter((s) => succ.get(s)!.every((t) => Z.has(t))));

  const eq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const union = (a: Set<string>, b: Set<string>) => new Set([...a, ...b]);
  const inter = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => b.has(x)));
  const compl = (a: Set<string>) => new Set(ids.filter((x) => !a.has(x)));

  const results = new Map<number, NodeResult>();
  const single = (s: Set<string>): NodeResult => ({ sat: s, iterations: [s] });

  function fixpoint(start: Set<string>, step: (Z: Set<string>) => Set<string>): NodeResult {
    const iterations = [start];
    let Z = start;
    for (;;) {
      const next = step(Z);
      if (eq(next, Z)) break;
      iterations.push(next);
      Z = next;
    }
    return { sat: Z, iterations };
  }

  function ev(n: CTLNode): Set<string> {
    let r: NodeResult;
    switch (n.kind) {
      case 'true': r = single(new Set(ids)); break;
      case 'false': r = single(new Set()); break;
      case 'prop':
        r = single(new Set(k.states.filter((s) => s.propositions.includes(n.name)).map((s) => s.id)));
        break;
      case 'not': r = single(compl(ev(n.child))); break;
      case 'and': r = single(inter(ev(n.left), ev(n.right))); break;
      case 'or': r = single(union(ev(n.left), ev(n.right))); break;
      case 'implies': r = single(union(compl(ev(n.left)), ev(n.right))); break;
      case 'iff': {
        const l = ev(n.left), rr = ev(n.right);
        r = single(union(inter(l, rr), inter(compl(l), compl(rr))));
        break;
      }
      case 'EX': r = single(preE(ev(n.child))); break;
      case 'AX': r = single(preA(ev(n.child))); break;
      case 'EF': { const c = ev(n.child); r = fixpoint(c, (Z) => union(Z, preE(Z))); break; }
      case 'AF': { const c = ev(n.child); r = fixpoint(c, (Z) => union(Z, preA(Z))); break; }
      case 'EG': { const c = ev(n.child); r = fixpoint(c, (Z) => inter(c, preE(Z))); break; }
      case 'AG': { const c = ev(n.child); r = fixpoint(c, (Z) => inter(c, preA(Z))); break; }
      case 'EU': {
        const l = ev(n.left), rr = ev(n.right);
        r = fixpoint(rr, (Z) => union(Z, inter(l, preE(Z))));
        break;
      }
      case 'AU': {
        const l = ev(n.left), rr = ev(n.right);
        r = fixpoint(rr, (Z) => union(Z, inter(l, preA(Z))));
        break;
      }
    }
    results.set(n.id, r);
    return r.sat;
  }

  const rootSat = ev(root);
  const initial = k.states.filter((s) => s.isInitial);
  const verdict = initial.length === 0 ? null : initial.every((s) => rootSat.has(s.id));
  return { results, verdict, deadlocks: deadlockStates(k) };
}
