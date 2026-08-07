# Full LTL via Büchi Automata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All-paths LTL verdicts via negate → GPVW tableau → Büchi automaton → product → SCC emptiness, with visible Automaton/Product canvas tabs and counterexamples loading as traces.

**Architecture:** Four new pure core modules (`buchi` NNF+tableau+degeneralization, `product`, `emptiness` Tarjan, `ltl-allpaths` composition); UI adds `∀` verdict marks, an inspector all-paths section with "load counterexample as trace", a read-only `GraphView` component, and Model|Automaton|Product tabs on the center pane.

**Tech Stack:** Existing React 18 + TS + Vite + Vitest. No new dependencies. Tests run ONLY via `npm test` (the script sets required NODE_OPTIONS).

**Spec:** `docs/superpowers/specs/2026-08-07-buchi-allpaths-design.md`
**Baseline:** branch `feature/buchi-allpaths`, 105 tests passing.

---

## File map

```
src/core/buchi.ts           — NEW: NNF, GPVW tableau, degeneralization → BuchiAutomaton
src/core/buchi.test.ts      — NEW
src/core/product.ts         — NEW: model × automaton product graph
src/core/product.test.ts    — NEW
src/core/emptiness.ts       — NEW: Tarjan SCC accepting-lasso search
src/core/emptiness.test.ts  — NEW
src/core/ltl-allpaths.ts    — NEW: checkLTLAllPaths composition
src/core/ltl-allpaths.test.ts — NEW (cross-checker battery)
src/ui/types.ts             — MODIFY: Analysis.allPaths
src/ui/App.tsx              — MODIFY: allPaths in analyses, viewTab, loadCounterexample, hover detail
src/ui/FormulaPanel.tsx     — MODIFY: ∀ marks
src/ui/Inspector.tsx        — MODIFY: all-paths section + hover-detail section
src/ui/GraphView.tsx        — NEW: read-only automaton/product renderer
src/ui/Canvas.tsx           — MODIFY: loosen edgePath param type (structural, no behavior change)
src/styles.css              — MODIFY: view-tabs, graph styles
src/ui/App.test.tsx         — MODIFY: integration tests
README.md                   — MODIFY
```

---

### Task 1: Büchi translation (NNF + GPVW tableau + degeneralization)

**Files:**
- Create: `src/core/buchi.ts`
- Test: `src/core/buchi.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/buchi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLTL } from './ltl-parser';
import { toNNF, nnfKey, ltlToBuchi, AutomatonTooLarge, BuchiAutomaton } from './buchi';

const nnf = (s: string) => nnfKey(toNNF(parseLTL(s)));

describe('toNNF', () => {
  it('pushes negation to literals via dualities', () => {
    expect(nnf('!(p U q)')).toBe('R(¬p,¬q)');
    expect(nnf('!G p')).toBe('U(⊤,¬p)');
    expect(nnf('!F p')).toBe('R(⊥,¬p)');
    expect(nnf('!X p')).toBe('X(¬p)');
    expect(nnf('!!p')).toBe('p');
    expect(nnf('!(p & q)')).toBe('or(¬p,¬q)');
  });
  it('normalizes F and G', () => {
    expect(nnf('F p')).toBe('U(⊤,p)');
    expect(nnf('G p')).toBe('R(⊥,p)');
    expect(nnf('G F p')).toBe('R(⊥,U(⊤,p))');
  });
  it('eliminates implies and iff', () => {
    expect(nnf('p -> q')).toBe('or(¬p,q)');
    expect(nnf('!(p -> q)')).toBe('and(p,¬q)');
    expect(nnf('p <-> q')).toBe('or(and(p,q),and(¬p,¬q))');
  });
});

function transitionsFrom(aut: BuchiAutomaton, id: number) {
  return aut.transitions.filter((t) => t.from === id);
}

describe('ltlToBuchi', () => {
  it('produces a small automaton for F p with an accepting sink', () => {
    const aut = ltlToBuchi(parseLTL('F p'));
    expect(aut.states.length).toBeGreaterThan(0);
    expect(aut.states.length).toBeLessThanOrEqual(6);
    expect(aut.states.some((q) => q.initial)).toBe(true);
    expect(aut.states.some((q) => q.accepting)).toBe(true);
    // some accepting state is reachable-looking: has a self-loop
    const acc = aut.states.filter((q) => q.accepting);
    expect(acc.some((q) => transitionsFrom(aut, q.id).some((t) => t.to === q.id))).toBe(true);
  });
  it('G p: some state requires p forever (guard [p], self-loop, accepting)', () => {
    const aut = ltlToBuchi(parseLTL('G p'));
    const q = aut.states.find((s) =>
      s.entryGuard.length === 1 && s.entryGuard[0].prop === 'p' && !s.entryGuard[0].negated
      && s.accepting && transitionsFrom(aut, s.id).some((t) => t.to === s.id));
    expect(q).toBeTruthy();
  });
  it('guards mention only the formula propositions', () => {
    const aut = ltlToBuchi(parseLTL('G (p -> F q)'));
    for (const t of aut.transitions) {
      for (const l of t.guard) expect(['p', 'q']).toContain(l.prop);
    }
  });
  it('true yields an all-accepting universal automaton', () => {
    const aut = ltlToBuchi(parseLTL('true'));
    expect(aut.states.length).toBeGreaterThan(0);
    expect(aut.states.every((q) => q.accepting)).toBe(true);
  });
  it('is deterministic across calls', () => {
    const a = ltlToBuchi(parseLTL('G F p'));
    const b = ltlToBuchi(parseLTL('G F p'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('throws AutomatonTooLarge when exceeding maxStates', () => {
    expect(() => ltlToBuchi(parseLTL('G F p'), 1)).toThrow(AutomatonTooLarge);
  });
  it('every state has readable metadata', () => {
    const aut = ltlToBuchi(parseLTL('G F p'));
    for (const q of aut.states) {
      expect(q.name).toMatch(/^q\d+(·\d+)?$/);
      expect(Array.isArray(q.obligations)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./buchi`. 105 existing pass.

