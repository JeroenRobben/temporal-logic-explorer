import { ProductGraph } from './product';

export interface ProductLasso { path: string[]; loopIndex: number }

/**
 * Büchi emptiness on the product: the language is non-empty iff some SCC
 * reachable from an initial state contains an accepting state and a cycle
 * (size > 1, or a single state with a self-loop). Returns a concrete
 * accepting lasso (stem + cycle) or null when the language is empty.
 */
export function findAcceptingLasso(g: ProductGraph): ProductLasso | null {
  if (g.states.length === 0) return null;
  const succ = new Map<string, string[]>(g.states.map((s) => [s.id, []]));
  for (const e of g.edges) succ.get(e.from)?.push(e.to);
  const accepting = new Set(g.states.filter((s) => s.accepting).map((s) => s.id));
  const initials = g.states.filter((s) => s.initial).map((s) => s.id);
  if (initials.length === 0) return null;

  // Tarjan SCC (iterative; explicit stack — recursion overflows the JS stack
  // on deep products, so DFS state lives in `work` instead of the call stack)
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccOf = new Map<string, number>();
  let nextIndex = 0;
  let nextScc = 0;

  for (const root of initials) {
    if (index.has(root)) continue;
    const work: { v: string; i: number }[] = [{ v: root, i: 0 }];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const v = frame.v;
      if (frame.i === 0) {
        index.set(v, nextIndex);
        low.set(v, nextIndex);
        nextIndex++;
        stack.push(v);
        onStack.add(v);
      }
      const neighbors = succ.get(v) ?? [];
      let recursed = false;
      while (frame.i < neighbors.length) {
        const w = neighbors[frame.i++];
        if (!index.has(w)) {
          work.push({ v: w, i: 0 });
          recursed = true;
          break;
        }
        if (onStack.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
      if (recursed) continue;
      if (low.get(v) === index.get(v)) {
        const id = nextScc++;
        for (;;) {
          const w = stack.pop()!;
          onStack.delete(w);
          sccOf.set(w, id);
          if (w === v) break;
        }
      }
      work.pop();
      // propagate lowlink to parent (equivalent to the recursive call's
      // low.set(v, Math.min(low.get(v)!, low.get(w)!)) after it returns)
      if (work.length > 0) {
        const parent = work[work.length - 1];
        low.set(parent.v, Math.min(low.get(parent.v)!, low.get(v)!));
      }
    }
  }

  // (Only states reachable from initials got visited — unreached states have no scc.)
  const members = new Map<number, string[]>();
  for (const [v, id] of sccOf) {
    const arr = members.get(id) ?? [];
    arr.push(v);
    members.set(id, arr);
  }

  let target: string | null = null;
  outer:
  for (const [id, mem] of members) {
    const hasCycle = mem.length > 1
      || (succ.get(mem[0]) ?? []).includes(mem[0]);
    if (!hasCycle) continue;
    for (const v of mem) {
      if (accepting.has(v)) { target = v; void id; break outer; }
    }
  }
  if (target === null) return null;

  // Stem: BFS from initials to target
  const stem = bfsPath(succ, initials, target)!;
  // Cycle: shortest non-empty path target → target within its SCC
  const sccId = sccOf.get(target)!;
  const inScc = (v: string) => sccOf.get(v) === sccId;
  const cycleStarts = (succ.get(target) ?? []).filter(inScc);
  let cycle: string[] | null = null;
  if (cycleStarts.includes(target)) {
    cycle = [target]; // self-loop
  } else {
    for (const start of cycleStarts) {
      const p = bfsPath(
        new Map([...succ].map(([k, vs]) => [k, vs.filter(inScc)])),
        [start], target,
      );
      if (p) { cycle = p; break; }
    }
  }
  if (!cycle) return null; // defensive; unreachable given SCC properties

  // Lasso: stem ends at target (loop entry); append cycle minus its final target
  return { path: [...stem, ...cycle.slice(0, -1)], loopIndex: stem.length - 1 };
}

function bfsPath(succ: Map<string, string[]>, from: string[], to: string): string[] | null {
  const prev = new Map<string, string>();
  const visited = new Set(from);
  const queue = [...from];
  if (from.includes(to)) return [to];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of succ.get(cur) ?? []) {
      if (visited.has(n)) continue;
      visited.add(n);
      prev.set(n, cur);
      if (n === to) {
        const path = [n];
        let b: string | undefined = cur;
        while (b !== undefined) { path.unshift(b); b = prev.get(b); }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}
