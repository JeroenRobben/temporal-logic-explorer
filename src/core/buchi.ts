import { LTLNode } from './ltl-parser';

export interface Literal { prop: string; negated: boolean }

export interface BuchiState {
  id: number;
  name: string;
  /** Pretty-printed obligation set — what must hold from this state on. */
  obligations: string[];
  /** Literal obligations, checked against the model state being read on entry. */
  entryGuard: Literal[];
  accepting: boolean;
  initial: boolean;
}

export interface BuchiTransition { from: number; to: number; guard: Literal[] }

export interface BuchiAutomaton {
  states: BuchiState[];
  transitions: BuchiTransition[];
}

export class AutomatonTooLarge extends Error {
  constructor(max: number) {
    super(`automaton exceeds ${max} states`);
    this.name = 'AutomatonTooLarge';
  }
}

// ---------- Negation-normal form (adds Release, internal-only) ----------

export type NNF =
  | { kind: 'true' } | { kind: 'false' }
  | { kind: 'lit'; prop: string; negated: boolean }
  | { kind: 'and' | 'or' | 'U' | 'R'; left: NNF; right: NNF }
  | { kind: 'X'; child: NNF };

export function toNNF(n: LTLNode, neg = false): NNF {
  switch (n.kind) {
    case 'true': return { kind: neg ? 'false' : 'true' };
    case 'false': return { kind: neg ? 'true' : 'false' };
    case 'prop': return { kind: 'lit', prop: n.name, negated: neg };
    case 'not': return toNNF(n.child, !neg);
    case 'and': return { kind: neg ? 'or' : 'and', left: toNNF(n.left, neg), right: toNNF(n.right, neg) };
    case 'or': return { kind: neg ? 'and' : 'or', left: toNNF(n.left, neg), right: toNNF(n.right, neg) };
    case 'implies':
      return { kind: neg ? 'and' : 'or', left: toNNF(n.left, !neg), right: toNNF(n.right, neg) };
    case 'iff': {
      // l↔r ≡ (l∧r)∨(¬l∧¬r); ¬(l↔r) ≡ (l∧¬r)∨(¬l∧r)
      return {
        kind: 'or',
        left: { kind: 'and', left: toNNF(n.left, false), right: toNNF(n.right, neg) },
        right: { kind: 'and', left: toNNF(n.left, true), right: toNNF(n.right, !neg) },
      };
    }
    case 'X': return { kind: 'X', child: toNNF(n.child, neg) };
    case 'F': return neg
      ? { kind: 'R', left: { kind: 'false' }, right: toNNF(n.child, true) }
      : { kind: 'U', left: { kind: 'true' }, right: toNNF(n.child, false) };
    case 'G': return neg
      ? { kind: 'U', left: { kind: 'true' }, right: toNNF(n.child, true) }
      : { kind: 'R', left: { kind: 'false' }, right: toNNF(n.child, false) };
    case 'U': return {
      kind: neg ? 'R' : 'U',
      left: toNNF(n.left, neg),
      right: toNNF(n.right, neg),
    };
  }
}

export function nnfKey(n: NNF): string {
  switch (n.kind) {
    case 'true': return '⊤';
    case 'false': return '⊥';
    case 'lit': return n.negated ? `¬${n.prop}` : n.prop;
    case 'X': return `X(${nnfKey(n.child)})`;
    default: return `${n.kind}(${nnfKey(n.left)},${nnfKey(n.right)})`;
  }
}

export function prettyNNF(n: NNF): string {
  switch (n.kind) {
    case 'true': return 'true';
    case 'false': return 'false';
    case 'lit': return n.negated ? `¬${n.prop}` : n.prop;
    case 'X': return `X ${prettyNNF(n.child)}`;
    case 'and': return `(${prettyNNF(n.left)} ∧ ${prettyNNF(n.right)})`;
    case 'or': return `(${prettyNNF(n.left)} ∨ ${prettyNNF(n.right)})`;
    case 'U': return `(${prettyNNF(n.left)} U ${prettyNNF(n.right)})`;
    case 'R': return `(${prettyNNF(n.left)} R ${prettyNNF(n.right)})`;
  }
}

// ---------- GPVW tableau ----------

type Incoming = number | 'init';

interface TNode {
  name: number;
  incoming: Set<Incoming>;
  newSet: Map<string, NNF>;
  now: Map<string, NNF>;
  next: Map<string, NNF>;
}

function mapEq(a: Map<string, NNF>, b: Map<string, NNF>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a.keys()) if (!b.has(k)) return false;
  return true;
}

/**
 * GPVW (Gerth–Peled–Vardi–Wolper) on-the-fly tableau construction, followed by
 * degeneralization of the generalized-Büchi acceptance (one set per
 * U-subformula) into plain Büchi via the standard counter construction.
 *
 * Convention: a state's literal obligations form its entry guard, checked
 * against the model state being read; the automaton reads L(s0) L(s1) ….
 */
