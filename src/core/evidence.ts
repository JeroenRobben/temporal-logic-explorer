import { KripkeStructure, successors } from './kripke';
import { CTLNode } from './ctl-parser';
import { EvaluationRecord } from './ctl-checker';

export interface Evidence {
  /** State ids along the path. For lassos, the last entry repeats path[loopIndex]. */
  path: string[];
  loopIndex?: number;
  kind: 'witness' | 'counterexample';
}

type Succ = Map<string, string[]>;

function bfs(succ: Succ, from: string, targets: Set<string>, allowed?: Set<string>): string[] | null {
  if (targets.has(from)) return [from];
  const prev = new Map<string, string>();
  const visited = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const t of succ.get(cur) ?? []) {
      if (visited.has(t)) continue;
      visited.add(t);
      prev.set(t, cur);
      if (targets.has(t)) {
        const path = [t];
        let b: string | undefined = cur;
        while (b !== undefined) { path.unshift(b); b = prev.get(b); }
        return path;
      }
      if (!allowed || allowed.has(t)) queue.push(t);
    }
  }
  return null;
}

/** Walk inside `region` following any in-region successor until a state
 *  repeats (lasso) or a dead end is reached (finite maximal path). */
function walkRegion(succ: Succ, from: string, region: Set<string>): { path: string[]; loopIndex?: number } {
  const indexOf = new Map([[from, 0]]);
  const path = [from];
  let cur = from;
  for (;;) {
    const next = (succ.get(cur) ?? []).find((t) => region.has(t));
    if (next === undefined) return { path }; // dead end — finite maximal path
    if (indexOf.has(next)) return { path: [...path, next], loopIndex: indexOf.get(next)! };
    indexOf.set(next, path.length);
    path.push(next);
    cur = next;
  }
}

/**
 * Best-effort witness (formula holds at `from`) or counterexample (it fails).
 * Covers EF/AG/EG/AF/EU at the top level; returns null otherwise.
 */
export function findEvidence(
  k: KripkeStructure,
  record: EvaluationRecord,
  root: CTLNode,
  from: string,
): Evidence | null {
  const succ: Succ = new Map(k.states.map((s) => [s.id, successors(k, s.id)]));
  const all = k.states.map((s) => s.id);
  // record comes from checkCTL(k, root), which populates results for every node of root — the assertion is safe.
  const satOf = (n: CTLNode) => record.results.get(n.id)!.sat;
  const compl = (S: Set<string>) => new Set(all.filter((x) => !S.has(x)));
  const holds = satOf(root).has(from);

  switch (root.kind) {
    case 'EF': {
      if (!holds) return null;
      const p = bfs(succ, from, satOf(root.child));
      return p && { path: p, kind: 'witness' };
    }
    case 'AG': {
      if (holds) return null;
      const p = bfs(succ, from, compl(satOf(root.child)));
      return p && { path: p, kind: 'counterexample' };
    }
    case 'EG': {
      if (!holds) return null;
      const w = walkRegion(succ, from, satOf(root));
      return { ...w, kind: 'witness' };
    }
    case 'AF': {
      // ¬AF φ region: under maximal-path semantics this region can contain
      // deadlocks (AF now requires a successor to hold, so deadlocks fail
      // AF vacuously and land in ¬AF's region); a finite path ending there
      // IS the counterexample.
      if (holds) return null;
      const w = walkRegion(succ, from, compl(satOf(root)));
      return { ...w, kind: 'counterexample' };
    }
    case 'EU': {
      if (!holds) return null;
      const allowed = new Set([...satOf(root.left), ...satOf(root.right)]);
      const p = bfs(succ, from, satOf(root.right), allowed);
      return p && { path: p, kind: 'witness' };
    }
    default:
      return null;
  }
}