- [ ] **Step 3: Implement**

`src/core/buchi.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (105 + 10 = 115). If a structural test fails (e.g. F p automaton larger than 6 states), STOP and report the actual automaton (dump states/transitions) rather than loosening the bound — the construction above is believed correct and small for these inputs; a mismatch means a transcription bug.

- [ ] **Step 5: Commit**

```bash
git add src/core/buchi.ts src/core/buchi.test.ts
git commit -m "feat: LTL to Büchi via GPVW tableau with degeneralization"
```

---

### Task 2: Product + emptiness

**Files:**
- Create: `src/core/product.ts`, `src/core/emptiness.ts`
- Test: `src/core/product.test.ts`, `src/core/emptiness.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/product.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { BuchiAutomaton } from './buchi';
import { buildProduct } from './product';

// Hand-built automaton for F p: q0 (initial) --true--> q0, --p--> q1; q1 (accepting) --true--> q1
const fpAut: BuchiAutomaton = {
  states: [
    { id: 0, name: 'q0', obligations: ['F p'], entryGuard: [], accepting: false, initial: true },
    { id: 1, name: 'q1', obligations: [], entryGuard: [{ prop: 'p', negated: false }], accepting: true, initial: false },
  ],
  transitions: [
    // NOTE: per the construction's convention, a transition's guard always
    // equals the TARGET state's entry guard — keep this hand-built automaton
    // consistent with that (q1's entry guard is [p], so every edge INTO q1
    // carries [p]).
    { from: 0, to: 0, guard: [] },
    { from: 0, to: 1, guard: [{ prop: 'p', negated: false }] },
    { from: 1, to: 1, guard: [{ prop: 'p', negated: false }] },
  ],
};

const k: KripkeStructure = {
  states: [
    { id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 },
    { id: 'b', name: 'b', propositions: ['p'], isInitial: false, x: 0, y: 0 },
    { id: 'd', name: 'd', propositions: [], isInitial: false, x: 0, y: 0 }, // deadlock
  ],
  transitions: [
    { from: 'a', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'd' },
  ],
};

describe('buildProduct', () => {
  it('creates only guard-consistent, reachable states', () => {
    const prod = buildProduct(k, fpAut);
    const ids = prod.states.map((s) => s.id).sort();
    // a×q1 impossible (a lacks p); b×q1 possible; d reachable with q0/q1
    expect(ids).toContain('a×q0');
    expect(ids).toContain('b×q1');
    expect(ids).not.toContain('a×q1');
  });
  it('marks initial and accepting correctly', () => {
    const prod = buildProduct(k, fpAut);
    const init = prod.states.filter((s) => s.initial);
    expect(init.map((s) => s.id)).toEqual(['a×q0']);
    expect(prod.states.find((s) => s.id === 'b×q1')!.accepting).toBe(true);
  });
  it('deadlock model states produce successor-less product states', () => {
    const prod = buildProduct(k, fpAut);
    const dStates = prod.states.filter((s) => s.modelStateId === 'd');
    expect(dStates.length).toBeGreaterThan(0);
    for (const ds of dStates) {
      expect(prod.edges.some((e) => e.from === ds.id)).toBe(false);
    }
  });
  it('edges respect both relations', () => {
    const prod = buildProduct(k, fpAut);
    expect(prod.edges.some((e) => e.from === 'a×q0' && e.to === 'b×q1')).toBe(true);
    expect(prod.edges.some((e) => e.from === 'b×q1' && e.to === 'a×q1')).toBe(false); // a lacks p? guard on q1 entry is p
  });
});
```

(The `b×q1 → a×q1` absence assertion holds because entering q1 requires reading a state satisfying `[p]`, and `a` lacks `p`.)

`src/core/emptiness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ProductGraph } from './product';
import { findAcceptingLasso } from './emptiness';

function g(states: [string, boolean, boolean][], edges: [string, string][]): ProductGraph {
  return {
    states: states.map(([id, accepting, initial]) => ({
      id, modelStateId: id, buchiStateId: 0, accepting, initial,
    })),
    edges: edges.map(([from, to]) => ({ from, to })),
  };
}