export function ltlToBuchi(root: LTLNode, maxStates = 500): BuchiAutomaton {
  const phi = toNNF(root);
  const done: TNode[] = [];
  let counter = 0;
  const newName = () => counter++;

  function addNew(node: TNode, f: NNF): void {
    const k = nnfKey(f);
    if (!node.now.has(k) && !node.newSet.has(k)) node.newSet.set(k, f);
  }

  function cloneNode(node: TNode): TNode {
    return {
      name: newName(),
      incoming: new Set(node.incoming),
      newSet: new Map(node.newSet),
      now: new Map(node.now),
      next: new Map(node.next),
    };
  }

  function expand(node: TNode): void {
    if (node.newSet.size === 0) {
      const existing = done.find((q) => mapEq(q.now, node.now) && mapEq(q.next, node.next));
      if (existing) {
        for (const inc of node.incoming) existing.incoming.add(inc);
        return;
      }
      if (done.length >= maxStates) throw new AutomatonTooLarge(maxStates);
      done.push(node);
      expand({
        name: newName(),
        incoming: new Set<Incoming>([node.name]),
        newSet: new Map(node.next),
        now: new Map(),
        next: new Map(),
      });
      return;
    }
    const [key, eta] = node.newSet.entries().next().value as [string, NNF];
    node.newSet.delete(key);
    switch (eta.kind) {
      case 'false':
        return; // contradiction — node dies
      case 'true':
        expand(node);
        return;
      case 'lit': {
        const negKey = eta.negated ? eta.prop : `¬${eta.prop}`;
        if (node.now.has(negKey)) return; // p ∧ ¬p — node dies
        node.now.set(key, eta);
        expand(node);
        return;
      }
      case 'and':
        node.now.set(key, eta);
        addNew(node, eta.left);
        addNew(node, eta.right);
        expand(node);
        return;
      case 'X':
        node.now.set(key, eta);
        node.next.set(nnfKey(eta.child), eta.child);
        expand(node);
        return;
      case 'or': {
        node.now.set(key, eta);
        const n1 = cloneNode(node);
        addNew(n1, eta.left);
        const n2 = cloneNode(node);
        addNew(n2, eta.right);
        expand(n1);
        expand(n2);
        return;
      }
      case 'U': {
        // φ U ψ ≡ ψ ∨ (φ ∧ X(φ U ψ))
        node.now.set(key, eta);
        const n1 = cloneNode(node);
        addNew(n1, eta.left);
        n1.next.set(key, eta);
        const n2 = cloneNode(node);
        addNew(n2, eta.right);
        expand(n1);
        expand(n2);
        return;
      }
      case 'R': {
        // φ R ψ ≡ (ψ ∧ φ) ∨ (ψ ∧ X(φ R ψ))
        node.now.set(key, eta);
        const n1 = cloneNode(node);
        addNew(n1, eta.right);
        n1.next.set(key, eta);
        const n2 = cloneNode(node);
        addNew(n2, eta.left);
        addNew(n2, eta.right);
        expand(n1);
        expand(n2);
        return;
      }
    }
  }

  expand({
    name: newName(),
    incoming: new Set<Incoming>(['init']),
    newSet: new Map([[nnfKey(phi), phi]]),
    now: new Map(),
    next: new Map(),
  });

  // ---------- acceptance: one GBA set per U-subformula ----------
  const uList: { key: string; rightKey: string }[] = [];
  const seenU = new Set<string>();
  (function walk(n: NNF) {
    if (n.kind === 'U') {
      const k = nnfKey(n);
      if (!seenU.has(k)) { seenU.add(k); uList.push({ key: k, rightKey: nnfKey(n.right) }); }
    }
    if ('child' in n) walk(n.child);
    if ('left' in n) { walk(n.left); walk(n.right); }
  })(phi);

  const idxOf = new Map(done.map((n, i) => [n.name, i]));
  const litsOf = (n: TNode): Literal[] =>
    [...n.now.values()]
      .filter((f): f is Extract<NNF, { kind: 'lit' }> => f.kind === 'lit')
      .map((f) => ({ prop: f.prop, negated: f.negated }));
  const obligationsOf = (n: TNode): string[] => [...n.now.values()].map(prettyNNF);
  const inF = (n: TNode, u: { key: string; rightKey: string }): boolean =>
    !n.now.has(u.key) || n.now.has(u.rightKey);

  const k = uList.length;
  const states: BuchiState[] = [];
  const transitions: BuchiTransition[] = [];

  if (k === 0) {
    done.forEach((n, idx) => states.push({
      id: idx, name: `q${idx}`, obligations: obligationsOf(n), entryGuard: litsOf(n),
      accepting: true, initial: n.incoming.has('init'),
    }));
    for (const q of done) {
      for (const inc of q.incoming) {
        if (inc === 'init') continue;
        transitions.push({ from: idxOf.get(inc)!, to: idxOf.get(q.name)!, guard: litsOf(q) });
      }
    }
  } else {
    // Degeneralization: states (q, i); counter advances past F_i when the SOURCE
    // state is in F_i; accepting = (q, 0) with q ∈ F_0.
    if (done.length * k > maxStates) throw new AutomatonTooLarge(maxStates);
    done.forEach((n, idx) => {
      for (let i = 0; i < k; i++) {
        states.push({
          id: idx * k + i,
          name: k === 1 ? `q${idx}` : `q${idx}·${i}`,
          obligations: obligationsOf(n),
          entryGuard: litsOf(n),
          accepting: i === 0 && inF(n, uList[0]),
          initial: i === 0 && n.incoming.has('init'),
        });
      }
    });
    for (const q of done) {
      for (const inc of q.incoming) {
        if (inc === 'init') continue;
        const srcIdx = idxOf.get(inc)!;
        const src = done[srcIdx];
        const dstIdx = idxOf.get(q.name)!;
        for (let i = 0; i < k; i++) {
          const j = inF(src, uList[i]) ? (i + 1) % k : i;
          transitions.push({ from: srcIdx * k + i, to: dstIdx * k + j, guard: litsOf(q) });
        }
      }
    }
  }

  return { states, transitions };
}