describe('findAcceptingLasso', () => {
  it('finds an accepting self-loop', () => {
    const r = findAcceptingLasso(g(
      [['i', false, true], ['x', true, false]],
      [['i', 'x'], ['x', 'x']],
    ))!;
    expect(r.path).toEqual(['i', 'x']);
    expect(r.loopIndex).toBe(1);
  });
  it('finds a multi-state accepting cycle', () => {
    const r = findAcceptingLasso(g(
      [['i', false, true], ['x', true, false], ['y', false, false]],
      [['i', 'x'], ['x', 'y'], ['y', 'x']],
    ))!;
    expect(r.loopIndex).toBe(1);
    expect(r.path[r.loopIndex]).toBe('x');
    expect(r.path).toEqual(['i', 'x', 'y']);
  });
  it('returns null when no accepting state lies on a cycle', () => {
    expect(findAcceptingLasso(g(
      [['i', false, true], ['x', true, false], ['y', false, false]],
      [['i', 'x'], ['x', 'y'], ['y', 'y']], // cycle exists but only through non-accepting y
    ))).toBe(null);
  });
  it('returns null for an accepting state without a self-loop or cycle', () => {
    expect(findAcceptingLasso(g(
      [['i', true, true], ['x', false, false]],
      [['i', 'x']],
    ))).toBe(null);
  });
  it('ignores accepting cycles unreachable from the initial states', () => {
    expect(findAcceptingLasso(g(
      [['i', false, true], ['x', true, false]],
      [['x', 'x']], // accepting loop, but i cannot reach it
    ))).toBe(null);
  });
  it('handles an empty product', () => {
    expect(findAcceptingLasso({ states: [], edges: [] })).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL on both new modules.

- [ ] **Step 3: Implement**

`src/core/product.ts`:

```ts
import { KripkeStructure, stateById, successors } from './kripke';
import { BuchiAutomaton, Literal } from './buchi';

export interface ProductState {
  id: string; // `${modelStateId}×${buchiName}`
  modelStateId: string;
  buchiStateId: number;
  accepting: boolean;
  initial: boolean;
}

export interface ProductGraph {
  states: ProductState[];
  edges: { from: string; to: string }[];
}

function satisfies(props: string[], guard: Literal[]): boolean {
  return guard.every((l) => (l.negated ? !props.includes(l.prop) : props.includes(l.prop)));
}

/** Synchronous product of a Kripke structure with a Büchi automaton.
 *  Only states reachable from the initial set are materialized. */
export function buildProduct(model: KripkeStructure, aut: BuchiAutomaton): ProductGraph {
  const nameOf = new Map(aut.states.map((q) => [q.id, q.name]));
  const acceptingOf = new Map(aut.states.map((q) => [q.id, q.accepting]));
  const outgoing = new Map<number, { to: number; guard: Literal[] }[]>();
  for (const t of aut.transitions) {
    const arr = outgoing.get(t.from) ?? [];
    arr.push({ to: t.to, guard: t.guard });
    outgoing.set(t.from, arr);
  }

  const pid = (s: string, q: number) => `${s}×${nameOf.get(q)}`;
  const states = new Map<string, ProductState>();
  const edgeSet = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  const queue: ProductState[] = [];

  for (const s of model.states.filter((x) => x.isInitial)) {
    for (const q of aut.states.filter((x) => x.initial)) {
      if (!satisfies(s.propositions, q.entryGuard)) continue;
      const ps: ProductState = {
        id: pid(s.id, q.id), modelStateId: s.id, buchiStateId: q.id,
        accepting: q.accepting, initial: true,
      };
      if (!states.has(ps.id)) { states.set(ps.id, ps); queue.push(ps); }
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const modelSucc = successors(model, cur.modelStateId);
    for (const { to, guard } of outgoing.get(cur.buchiStateId) ?? []) {
      for (const sTo of modelSucc) {
        const sState = stateById(model, sTo)!;
        if (!satisfies(sState.propositions, guard)) continue;
        const id = pid(sTo, to);
        if (!states.has(id)) {
          const ps: ProductState = {
            id, modelStateId: sTo, buchiStateId: to,
            accepting: acceptingOf.get(to)!, initial: false,
          };
          states.set(id, ps);
          queue.push(ps);
        }
        const ek = `${cur.id}->${id}`;
        if (!edgeSet.has(ek)) { edgeSet.add(ek); edges.push({ from: cur.id, to: id }); }
      }
    }
  }

  return { states: [...states.values()], edges };
}
```

`src/core/emptiness.ts`:

```ts
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

  // Tarjan SCC (recursive; product sizes here are small)
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccOf = new Map<string, number>();
  let nextIndex = 0;
  let nextScc = 0;

  function strongconnect(v: string): void {
    index.set(v, nextIndex);
    low.set(v, nextIndex);
    nextIndex++;
    stack.push(v);
    onStack.add(v);
    for (const w of succ.get(v) ?? []) {
      if (!index.has(w)) {
        strongconnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const id = nextScc++;
      for (;;) {
        const w = stack.pop()!;
        onStack.delete(w);
        sccOf.set(w, id);
        if (w === v) break;
      }
    }
  }

  for (const init of initials) if (!index.has(init)) strongconnect(init);

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
```

Note on the multi-state-cycle test: stem BFS from `i` to `x` gives `[i, x]`; cycle from `x`'s in-SCC successor `y` back to `x` gives `[y, x]`; lasso = `[i, x] + [y]` with loopIndex 1 → `['i','x','y']`, last element `y` loops back to index 1 (`x`). Matches the expected value.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (115 + 10 = 125).

- [ ] **Step 5: Commit**

```bash
git add src/core/product.ts src/core/product.test.ts src/core/emptiness.ts src/core/emptiness.test.ts
git commit -m "feat: Büchi product construction and SCC-based emptiness with lasso extraction"
```

---

### Task 3: checkLTLAllPaths + cross-checker battery

**Files:**
- Create: `src/core/ltl-allpaths.ts`
- Test: `src/core/ltl-allpaths.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/ltl-allpaths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { parseLTL } from './ltl-parser';
import { checkLTL } from './ltl-checker';
import { validateLasso } from './trace';
import { checkLTLAllPaths } from './ltl-allpaths';

// The reset example: work[w] (self-loop) -> error[] -> reset[r] -> work
const reset: KripkeStructure = {
  states: [
    { id: 'w', name: 'work', propositions: ['w'], isInitial: true, x: 0, y: 0 },
    { id: 'e', name: 'error', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'r', name: 'reset', propositions: ['r'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'w', to: 'w' }, { from: 'w', to: 'e' },
    { from: 'e', to: 'r' }, { from: 'r', to: 'w' },
  ],
};
// Same model without the work self-loop: every infinite path cycles through r
const resetNoLoop: KripkeStructure = {
  ...reset,
  transitions: reset.transitions.filter((t) => !(t.from === 'w' && t.to === 'w')),
};

describe('checkLTLAllPaths', () => {
  it('G F r fails on reset (work self-loop) and holds without the self-loop', () => {
    const fail = checkLTLAllPaths(reset, parseLTL('G F r'));
    expect(fail.kind).toBe('fails');
    const hold = checkLTLAllPaths(resetNoLoop, parseLTL('G F r'));
    expect(hold.kind).toBe('holds');
  });
  it('the counterexample stays inside ¬r states', () => {
    const res = checkLTLAllPaths(reset, parseLTL('G F r'));
    if (res.kind !== 'fails') throw new Error('expected fails');
    // the loop portion must avoid r
    const { stateIds, loopIndex } = res.counterexample;
    for (let i = loopIndex; i < stateIds.length; i++) expect(stateIds[i]).not.toBe('r');
  });
  it('F r holds without the self-loop, fails with it', () => {
    expect(checkLTLAllPaths(resetNoLoop, parseLTL('F r')).kind).toBe('holds');
    expect(checkLTLAllPaths(reset, parseLTL('F r')).kind).toBe('fails');
  });
  it('G w fails (path leaves work)', () => {
    expect(checkLTLAllPaths(reset, parseLTL('G w')).kind).toBe('fails');
  });
  it('true holds; false fails', () => {
    expect(checkLTLAllPaths(reset, parseLTL('true')).kind).toBe('holds');
    expect(checkLTLAllPaths(reset, parseLTL('false')).kind).toBe('fails');
  });
  it('no initial states → no-initial', () => {
    const m: KripkeStructure = {
      ...reset,
      states: reset.states.map((s) => ({ ...s, isInitial: false })),
    };
    expect(checkLTLAllPaths(m, parseLTL('F r')).kind).toBe('no-initial');
  });
  it('deadlock-only model holds vacuously (no infinite paths)', () => {
    const m: KripkeStructure = {
      states: [{ id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 }],
      transitions: [],
    };
    expect(checkLTLAllPaths(m, parseLTL('F r')).kind).toBe('holds');
  });
  it('returns automaton and product for holds/fails', () => {
    const res = checkLTLAllPaths(reset, parseLTL('G F r'));
    if (res.kind !== 'fails') throw new Error('expected fails');
    expect(res.automaton.states.length).toBeGreaterThan(0);
    expect(res.product.states.length).toBeGreaterThan(0);
  });
});

describe('cross-checker invariant: counterexamples are valid and falsify the formula', () => {
  const formulas = ['G F r', 'F r', 'G w', 'w U r', 'X w', 'G (w -> X !r)', 'F G w'];
  const models = { reset, resetNoLoop };
  for (const [mName, model] of Object.entries(models)) {
    for (const f of formulas) {
      it(`${f} on ${mName}`, () => {
        const root = parseLTL(f);
        const res = checkLTLAllPaths(model, root);
        if (res.kind === 'fails') {
          expect(validateLasso(model, res.counterexample)).toBe(null);
          const rows = checkLTL(model, res.counterexample, root);
          expect(rows.get(root.id)![0]).toBe(false);
        }
      });
    }
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./ltl-allpaths`.

- [ ] **Step 3: Implement**

`src/core/ltl-allpaths.ts`:

```ts
import { KripkeStructure } from './kripke';
import { LTLNode } from './ltl-parser';
import { Lasso } from './trace';
import { AutomatonTooLarge, BuchiAutomaton, ltlToBuchi } from './buchi';
import { ProductGraph, buildProduct } from './product';
import { findAcceptingLasso } from './emptiness';

export type AllPathsResult =
  | { kind: 'holds'; automaton: BuchiAutomaton; product: ProductGraph }
  | { kind: 'fails'; counterexample: Lasso; automaton: BuchiAutomaton; product: ProductGraph }
  | { kind: 'too-large' }
  | { kind: 'no-initial' };

/** M ⊨ ∀φ iff the language of M × A(¬φ) is empty. */
export function checkLTLAllPaths(model: KripkeStructure, root: LTLNode): AllPathsResult {
  if (!model.states.some((s) => s.isInitial)) return { kind: 'no-initial' };
  let automaton: BuchiAutomaton;
  try {
    automaton = ltlToBuchi({ id: -1, kind: 'not', child: root });
  } catch (e) {
    if (e instanceof AutomatonTooLarge) return { kind: 'too-large' };
    throw e;
  }
  const product = buildProduct(model, automaton);
  const lasso = findAcceptingLasso(product);
  if (lasso === null) return { kind: 'holds', automaton, product };
  const byId = new Map(product.states.map((s) => [s.id, s]));
  const counterexample: Lasso = {
    stateIds: lasso.path.map((id) => byId.get(id)!.modelStateId),
    loopIndex: lasso.loopIndex,
  };
  return { kind: 'fails', counterexample, automaton, product };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (125 + 22 = 147). The cross-checker battery is the crucial gate: if any case fails, STOP and report the exact formula/model/counterexample — it means the tableau, product, emptiness, or trace checker disagree, and the bug must be diagnosed, not papered over.

- [ ] **Step 5: Commit**

```bash
git add src/core/ltl-allpaths.ts src/core/ltl-allpaths.test.ts
git commit -m "feat: all-paths LTL checking with counterexample extraction, cross-checked"
```

---

### Task 4: UI verdicts — ∀ marks, inspector section, load counterexample

**Files:**
- Modify: `src/ui/types.ts`, `src/ui/App.tsx`, `src/ui/FormulaPanel.tsx`, `src/ui/Inspector.tsx`, `src/styles.css`

- [ ] **Step 1: types.ts**

Add to imports: `import { AllPathsResult } from '../core/ltl-allpaths';` and to `Analysis`:

```ts
  allPaths?: AllPathsResult;         // LTL only
```

- [ ] **Step 2: App.tsx**

1. Import: `import { checkLTLAllPaths } from '../core/ltl-allpaths';` and `import { Lasso } from '../core/trace';` (extend the existing trace import).
2. In the analyses memo's LTL branch, add `allPaths`:

```tsx
        if (entry.logic === 'ltl') {
          const ltlAst = parseLTL(entry.text);
          const ltlRows = completeLasso ? checkLTL(model, completeLasso, ltlAst) : undefined;
          const allPaths = checkLTLAllPaths(model, ltlAst);
          return {
            entry, ltlAst, ltlRows, allPaths,
            verdict: ltlRows ? ltlRows.get(ltlAst.id)![0] : null,
          };
        }
```

3. Add the counterexample loader (near the other trace helpers):

```tsx
  function loadCounterexample(l: Lasso) {
    setTraceNotice(null);
    setRecording(false);
    setTrace({ stateIds: l.stateIds, loopIndex: l.loopIndex });
  }
```

4. Pass `onLoadCounterexample={loadCounterexample}` to `<Inspector … />`.

- [ ] **Step 3: FormulaPanel.tsx**

In the row map, add after the `verdict`/`cls` computation:

```tsx
          const ap = a.entry.logic === 'ltl' && !a.error ? a.allPaths : undefined;
          const apMark = !ap ? null
            : ap.kind === 'holds' ? { text: '∀✓', cls: 'true', title: 'holds on all infinite paths' }
            : ap.kind === 'fails' ? { text: '∀✗', cls: 'false', title: 'fails on some path — counterexample available' }
            : ap.kind === 'too-large' ? { text: '∀⚠', cls: 'none', title: 'automaton too large — simplify the formula' }
            : { text: '∀–', cls: 'none', title: 'no initial states' };
```

and render right after the existing verdict span:

```tsx
              {apMark && <span className={`verdict ${apMark.cls}`} title={apMark.title}>{apMark.text}</span>}
```

Also add `title="on the current trace"` to the existing verdict span for LTL rows (leave CTL rows untitled or keep the existing null-verdict title logic — minimal change: only add the title when `a.entry.logic === 'ltl'`).

- [ ] **Step 4: Inspector.tsx**

1. Props: add to `InspectorProps`:

```ts
  onLoadCounterexample: (l: import('../core/trace').Lasso) => void;
```

(or import `Lasso` at the top — prefer a top-level `import { Lasso } from '../core/trace';`.)

2. In the LTL formula branch, after the existing "Verdict (trace position 0)" block, add:

```tsx
          <div className="section-title">All paths (Büchi)</div>
          {(() => {
            const ap = analysis.allPaths;
            if (!ap) return <div className="muted">–</div>;
            switch (ap.kind) {
              case 'holds':
                return <>
                  <div className="muted">∀✓ holds on all infinite paths</div>
                  <div className="muted">
                    automaton ¬φ: {ap.automaton.states.length} states
                    ({ap.automaton.states.filter((q) => q.accepting).length} accepting)
                    · product: {ap.product.states.length} states
                  </div>
                </>;
              case 'fails':
                return <>
                  <div className="muted">∀✗ fails — a path violates the formula</div>
                  <button onClick={() => onLoadCounterexample(ap.counterexample)}>
                    Load counterexample as trace
                  </button>
                  <div className="muted" style={{ marginTop: 4 }}>
                    automaton ¬φ: {ap.automaton.states.length} states
                    · product: {ap.product.states.length} states
                  </div>
                </>;
              case 'too-large':
                return <div className="hint">⚠ automaton exceeds 500 states — simplify the formula.</div>;
              case 'no-initial':
                return <div className="muted">No initial states — mark one to check all paths.</div>;
            }
          })()}
```

(Destructure `onLoadCounterexample` in the component.)

- [ ] **Step 5: Verify**

`npm test`: two existing App tests change behavior — the default example's `G F r` row now ALSO shows a `∀✗` mark (the reset model fails G F r), so any test selecting `.verdict` by index or asserting exact verdict arrays needs review: the LTL row now contains TWO `.verdict` spans. Update the existing assertions minimally (e.g. the verdict-array test should read the FIRST `.verdict` per row: `r.querySelector('.verdict')` already returns the first — verify it still yields `['✓','✗','✓','–']`; if a test uses `querySelectorAll('.verdict')` counts, adjust). Report exactly what needed changing. `npx tsc --noEmit`, `npm run build` clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/types.ts src/ui/App.tsx src/ui/FormulaPanel.tsx src/ui/Inspector.tsx
git commit -m "feat: all-paths verdicts with counterexample-to-trace loading"
```

---

### Task 5: GraphView + center-canvas tabs + hover detail

**Files:**
- Create: `src/ui/GraphView.tsx`
- Modify: `src/ui/Canvas.tsx` (edgePath signature only), `src/ui/App.tsx`, `src/ui/Inspector.tsx`, `src/styles.css`

- [ ] **Step 1: Loosen edgePath's parameter type**

In `src/ui/Canvas.tsx`, change ONLY the signature of `edgePath` (body unchanged):

```ts
export interface EdgeEndpoint { id: string; x: number; y: number }
export function edgePath(a: EdgeEndpoint, b: EdgeEndpoint, curved: boolean): string {
```

(`KripkeState` is structurally assignable — no call-site changes.)

- [ ] **Step 2: styles**

Append to `src/styles.css`:

```css
.view-tabs { display: flex; gap: 4px; padding: 6px 10px 0; background: #fdfdfd; }
.center-stack { display: flex; flex-direction: column; height: 100%; }
.center-stack .view-body { flex: 1; position: relative; overflow: hidden; }
.graph-label { font-size: 12px; }
.graph-sublabel { font-size: 9px; fill: #666; }
.edge-label { font-size: 10px; font-family: ui-monospace, monospace; fill: #555; }
```

- [ ] **Step 3: GraphView component**

`src/ui/GraphView.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { KripkeStructure } from '../core/kripke';
import { forceLayout } from '../core/layout';
import { edgePath } from './Canvas';

export interface GraphNode {
  id: string;
  label: string;
  accepting?: boolean;
  initial?: boolean;
}
export interface GraphEdge { from: string; to: string; label?: string }
export interface RenderGraph { nodes: GraphNode[]; edges: GraphEdge[] }

interface GraphViewProps {
  graph: RenderGraph;
  onHoverNode: (id: string | null) => void;
}

const GR = 26;

export default function GraphView({ graph, onHoverNode }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null);

  const positions = useMemo(() => {
    const pseudo: KripkeStructure = {
      states: graph.nodes.map((n, i) => ({
        id: n.id, name: n.label, propositions: [], isInitial: !!n.initial,
        x: 110 + (i % 5) * 150, y: 90 + Math.floor(i / 5) * 150,
      })),
      transitions: graph.edges.map((e) => ({ from: e.from, to: e.to })),
    };
    return forceLayout(pseudo, 200, 130);
  }, [graph]);

  const pos = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
  const hasReverse = (from: string, to: string) =>
    graph.edges.some((e) => e.from === to && e.to === from);

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    svgRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origTx: view.tx, origTy: view.ty };
  }
  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, tx: d.origTx + e.clientX - d.startX, ty: d.origTy + e.clientY - d.startY }));
  }
  function onPointerUp(e: PointerEvent) {
    if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  }

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.001);
      setView((v) => {
        const scale = Math.min(3, Math.max(0.3, v.scale * factor));
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        const wx = (cx - v.tx) / v.scale, wy = (cy - v.ty) / v.scale;
        return { scale, tx: cx - wx * scale, ty: cy - wy * scale };
      });
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  function midpoint(a: { x: number; y: number }, b: { x: number; y: number }, curved: boolean) {
    if (a === b) return { x: a.x, y: a.y - GR - 46 };
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (!curved) return { x: mx, y: my - 5 };
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: mx - (dy / d) * 16, y: my + (dx / d) * 16 - 5 };
  }

  return (
    <svg
      ref={svgRef} className="canvas-svg"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onMouseLeave={() => onHoverNode(null)}
    >
      <defs>
        <marker id="garrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
        </marker>
      </defs>
      <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
        {graph.edges.map((e, i) => {
          const a = { id: e.from, ...pos(e.from) };
          const b = { id: e.to, ...pos(e.to) };
          const curved = e.from !== e.to && hasReverse(e.from, e.to);
          const m = midpoint(pos(e.from), e.from === e.to ? pos(e.from) : pos(e.to), curved);
          return (
            <g key={i}>
              <path d={edgePath(a, b, curved)} fill="none" stroke="#555"
                strokeWidth={1.3} markerEnd="url(#garrow)" />
              {e.label && (
                <text className="edge-label" x={m.x} y={m.y} textAnchor="middle">{e.label}</text>
              )}
            </g>
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos(n.id);
          return (
            <g key={n.id}
              onMouseEnter={() => onHoverNode(n.id)}
              style={{ cursor: 'default' }}>
              {n.initial && (
                <path d={`M ${p.x - GR - 24} ${p.y - GR - 10} L ${p.x - GR + 3} ${p.y - GR + 13}`}
                  stroke="#333" strokeWidth={2} markerEnd="url(#garrow)" fill="none" />
              )}
              <circle cx={p.x} cy={p.y} r={GR} fill="#fff" stroke="#333" strokeWidth={1.5} />
              {n.accepting && (
                <circle cx={p.x} cy={p.y} r={GR - 4} fill="none" stroke="#333" strokeWidth={1.2} />
              )}
              <text className="graph-label" x={p.x} y={p.y + 4} textAnchor="middle"
                style={{ userSelect: 'none' }}>{n.label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
```

Note: `edgePath` expects the self-loop case via `a.id === b.id` — passing the same `pos` object twice with the same id is handled. The GraphView circle radius (26) differs slightly from edgePath's internal `R = 28`; the 2px difference is visually negligible (arrowheads land just outside the circle) — acceptable; do NOT fork edgePath over this.

- [ ] **Step 4: App wiring**

In `src/ui/App.tsx`:

1. Imports:

```tsx
import GraphView, { RenderGraph } from './GraphView';
import { pretty as prettyLTL } from '../core/ltl-parser';
```

2. State + reset:

```tsx
  const [viewTab, setViewTab] = useState<'model' | 'automaton' | 'product'>('model');
  const [graphHover, setGraphHover] = useState<string | null>(null);
  useEffect(() => { setViewTab('model'); setGraphHover(null); }, [activeFormulaId]);
```

3. Graph derivations (after `activeLTLAnalysis`):

```tsx
  const graphable = activeLTLAnalysis?.allPaths &&
    (activeLTLAnalysis.allPaths.kind === 'holds' || activeLTLAnalysis.allPaths.kind === 'fails')
    ? activeLTLAnalysis.allPaths : null;

  const automatonGraph: RenderGraph | null = useMemo(() => {
    if (!graphable) return null;
    const lit = (l: { prop: string; negated: boolean }) => (l.negated ? `¬${l.prop}` : l.prop);
    return {
      nodes: graphable.automaton.states.map((q) => ({
        id: `q${q.id}`, label: q.name, accepting: q.accepting, initial: q.initial,
      })),
      edges: graphable.automaton.transitions.map((t) => ({
        from: `q${t.from}`, to: `q${t.to}`,
        label: t.guard.length === 0 ? 'true' : t.guard.map(lit).join('∧'),
      })),
    };
  }, [graphable]);

  const productGraph: RenderGraph | null = useMemo(() => {
    if (!graphable) return null;
    return {
      nodes: graphable.product.states.map((p) => ({
        id: p.id,
        label: `${stateById(model, p.modelStateId)?.name ?? p.modelStateId}×${
          graphable.automaton.states.find((q) => q.id === p.buchiStateId)?.name ?? p.buchiStateId}`,
        accepting: p.accepting, initial: p.initial,
      })),
      edges: graphable.product.edges.map((e) => ({ from: e.from, to: e.to })),
    };
  }, [graphable, model]);
```

(Add `stateById` to the kripke import if not present.)

4. Hover detail for the inspector:

```tsx
  const graphDetail = useMemo(() => {
    if (!graphable || graphHover === null) return null;
    if (viewTab === 'automaton') {
      const q = graphable.automaton.states.find((s) => `q${s.id}` === graphHover);
      if (!q) return null;
      return {
        title: `${q.name}${q.accepting ? ' (accepting)' : ''}${q.initial ? ' (initial)' : ''}`,
        lines: q.obligations.length > 0 ? q.obligations : ['no obligations (true)'],
      };
    }
    if (viewTab === 'product') {
      const p = graphable.product.states.find((s) => s.id === graphHover);
      if (!p) return null;
      const q = graphable.automaton.states.find((s) => s.id === p.buchiStateId);
      return {
        title: `${graphHover}${p.accepting ? ' (accepting)' : ''}`,
        lines: [
          `model state: ${stateById(model, p.modelStateId)?.name ?? p.modelStateId}`,
          `automaton state: ${q?.name ?? p.buchiStateId}`,
          ...(q && q.obligations.length > 0 ? [`obligations: ${q.obligations.join(', ')}`] : []),
        ],
      };
    }
    return null;
  }, [graphable, graphHover, viewTab, model]);
```

5. Center pane render — wrap in the tab stack (replace the current `<div className="pane center">…</div>` contents):

```tsx
        <div className="pane center">
          <div className="center-stack">
            {graphable && (
              <div className="view-tabs">
                <button className={`tab ${viewTab === 'model' ? 'active' : ''}`}
                  onClick={() => setViewTab('model')}>Model</button>
                <button className={`tab ${viewTab === 'automaton' ? 'active' : ''}`}
                  title={`Büchi automaton for ¬(${activeLTLAnalysis!.ltlAst ? prettyLTL(activeLTLAnalysis!.ltlAst) : ''})`}
                  onClick={() => setViewTab('automaton')}>Automaton ¬φ</button>
                <button className={`tab ${viewTab === 'product' ? 'active' : ''}`}
                  onClick={() => setViewTab('product')}>Product</button>
              </div>
            )}
            <div className="view-body">
              {(!graphable || viewTab === 'model') ? (
                <Canvas
                  … all existing props unchanged …
                />
              ) : viewTab === 'automaton' ? (
                <GraphView graph={automatonGraph!} onHoverNode={setGraphHover} />
              ) : (
                <GraphView graph={productGraph!} onHoverNode={setGraphHover} />
              )}
            </div>
          </div>
        </div>
```

(Keep the existing `onMouseLeave` hover-clear on the pane div if present.)

6. Pass `graphDetail={graphDetail}` to `<Inspector … />`.

- [ ] **Step 5: Inspector hover-detail section**

Add to `InspectorProps`:

```ts
  graphDetail: { title: string; lines: string[] } | null;
```

Destructure it, and in the LTL formula branch append at the bottom:

```tsx
          {graphDetail && (
            <>
              <div className="section-title">Hovered node</div>
              <div style={{ fontWeight: 600 }}>{graphDetail.title}</div>
              {graphDetail.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}
            </>
          )}
```

- [ ] **Step 6: Verify**

`npm test` (all pass — no existing test exercises the center-pane markup structurally except via Canvas queries, which remain when viewTab is 'model'/no LTL active; if a test renders with an LTL formula active by default it still shows Model first). `npx tsc --noEmit`, `npm run build`. Manual: select `G F r` → tabs appear; Automaton tab shows the ¬(G F r) automaton with double-circled accepting states and guard labels; Product shows `work×q0`-style nodes; hover populates the inspector; pan/zoom work; switching to a CTL formula hides tabs and restores the model canvas.

- [ ] **Step 7: Commit**

```bash
git add src/ui/GraphView.tsx src/ui/Canvas.tsx src/ui/App.tsx src/ui/Inspector.tsx src/styles.css
git commit -m "feat: automaton and product canvas tabs with read-only graph view"
```

---

### Task 6: Integration tests, README, final review

**Files:**
- Modify: `src/ui/App.test.tsx`, `README.md`

- [ ] **Step 1: Integration tests**

Append to the describe block in `src/ui/App.test.tsx`:

```tsx
  it('LTL rows show an all-paths mark (G F r fails on the reset example)', () => {
    render(<App />);
    const ltlRow = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ltl'))!;
    const marks = [...ltlRow.querySelectorAll('.verdict')].map((v) => v.textContent);
    expect(marks).toContain('∀✗');
  });

  it('loading the counterexample as a trace makes the trace verdict ✗ too', () => {
    render(<App />);
    fireEvent.click(screen.getByText('G F r'));
    fireEvent.click(screen.getByText('Load counterexample as trace'));
    const ltlRow = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ltl'))!;
    const marks = [...ltlRow.querySelectorAll('.verdict')].map((v) => v.textContent);
    expect(marks[0]).toBe('✗'); // trace verdict: counterexample falsifies G F r
    expect(document.querySelectorAll('.chip').length).toBeGreaterThan(0); // trace loaded
  });

  it('view tabs appear for an active LTL formula and switch to the automaton', () => {
    render(<App />);
    fireEvent.click(screen.getByText('G F r'));
    expect(screen.getByText('Automaton ¬φ')).toBeTruthy();
    fireEvent.click(screen.getByText('Automaton ¬φ'));
    // GraphView renders: at least one double-circle (accepting) exists for ¬(G F r)
    const svg = document.querySelector('.view-body svg')!;
    expect(svg.querySelectorAll('circle').length).toBeGreaterThan(0);
    // switching to a CTL formula hides the tabs
    fireEvent.click(screen.getByText('AG EF r'));
    expect(screen.queryByText('Automaton ¬φ')).toBeNull();
  });
```

Mechanics notes: `screen.getByText('G F r')` may match both the formula row text and (after loading a trace) timeline content — these tests click before any trace exists except in test 2, where the formula row was already clicked first; if ambiguity arises, scope with `within(document.querySelector('.pane.left')!)`. Adjust mechanics only, never assertions.

- [ ] **Step 2: Run tests**

`npm test` — expect 150 passing (147 + 3). `npx tsc --noEmit`, `npm run build` clean.

- [ ] **Step 3: README**

Under `## Use`, extend the Formulas bullet with:

```markdown
  LTL rows carry two verdicts: on the current trace, and `∀` — over all infinite
  paths, checked by translating ¬φ to a Büchi automaton and searching the product
  with your model for an accepting cycle. When `∀✗`, one click loads the
  counterexample as the active trace. Select an LTL formula to get Model /
  Automaton / Product tabs above the canvas and explore the construction itself.
```

- [ ] **Step 4: Manual walkthrough**

`npm run dev`: `G F r` on the reset example → `∀✗`, load counterexample → work self-loop trace appears, timeline shows why it fails; remove the work self-loop → `∀✓`; Automaton tab shows ¬(G F r)'s automaton (double circles, `¬r` guards); Product tab shows reachable pairs; hover feeds the inspector; too-large path via a pathological formula (optional); CTL formulas unaffected; trace recording/timeline unaffected. Fix anything broken with small individual commits.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.test.tsx README.md
git commit -m "test: all-paths integration tests; docs: Büchi usage"
```
