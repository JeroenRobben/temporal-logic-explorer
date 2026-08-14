# Operator Explanations & Guided Tutorials ("Learn") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every operator gets a book-informed reference explanation plus an interactive checkpointed tutorial that drives the real app, hosted in a right-pane Learn tab with `?` links from palette and inspector.

**Architecture:** Pure `src/learn/` layer (types, engine, checkpoint helpers, content modules with example models from MCS.pdf) + a `LearnPanel` UI with a tutorial runner in App that stashes/restores the workspace and auto-advances on checkpoint predicates over a `LearnView` projection of app state.

**Tech Stack:** React 18 + TypeScript + Vite; vitest + jsdom. **Run tests ONLY via `npm test`** (scripts set `NODE_OPTIONS=--no-experimental-webstorage`; never call vitest directly).

**Spec:** `docs/superpowers/specs/2026-08-14-operator-learn-design.md` — read it first.

⚠️ **Semantics guard (read before touching content):** the content battery (Task 3) asserts expected verdicts. If a battery expectation fails, DO NOT adjust core checkers and DO NOT weaken the battery — hand-evaluate the formula on the model using the definitions in the spec/book, then fix the *content* (choose a different formula/model or correct the expected value) and say so in your report. Wrong plan expectations are a known failure mode in this repo; report them, don't absorb them.

---

### Task 1: Learn core — types, engine, checkpoint helpers

**Files:**
- Create: `src/learn/types.ts`
- Create: `src/learn/engine.ts`
- Create: `src/learn/helpers.ts`
- Test: `src/learn/engine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/learn/engine.test.ts
import { describe, expect, it } from 'vitest';
import { findNodeByPretty, prettyOfNode, stepKind } from './engine';
import { tabIs, verdictIs, hasFormula, selectedIs, hasTransition, lacksTransition, and } from './helpers';
import { LearnView } from './types';

const view = (over: Partial<LearnView> = {}): LearnView => ({
  model: { states: [{ id: 's', name: 's', propositions: [], isInitial: true, x: 0, y: 0 },
                    { id: 't', name: 't', propositions: ['p'], isInitial: false, x: 0, y: 0 }],
           transitions: [{ from: 's', to: 't' }] },
  formulas: [{ text: 'EF p', logic: 'ctl', verdict: true }],
  activeFormulaIndex: 0,
  selectedSubformulaPretty: null,
  viewTab: 'model',
  hasTrace: false,
  showEvidence: false,
  ...over,
});

describe('engine node lookup', () => {
  it('finds a subformula node id by pretty string (all three logics)', () => {
    expect(findNodeByPretty('ctl', 'AG (EF p)', 'EF p')).not.toBeNull();
    expect(findNodeByPretty('ltl', 'G (p -> F q)', 'F q')).not.toBeNull();
    expect(findNodeByPretty('ctlstar', 'A (G (F p))', 'F p')).not.toBeNull();
    expect(findNodeByPretty('ctl', 'AG (EF p)', 'EF q')).toBeNull();
    expect(findNodeByPretty('ctl', '((broken', 'x')).toBeNull();
  });
  it('round-trips: prettyOfNode(findNodeByPretty(x)) === x', () => {
    const id = findNodeByPretty('ctl', 'AG (EF p)', 'EF p')!;
    expect(prettyOfNode('ctl', 'AG (EF p)', id)).toBe('EF p');
  });
});

describe('stepKind', () => {
  it('classifies task vs info', () => {
    expect(stepKind({ text: 'x' })).toBe('info');
    expect(stepKind({ text: 'x', checkpoint: () => true })).toBe('task');
  });
});

describe('checkpoint helpers', () => {
  it('tabIs / verdictIs / selectedIs', () => {
    expect(tabIs('model')(view())).toBe(true);
    expect(verdictIs(0, true)(view())).toBe(true);
    expect(verdictIs(0, false)(view())).toBe(false);
    expect(verdictIs(3, true)(view())).toBe(false);
    expect(selectedIs('EF p')(view({ selectedSubformulaPretty: 'EF p' }))).toBe(true);
  });
  it('hasFormula compares parse-normalized text per logic', () => {
    expect(hasFormula('ctl', 'EF(p)')(view())).toBe(true);      // normalizes to same pretty
    expect(hasFormula('ctl', 'AF p')(view())).toBe(false);
    expect(hasFormula('ltl', 'EF p')(view())).toBe(false);      // wrong logic; must not throw
  });
  it('transition predicates and conjunction', () => {
    expect(hasTransition('s', 't')(view())).toBe(true);
    expect(lacksTransition('t', 's')(view())).toBe(true);
    expect(and(tabIs('model'), verdictIs(0, true))(view())).toBe(true);
    expect(and(tabIs('tree'), verdictIs(0, true))(view())).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (modules missing)**: `npm test -- src/learn/engine.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/learn/types.ts
import { KripkeStructure } from '../core/kripke';
import { Logic, PendingLasso } from '../ui/types';

export interface ReferenceDoc {
  id: string;                 // 'ltl-U', 'ctl-EG', 'bool-and', 'star-A', …
  logic: Logic | 'shared';
  symbol: string;             // 'E[φ U ψ]'
  name: string;               // 'Exists-Until'
  informal: string;
  formal: string;
  equivalences: string[];     // display-only strings (may contain φ/ψ metavariables)
  patterns: { formula: string; reading: string }[];  // formula MUST parse in doc's logic
  pitfalls: string[];
  bookRef: string;            // e.g. 'MCS §5.5.1'
  tutorialId?: string;
}

export interface StepSetup {
  model?: KripkeStructure;
  formulas?: { text: string; logic: Logic }[];
  activeFormulaIndex?: number;
  selectSubformulaPretty?: string;
  viewTab?: 'model' | 'tree' | 'automaton' | 'product';
  trace?: PendingLasso | null;
  showEvidence?: boolean;
}

export interface LearnView {
  model: KripkeStructure;
  formulas: { text: string; logic: Logic; verdict: boolean | null }[];
  activeFormulaIndex: number;          // -1 when none
  selectedSubformulaPretty: string | null;
  viewTab: string;
  hasTrace: boolean;
  showEvidence: boolean;
}

export type Checkpoint = (v: LearnView) => boolean;

export interface TutorialStep {
  text: string;               // markdown-lite: **bold**, `code`
  setup?: StepSetup;          // applied on entering the step
  checkpoint?: Checkpoint;    // presence ⇒ task step (auto-advance when true)
  solution?: StepSetup;       // "Show me"; REQUIRED when checkpoint is set
  highlight?: string;         // data-learn anchor id
}

export interface Tutorial {
  id: string;
  title: string;
  logic: Logic | 'shared';
  intro: string;
  steps: TutorialStep[];      // last step MUST be info (no checkpoint)
}
```

```ts
// src/learn/engine.ts
import { parseCTL } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';
import { pretty as prettyCTL } from '../core/ctl-parser';
import { pretty as prettyLTL } from '../core/ltl-parser';
import { pretty as prettyStar } from '../core/ctlstar-parser';
import { Logic } from '../ui/types';
import { TutorialStep } from './types';

// NOTE: verify the actual parse-function export names in the three parsers
// before implementing (e.g. `parseCTL` may be exported as `parse`); adapt the
// imports, keep the API below unchanged.

type AnyNode = { id: number; kind: string };

export function parseForLogic(logic: Logic, text: string): unknown | null {
  try {
    if (logic === 'ctl') return parseCTL(text);
    if (logic === 'ltl') return parseLTL(text);
    return parseCTLStar(text);
  } catch { return null; }
}

export function prettyForLogic(logic: Logic, node: unknown): string {
  if (logic === 'ctl') return prettyCTL(node as never);
  if (logic === 'ltl') return prettyLTL(node as never);
  return prettyStar(node as never);
}

/** Generic AST walk: every node is a plain object with numeric `id` and `kind`. */
function collectNodes(n: unknown, out: AnyNode[]): void {
  if (n === null || typeof n !== 'object') return;
  const o = n as Record<string, unknown>;
  if (typeof o.id === 'number' && typeof o.kind === 'string') out.push(o as unknown as AnyNode);
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach((x) => collectNodes(x, out));
    else if (v !== null && typeof v === 'object') collectNodes(v, out);
  }
}

export function findNodeByPretty(logic: Logic, text: string, target: string): number | null {
  const ast = parseForLogic(logic, text);
  if (ast === null) return null;
  const nodes: AnyNode[] = [];
  collectNodes(ast, nodes);
  const hit = nodes.find((n) => prettyForLogic(logic, n) === target);
  return hit ? hit.id : null;
}

export function prettyOfNode(logic: Logic, text: string, nodeId: number): string | null {
  const ast = parseForLogic(logic, text);
  if (ast === null) return null;
  const nodes: AnyNode[] = [];
  collectNodes(ast, nodes);
  const hit = nodes.find((n) => n.id === nodeId);
  return hit ? prettyForLogic(logic, hit) : null;
}

export function stepKind(step: TutorialStep): 'task' | 'info' {
  return step.checkpoint ? 'task' : 'info';
}
```

```ts
// src/learn/helpers.ts
import { Logic } from '../ui/types';
import { Checkpoint } from './types';
import { parseForLogic, prettyForLogic } from './engine';

const norm = (logic: Logic, text: string): string | null => {
  const ast = parseForLogic(logic, text);
  return ast === null ? null : prettyForLogic(logic, ast);
};

export const tabIs = (t: string): Checkpoint => (v) => v.viewTab === t;
export const verdictIs = (i: number, val: boolean): Checkpoint => (v) => v.formulas[i]?.verdict === val;
export const activeFormulaIs = (i: number): Checkpoint => (v) => v.activeFormulaIndex === i;
export const selectedIs = (target: string): Checkpoint => (v) => v.selectedSubformulaPretty === target;
export const evidenceShown = (): Checkpoint => (v) => v.showEvidence;
export const hasTrace = (): Checkpoint => (v) => v.hasTrace;
export const hasTransition = (from: string, to: string): Checkpoint => (v) =>
  v.model.transitions.some((t) => t.from === from && t.to === to);
export const lacksTransition = (from: string, to: string): Checkpoint => (v) =>
  !v.model.transitions.some((t) => t.from === from && t.to === to);
export const hasFormula = (logic: Logic, text: string): Checkpoint => {
  return (v) => {
    const want = norm(logic, text);
    if (want === null) return false;
    return v.formulas.some((f) => f.logic === logic && norm(f.logic, f.text) === want);
  };
};
export const and = (...cs: Checkpoint[]): Checkpoint => (v) => cs.every((c) => c(v));
```

- [ ] **Step 4: Run — expect PASS**: `npm test -- src/learn/engine.test.ts` (fix parser import names if needed). Then full suite: `npm test` — 338 pre-existing tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/learn
git commit -m "feat(learn): pure engine, types, checkpoint helpers"
```

---

### Task 2: Content — shared models, boolean references, CTL EF pilot

**Files:**
- Create: `src/learn/content/models.ts`
- Create: `src/learn/content/booleans.ts`
- Create: `src/learn/content/ctl.ts` (EF only for now)
- Create: `src/learn/content/index.ts`

No tests in this task — Task 3's battery covers all content. Implement exactly:

- [ ] **Step 1: Shared example models (book-derived)**

```ts
// src/learn/content/models.ts
import { KripkeStructure } from '../../core/kripke';

/** MCS Exercise 5.5.1 / p.147 running example: s0{p,q} ⇄ s1{q,r}, both → s2{r}, s2 self-loop. */
export const M_BOOK: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['p', 'q'], isInitial: true,  x: 200, y: 70 },
    { id: 's1', name: 's1', propositions: ['q', 'r'], isInitial: false, x: 110, y: 220 },
    { id: 's2', name: 's2', propositions: ['r'],      isInitial: false, x: 300, y: 220 },
  ],
  transitions: [
    { from: 's0', to: 's1' }, { from: 's1', to: 's0' },
    { from: 's0', to: 's2' }, { from: 's1', to: 's2' }, { from: 's2', to: 's2' },
  ],
};

/** MCS Fig 5.12: s{} (self-loop, edge to t), t{p} (self-loop). AG EF p holds at s; delete s→t and it fails. */
export const M_REACH: KripkeStructure = {
  states: [
    { id: 's', name: 's', propositions: [],    isInitial: true,  x: 140, y: 140 },
    { id: 't', name: 't', propositions: ['p'], isInitial: false, x: 320, y: 140 },
  ],
  transitions: [{ from: 's', to: 's' }, { from: 's', to: 't' }, { from: 't', to: 't' }],
};

/** M_REACH with s→t removed (solution model for the "cut the edge" tasks). */
export const M_REACH_CUT: KripkeStructure = {
  ...M_REACH,
  transitions: M_REACH.transitions.filter((t) => !(t.from === 's' && t.to === 't')),
};

/** MCS Fig 5.5 / Example 5.2.1: a{p} self-loop with an exit to b{} (self-loop). EG p vs AG p. */
export const M_ESCAPE: KripkeStructure = {
  states: [
    { id: 'a', name: 'a', propositions: ['p'], isInitial: true,  x: 140, y: 140 },
    { id: 'b', name: 'b', propositions: [],    isInitial: false, x: 320, y: 140 },
  ],
  transitions: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'b' }],
};

/** Deadlock teaching model: d0{p} → d1{} with NO outgoing edges (deadlock). */
export const M_DEAD: KripkeStructure = {
  states: [
    { id: 'd0', name: 'd0', propositions: ['p'], isInitial: true,  x: 140, y: 140 },
    { id: 'd1', name: 'd1', propositions: [],    isInitial: false, x: 320, y: 140 },
  ],
  transitions: [{ from: 'd0', to: 'd1' }],
};
```

- [ ] **Step 2: Boolean references + tutorial**

Five compact `ReferenceDoc`s (`bool-not`, `bool-and`, `bool-or`, `bool-implies`, `bool-iff`, logic `'shared'`, `bookRef: 'MCS §5.2.1/§9.1'`) and one tutorial `tut-booleans`. Content requirements: `informal` states the connective's truth-functional reading in one or two sentences (own words); `formal` gives the satisfaction clause (e.g. `M,s ⊨ φ → ψ  iff  M,s ⊭ φ or M,s ⊨ ψ`); `equivalences` include De Morgan for ∧/∨, `φ → ψ ≡ ¬φ ∨ ψ`, `¬¬φ ≡ φ`; implication's `pitfalls` MUST include the vacuous-truth gotcha ("`p → r` is true wherever `p` is false"). Patterns (must parse as CTL): `¬(c1 ∧ c2)` "mutual exclusion as a state formula (MCS §5.2.5)", `p → EX q` "conditional possibility".

Tutorial `tut-booleans` (logic `'shared'`), on `M_BOOK`, steps exactly:

```ts
export const TUT_BOOLEANS: Tutorial = {
  id: 'tut-booleans', title: 'Boolean connectives', logic: 'shared',
  intro: 'Propositional connectives evaluated at a single state — the ground floor every temporal operator builds on.',
  steps: [
    { text: 'This is the running example structure from the book (MCS p.147): `s0{p,q}`, `s1{q,r}`, `s2{r}`. The formula `p ∧ q` is a **state formula** — it is checked at each state separately. The ✓ verdict means it holds at the initial state s0.',
      setup: { model: M_BOOK, formulas: [{ text: 'p & q', logic: 'ctl' }], activeFormulaIndex: 0 } },
    { text: 'Select the `q` leaf in the inspector tree. The canvas rings every state whose label contains `q` — its **sat set** {s0, s1}. Every connective just combines sat sets.',
      checkpoint: selectedIs('q'), solution: { selectSubformulaPretty: 'q' }, highlight: 'inspector-tree' },
    { text: 'Implication is the classic trap: **`p → r` is true at every state where `p` is false** (vacuously). Add the formula `p -> r` and check its verdict: ✗ at s0 (p holds, r does not) — but select its root and note s1 and s2 are in the sat set.',
      checkpoint: hasFormula('ctl', 'p -> r'), solution: { formulas: [{ text: 'p & q', logic: 'ctl' }, { text: 'p -> r', logic: 'ctl' }] } },
    { text: 'Duality preview: `¬(p ∧ q) ≡ ¬p ∨ ¬q` (De Morgan). The same pattern returns at temporal scale — `¬F` is `G¬`, `¬AF` is `EG¬`. Each temporal reference page lists its dualities.' },
  ],
};
```

(Imports of helpers/models as needed; exact `pretty` strings like `'q'` are validated by the Task 3 battery — if a `selectedIs`/`hasFormula` target doesn't round-trip, fix the target string.)

- [ ] **Step 3: CTL EF pilot reference + tutorial in `src/learn/content/ctl.ts`**

```ts
export const REF_CTL_EF: ReferenceDoc = {
  id: 'ctl-EF', logic: 'ctl', symbol: 'EF φ', name: 'Exists-Finally (reachability)',
  informal: 'EF φ holds at a state when some path from it reaches a state where φ holds — φ is possibly reachable. The book reads it as "some path goes through a state in which φ is true"; because the future includes the present, a state satisfying φ satisfies EF φ itself.',
  formal: 'M,s ⊨ EF φ  iff  there is a path s = s₀ → s₁ → … and some i ≥ 0 with M,sᵢ ⊨ φ.',
  equivalences: ['EF φ ≡ E[⊤ U φ]', 'AG φ ≡ ¬EF ¬φ'],
  patterns: [
    { formula: 'AG (EF restart)', reading: 'from every reachable state it is possible to get back to restart (MCS §5.5.2)' },
    { formula: 'EF (c1 & c2)', reading: 'a bad combination is reachable — safety violation phrased as reachability' },
  ],
  pitfalls: [
    'Possibility is exactly what LTL cannot express: M,s ⊭ φ is not the same as M,s ⊨ ¬φ (the book’s "encoding trick" discussion, MCS §5.2.5).',
    'This tool uses maximal-path semantics at deadlocks: finite paths that end in a deadlock still count as paths for EF.',
  ],
  bookRef: 'MCS §5.5.1–5.5.3', tutorialId: 'tut-ctl-EF',
};

export const TUT_CTL_EF: Tutorial = {
  id: 'tut-ctl-EF', title: 'EF — reachability', logic: 'ctl',
  intro: 'EF is "possibly": some run reaches φ. Built on the book’s two-state substructure example (Fig 5.12).',
  steps: [
    { text: 'Two states from MCS Fig 5.12: `s` (no propositions) can stay at `s` or move to `t`, where `p` holds. **EF p** asks: can we reach `p`? The ✓ verdict says yes from s.',
      setup: { model: M_REACH, formulas: [{ text: 'EF p', logic: 'ctl' }], activeFormulaIndex: 0 } },
    { text: 'Select the `EF p` root in the inspector tree — the sat-set rings show **both** states satisfy it: from `t`, p holds *now*, and the future includes the present.',
      checkpoint: selectedIs('EF p'), solution: { selectSubformulaPretty: 'EF p' }, highlight: 'inspector-tree' },
    { text: 'Turn on **Evidence** to see the witness path s → t drawn on the canvas — the finite path that certifies EF p.',
      checkpoint: evidenceShown(), solution: { showEvidence: true }, highlight: 'inspector-evidence' },
    { text: 'Now break reachability: **delete the transition s → t** (click it, press Delete). The verdict flips to ✗. This is the book’s substructure theorem (5.5.1) in action: removing edges can only shrink what EF reaches — which is why AG EF p can never be expressed in LTL.',
      checkpoint: and(lacksTransition('s', 't'), verdictIs(0, false)), solution: { model: M_REACH_CUT } },
    { text: 'Duality: `AG φ ≡ ¬EF ¬φ` — invariance is the impossibility of reaching a violation. And `EF φ ≡ E[⊤ U φ]`: EF is just Until with a trivial left side. Try the AG tutorial next.' },
  ],
};
```

- [ ] **Step 4: Aggregate + palette/node maps in `src/learn/content/index.ts`**

```ts
import { ReferenceDoc, Tutorial } from '../types';
import { BOOL_REFS, TUT_BOOLEANS } from './booleans';
import { CTL_REFS, CTL_TUTS } from './ctl';

export const REFERENCES: ReferenceDoc[] = [...BOOL_REFS, ...CTL_REFS];
export const TUTORIALS: Tutorial[] = [TUT_BOOLEANS, ...CTL_TUTS];

export function referenceById(id: string): ReferenceDoc | undefined {
  return REFERENCES.find((r) => r.id === id);
}

/** Composer palette label → reference id (extended by Tasks 8–10 as content lands). */
export const REF_BY_PALETTE: Record<string, string> = {
  '∧': 'bool-and', '∨': 'bool-or', '¬': 'bool-not', '→': 'bool-implies', '↔': 'bool-iff',
  'EF': 'ctl-EF',
};

/** Inspector node kind → reference id, per logic (extended by Tasks 8–10). */
export function refIdForNode(logic: string, kind: string): string | null {
  const shared: Record<string, string> = { and: 'bool-and', or: 'bool-or', not: 'bool-not', implies: 'bool-implies', iff: 'bool-iff' };
  if (shared[kind]) return shared[kind];
  if (logic === 'ctl' && kind === 'EF') return 'ctl-EF';
  return null;
}
```

(Check the actual CTL AST `kind` strings in `src/core/ctl-parser.ts` and the exact palette labels in `src/ui/Composer.tsx` before finalizing the maps; use whatever strings the code really uses.)

- [ ] **Step 5: Typecheck + full suite + commit**

```bash
npm test
git add src/learn/content
git commit -m "feat(learn): shared models, boolean + EF pilot content"
```

---

### Task 3: Content validation battery + replay harness

**Files:**
- Create: `src/learn/replay.ts`
- Test: `src/learn/content/content.test.ts`

The battery is the safety net for ALL content, current and future — Tasks 8–10 add content without adding tests because this file validates every tutorial generically.

- [ ] **Step 1: Replay harness (non-test module so jsdom tests can reuse it)**

```ts
// src/learn/replay.ts — pure simulation of the app state a tutorial drives
import { KripkeStructure } from '../core/kripke';
import { Logic, PendingLasso } from '../ui/types';
import { LearnView, StepSetup } from './types';
import { prettyOfNode, findNodeByPretty, parseForLogic } from './engine';
// Verdict computation MUST mirror App's analyses: use the same checker entry
// points App.tsx uses (checkCTL + initial-state conjunction for 'ctl',
// checkLTLAllPaths verdict for 'ltl', checkCTLStar verdict for 'ctlstar').
// Read src/ui/App.tsx analyses memo and replicate its verdict logic exactly.

export interface SimState {
  model: KripkeStructure;
  formulas: { text: string; logic: Logic }[];
  activeFormulaIndex: number;
  selectedNodeId: number | null;
  viewTab: string;
  trace: PendingLasso | null;
  showEvidence: boolean;
}

export function initialSim(): SimState { /* empty model, no formulas, tab 'model' */ }

export function applySim(s: SimState, setup: StepSetup): SimState {
  const next = { ...s };
  if (setup.model) next.model = structuredClone(setup.model);
  if (setup.formulas) { next.formulas = setup.formulas.map((f) => ({ ...f })); next.activeFormulaIndex = -1; next.selectedNodeId = null; }
  if (setup.activeFormulaIndex !== undefined) { next.activeFormulaIndex = setup.activeFormulaIndex; next.selectedNodeId = null; }
  if (setup.selectSubformulaPretty !== undefined) {
    const f = next.formulas[next.activeFormulaIndex];
    next.selectedNodeId = f ? findNodeByPretty(f.logic, f.text, setup.selectSubformulaPretty) : null;
  }
  if (setup.viewTab) next.viewTab = setup.viewTab;
  if (setup.trace !== undefined) next.trace = setup.trace;
  if (setup.showEvidence !== undefined) next.showEvidence = setup.showEvidence;
  return next;
}

export function viewOf(s: SimState): LearnView { /* compute verdicts via checkers as above; selectedSubformulaPretty via prettyOfNode */ }
```

- [ ] **Step 2: The battery**

```ts
// src/learn/content/content.test.ts
import { describe, expect, it } from 'vitest';
import { REFERENCES, TUTORIALS, referenceById, REF_BY_PALETTE } from './index';
import { parseForLogic } from '../engine';
import { initialSim, applySim, viewOf } from '../replay';
import { stepKind } from '../engine';

describe('reference docs', () => {
  for (const r of REFERENCES) {
    it(`${r.id} is complete and well-formed`, () => {
      expect(r.informal.length).toBeGreaterThan(40);
      expect(r.formal.length).toBeGreaterThan(10);
      expect(r.bookRef).toMatch(/^MCS/);
      for (const p of r.patterns) {
        const logic = r.logic === 'shared' ? 'ctl' : r.logic;
        expect(parseForLogic(logic, p.formula), `${r.id} pattern ${p.formula}`).not.toBeNull();
      }
      if (r.tutorialId) expect(TUTORIALS.some((t) => t.id === r.tutorialId)).toBe(true);
    });
  }
  it('palette map targets exist', () => {
    for (const id of Object.values(REF_BY_PALETTE)) expect(referenceById(id)).toBeTruthy();
  });
});

describe('tutorial replay', () => {
  for (const t of TUTORIALS) {
    it(`${t.id}: models valid, formulas parse, checkpoints gated and solvable`, () => {
      let sim = initialSim();
      expect(stepKind(t.steps[t.steps.length - 1])).toBe('info'); // last step concludes
      for (const [i, step] of t.steps.entries()) {
        if (step.setup) sim = applySim(sim, step.setup);
        // model well-formed: transitions reference existing states, ≥1 initial
        const ids = new Set(sim.model.states.map((s) => s.id));
        for (const tr of sim.model.transitions) { expect(ids.has(tr.from)).toBe(true); expect(ids.has(tr.to)).toBe(true); }
        for (const f of sim.formulas) expect(parseForLogic(f.logic, f.text), `${t.id}#${i} ${f.text}`).not.toBeNull();
        if (step.checkpoint) {
          expect(step.solution, `${t.id}#${i} task step needs a solution`).toBeTruthy();
          expect(step.checkpoint(viewOf(sim)), `${t.id}#${i} checkpoint must NOT hold on entry`).toBe(false);
          const solved = applySim(sim, step.solution!);
          expect(step.checkpoint(viewOf(solved)), `${t.id}#${i} solution must satisfy checkpoint`).toBe(true);
          sim = solved; // continue as if the user did it
        }
      }
    });
  }
});
```

- [ ] **Step 3: Run — expect PASS for booleans + EF pilot**: `npm test -- src/learn` (⚠️ if an expectation fails, apply the Semantics guard from the plan header). Full suite: `npm test`.

- [ ] **Step 4: Commit**

```bash
git add src/learn/replay.ts src/learn/content/content.test.ts
git commit -m "test(learn): content validation battery + replay harness"
```

---

### Task 4: Right-pane tabs + LearnPanel (index and reference views)

**Files:**
- Create: `src/ui/LearnPanel.tsx`
- Modify: `src/ui/App.tsx` (right pane render, new state `rightTab`, `learnRefId`)
- Modify: `src/styles.css` (or the stylesheet the repo actually uses — check imports in `src/main.tsx`)
- Test: `src/ui/LearnPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/ui/LearnPanel.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LearnPanel from './LearnPanel';

const noop = () => {};
const base = { refId: null, tutorial: null, view: null, onOpenRef: noop, onStartTutorial: noop,
  onExitTutorial: noop, onNext: noop, onBack: noop, onShowMe: noop } as const;

describe('LearnPanel index', () => {
  it('lists references grouped by logic and opens one', () => {
    const onOpenRef = vi.fn();
    render(<LearnPanel {...base} onOpenRef={onOpenRef} />);
    expect(screen.getByText('CTL')).toBeTruthy();          // group header
    fireEvent.click(screen.getByText('EF φ'));             // symbol row
    expect(onOpenRef).toHaveBeenCalledWith('ctl-EF');
  });
});

describe('LearnPanel reference view', () => {
  it('renders sections and a Start tutorial button', () => {
    const onStart = vi.fn();
    render(<LearnPanel {...base} refId="ctl-EF" onStartTutorial={onStart} />);
    expect(screen.getByText('Exists-Finally (reachability)')).toBeTruthy();
    expect(screen.getByText(/some path from it reaches/)).toBeTruthy();
    expect(screen.getByText(/AG φ ≡ ¬EF ¬φ/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Start tutorial/));
    expect(onStart).toHaveBeenCalledWith('tut-ctl-EF');
    expect(screen.getByText(/← All operators/)).toBeTruthy(); // back link
  });
});
```

- [ ] **Step 2: Run — expect FAIL**: `npm test -- src/ui/LearnPanel.test.tsx`

- [ ] **Step 3: Implement `LearnPanel.tsx`**

Props (tutorial-view props are wired for real in Task 5; render them now):

```tsx
import { LearnView, Tutorial } from '../learn/types';
import { REFERENCES, referenceById } from '../learn/content';
import { stepKind } from '../learn/engine';
import { LOGIC_LABEL } from './types';

interface Props {
  refId: string | null;                       // reference view when set (and no tutorial)
  tutorial: { def: Tutorial; step: number } | null;  // tutorial view when set (wins)
  view: LearnView | null;                     // for live checkpoint status
  onOpenRef: (id: string | null) => void;
  onStartTutorial: (id: string) => void;
  onExitTutorial: () => void;
  onNext: () => void;
  onBack: () => void;
  onShowMe: () => void;
}
```

- **Index view** (`refId === null && tutorial === null`): group `REFERENCES` by `logic` (order: shared, ctl, ltl, ctlstar; headers via `LOGIC_LABEL`, 'Shared' for shared); each row = `symbol` + `name`, click → `onOpenRef(r.id)`.
- **Reference view**: back link `← All operators` → `onOpenRef(null)`; `<h3>{r.name}</h3>`, symbol badge, sections *Meaning* (`informal`), *Formal rule* (`formal` in `<code>`), *Equivalences* (list), *Patterns* (formula `<code>` + reading), *Pitfalls* (list), book ref footer; `Start tutorial ▸` button when `r.tutorialId`.
- **Tutorial view** (used by Task 5): title + `step i+1 / n`, current step `text` rendered with a tiny markdown-lite renderer (**bold**, `code` — a ~15-line regex-split renderer inside this file, no dependency), then:
  - info step → `Next ▸` (or `Finish ✓` on last step) + `◂ Back` (except step 0);
  - task step → live status line: checkpoint satisfied against `view` ? `✓ done — advancing…` : `… waiting for you` + `Show me` button (`onShowMe`);
  - always an `Exit tutorial` link (`onExitTutorial`).

- [ ] **Step 4: Wire into App right pane.** In `App.tsx` add state and replace the right pane block:

```tsx
const [rightTab, setRightTab] = useState<'inspect' | 'learn'>('inspect');
const [learnRefId, setLearnRefId] = useState<string | null>(null);
```

```tsx
<div className="pane right">
  <div className="view-tabs right-tabs">
    <button className={`tab ${rightTab === 'inspect' ? 'active' : ''}`} onClick={() => setRightTab('inspect')}>Inspector</button>
    <button className={`tab ${rightTab === 'learn' ? 'active' : ''}`} onClick={() => setRightTab('learn')}>Learn</button>
  </div>
  {rightTab === 'inspect'
    ? <Inspector … (unchanged props) … />
    : <LearnPanel refId={learnRefId} tutorial={null} view={null}
        onOpenRef={setLearnRefId} onStartTutorial={() => {}} onExitTutorial={() => {}}
        onNext={() => {}} onBack={() => {}} onShowMe={() => {}} />}
</div>
```

CSS: reuse existing `.view-tabs`/`.tab` styles; add `.learn-panel` scroll container, `.learn-ref-section` spacing, `.learn-row` hover — match the file's existing plain-CSS idiom.

- [ ] **Step 5: Run full suite** — `npm test`. Some existing App tests query the right pane; if any assert on Inspector content they still pass (Inspector is the default tab). Fix only genuinely broken selectors, assertions unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/ui/LearnPanel.tsx src/ui/LearnPanel.test.tsx src/ui/App.tsx src/styles.css
git commit -m "feat(learn): right-pane Learn tab with reference index/detail"
```

---

### Task 5: Tutorial runner (sandbox, setups, auto-advance, banner)

**Files:**
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/LearnPanel.tsx` (only if Step 3 of Task 4 left gaps)
- Test: `src/ui/tutorial-runner.test.tsx`

- [ ] **Step 1: Write failing tests** (jsdom, rendering `<App />`; follow the established patterns in existing App tests — localStorage seeding, `firePointer` helper if pointer events are needed; they shouldn't be here):

```tsx
// src/ui/tutorial-runner.test.tsx — outline with real assertions:
// 1. 'starting a tutorial stashes and loads step-0 setup'
//    render App → click Learn tab → click 'EF φ' → 'Start tutorial ▸'
//    expect: canvas shows states named s and t (screen.getByText('s'), getByText('t'));
//    formula list contains 'EF p'; banner 'Tutorial: EF — reachability' visible; step '1 / 5'.
// 2. 'info Next advances; Back returns'
// 3. 'task auto-advances when the user does the thing'
//    advance to the selectedIs('EF p') step; click the 'EF p' node row in the
//    Inspector tree (switch to Inspector tab, click, switch back — or use the
//    Show me button variant in test 4); expect step counter increments.
// 4. 'Show me satisfies the checkpoint'
//    on the evidence task step click 'Show me' → step advances.
// 5. 'Exit restores the pre-tutorial workspace'
//    seed localStorage with a distinctive model/formula before render;
//    start tutorial, advance one step, Exit → distinctive state names/formulas back.
```

Write all five as real tests with concrete queries (mirror query style from the existing App/Composer tests — read one of them first).

- [ ] **Step 2: Run — expect FAIL**: `npm test -- src/ui/tutorial-runner.test.tsx`

- [ ] **Step 3: Implement in App.tsx**

State + refs:

```tsx
const [tutorial, setTutorial] = useState<{ id: string; step: number } | null>(null);
const learnStash = useRef<(SavedState & { activeFormulaId: string | null }) | null>(null);
const pendingTab = useRef<'model' | 'tree' | 'automaton' | 'product' | null>(null);
```

⚠️ **Tab-reset interaction:** App has `useEffect(() => { setViewTab('model'); … }, [activeFormulaId])`. A setup that sets both `activeFormulaIndex` and `viewTab` would be clobbered by that effect. Change the effect to consume `pendingTab`:

```tsx
useEffect(() => { setViewTab(pendingTab.current ?? 'model'); pendingTab.current = null; setGraphHover(null); }, [activeFormulaId]);
```

`applyLearnSetup` (new function, near `loadState`):

```tsx
function applyLearnSetup(s: StepSetup) {
  cancelLayoutAnim();
  if (s.model) history.commit(structuredClone(s.model));
  let fs = formulas;
  if (s.formulas) {
    fs = s.formulas.map((f) => ({ id: freshId('lf'), text: f.text, logic: f.logic }));
    setFormulas(fs);
    setActiveFormulaId(null); setSelectedNodeId(null); setStepIndex(null);
  }
  if (s.activeFormulaIndex !== undefined) {
    const target = fs[s.activeFormulaIndex];
    if (target) { setSelection({ kind: 'formula', id: target.id }); setActiveFormulaId(target.id); setSelectedNodeId(null); setStepIndex(null); }
  }
  if (s.selectSubformulaPretty !== undefined) {
    const idx = s.activeFormulaIndex ?? fs.findIndex((f) => f.id === activeFormulaId);
    const f = fs[idx];
    if (f) setSelectedNodeId(findNodeByPretty(f.logic, f.text, s.selectSubformulaPretty));
  }
  if (s.viewTab) {
    if (s.activeFormulaIndex !== undefined) pendingTab.current = s.viewTab;  // effect will apply it
    else setViewTab(s.viewTab);
  }
  if (s.trace !== undefined) { setRecording(false); setTrace(s.trace); }
  if (s.showEvidence !== undefined) setShowEvidence(s.showEvidence);
}
```

Lifecycle:

```tsx
function startTutorial(id: string) {
  const def = TUTORIALS.find((t) => t.id === id);
  if (!def) return;
  learnStash.current = { model: structuredClone(model), formulas, trace, activeFormulaId };
  setTutorial({ id, step: 0 });
  setRightTab('learn');
  applyLearnSetup(def.steps[0].setup ?? {});
}
function advanceTutorial(delta: 1 | -1) {
  if (!tutorial) return;
  const def = TUTORIALS.find((t) => t.id === tutorial.id)!;
  const next = tutorial.step + delta;
  if (next >= def.steps.length) { exitTutorial(); return; }   // Finish
  if (next < 0) return;
  setTutorial({ ...tutorial, step: next });
  if (delta === 1) applyLearnSetup(def.steps[next].setup ?? {});  // Back re-explains, never re-mutates
}
function exitTutorial() {
  const s = learnStash.current;
  learnStash.current = null;
  setTutorial(null);
  if (s) {
    loadState({ model: s.model, formulas: s.formulas, trace: s.trace ?? null });
    if (s.activeFormulaId) { setActiveFormulaId(s.activeFormulaId); setSelection({ kind: 'formula', id: s.activeFormulaId }); }
  }
}
function showMe() {
  if (!tutorial) return;
  const def = TUTORIALS.find((t) => t.id === tutorial.id)!;
  const sol = def.steps[tutorial.step].solution;
  if (sol) applyLearnSetup(sol);   // auto-advance effect then fires
}
```

`LearnView` projection + auto-advance:

```tsx
const learnView: LearnView = useMemo(() => {
  const idx = formulas.findIndex((f) => f.id === activeFormulaId);
  const active = idx >= 0 ? formulas[idx] : null;
  return {
    model,
    formulas: analyses.map((a) => ({ text: a.entry.text, logic: a.entry.logic, verdict: a.verdict })),
    activeFormulaIndex: idx,
    selectedSubformulaPretty: active && selectedNodeId !== null
      ? prettyOfNode(active.logic, active.text, selectedNodeId) : null,
    viewTab, hasTrace: trace !== null && trace.stateIds.length > 0, showEvidence,
  };
}, [model, analyses, formulas, activeFormulaId, selectedNodeId, viewTab, trace, showEvidence]);

useEffect(() => {
  if (!tutorial) return;
  const def = TUTORIALS.find((t) => t.id === tutorial.id);
  const step = def?.steps[tutorial.step];
  if (step?.checkpoint && step.checkpoint(learnView)) {
    const t = window.setTimeout(() => advanceTutorial(1), 600);  // brief ✓ beat, then advance
    return () => window.clearTimeout(t);
  }
}, [learnView, tutorial]);
```

Banner (inside `.center-stack`, above `.view-body`, only when `tutorial`):

```tsx
{tutorial && (
  <div className="tutorial-banner">
    Tutorial: {TUTORIALS.find((t) => t.id === tutorial.id)!.title} — step {tutorial.step + 1}/{TUTORIALS.find((t) => t.id === tutorial.id)!.steps.length}
    <button className="linkish" onClick={exitTutorial}>Exit</button>
  </div>
)}
```

Pass the real props to `LearnPanel` (replacing Task 4 stubs): `tutorial={tutorial ? { def, step: tutorial.step } : null}`, `view={learnView}`, `onStartTutorial={startTutorial}`, `onExitTutorial={exitTutorial}`, `onNext={() => advanceTutorial(1)}`, `onBack={() => advanceTutorial(-1)}`, `onShowMe={showMe}`. Learn tab button shows a dot while `tutorial` is active: `Learn{tutorial && <span className="learn-dot">●</span>}`.

Highlight ring effect (App-level; anchors added in Task 6):

```tsx
useEffect(() => {
  document.querySelectorAll('.learn-ring').forEach((el) => el.classList.remove('learn-ring'));
  const def = tutorial ? TUTORIALS.find((t) => t.id === tutorial.id) : null;
  const hl = def?.steps[tutorial!.step]?.highlight;
  if (hl) document.querySelector(`[data-learn="${hl}"]`)?.classList.add('learn-ring');
}, [tutorial]);
```

CSS: `.tutorial-banner` (thin amber strip, right-aligned Exit), `.learn-dot` (accent), `.learn-ring { outline: 2px solid #f59e0b; outline-offset: 2px; border-radius: 4px; }`.

- [ ] **Step 4: Run — expect PASS**: `npm test -- src/ui/tutorial-runner.test.tsx`, then full `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx src/ui/LearnPanel.tsx src/ui/tutorial-runner.test.tsx src/styles.css
git commit -m "feat(learn): checkpointed tutorial runner with sandbox stash/restore"
```

---

### Task 6: `?` links from Composer palette and Inspector nodes

**Files:**
- Modify: `src/ui/Composer.tsx`, `src/ui/FormulaPanel.tsx` (thread `onOpenLearn`), `src/ui/Inspector.tsx`, `src/ui/App.tsx`
- Test: `src/ui/learn-links.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/ui/learn-links.test.tsx — real tests for:
// 1. palette buttons with a known reference render a '?' affordance; clicking
//    the one on the EF button opens the Learn tab showing 'Exists-Finally (reachability)'
// 2. selecting a subformula node in the Inspector shows a '? What is EF?' link
//    in the gesture row area; clicking opens the same reference
// 3. palette buttons WITHOUT a mapped reference (if any) render no '?'
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

- App: `function openLearnRef(id: string) { setLearnRefId(id); setRightTab('learn'); }`; pass `onOpenLearn={openLearnRef}` to `FormulaPanel` (→ `Composer`) and `Inspector`.
- Composer: for each palette entry, look up `REF_BY_PALETTE[entry.label]` (the map keys must match the REAL palette labels — check them; snippet buttons like `A[▢ U ▢]` map to the AU/EU reference ids once those exist, leave unmapped until then). Render inside the existing button-row a sibling mini-button:
  `{refId && <button className="learn-q" title="What is this?" data-learn={`palette-${entry.label}`} onClick={() => onOpenLearn(refId)}>?</button>}`
  Also add `data-learn="palette-input"` on the composer input wrapper (used by tutorial highlights).
- Inspector: in `GestureRow` (it already knows the selected node's kind + logic), add at the row end:
  `const refId = refIdForNode(logic, nodeKind); … {refId && <button className="learn-q" onClick={() => onOpenLearn(refId)}>? what is this</button>}`
  Add `data-learn="inspector-tree"` on the subformula-tree container and `data-learn="inspector-evidence"` on the evidence toggle's wrapper (these anchor ids are used by the EF pilot tutorial highlights).
- CSS: `.learn-q` — small, muted, round; hover accent.

- [ ] **Step 4: Run — expect PASS**, full `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Composer.tsx src/ui/FormulaPanel.tsx src/ui/Inspector.tsx src/ui/App.tsx src/ui/learn-links.test.tsx src/styles.css
git commit -m "feat(learn): ? links from palette and inspector into Learn references"
```

---

### Task 7: End-to-end pilot — EF tutorial integration test

**Files:**
- Test: `src/ui/learn-e2e.test.tsx`

- [ ] **Step 1: Write the test** — one long jsdom scenario exercising the full EF tutorial against the REAL app (no mocks):

```
render App (localStorage seeded with a distinctive workspace: model with state
named 'mine', one formula 'AG p')
→ Learn tab → EF reference → Start tutorial
→ assert step 1/5, canvas shows s and t, formula row 'EF p' with ✓
→ Next (info step advances)
→ step 2 is selectedIs('EF p'): click the 'EF p' node row in the Inspector
  (switch to Inspector tab, click node, back to Learn) → await step 3 (vitest
  waitFor; auto-advance has a 600ms delay — use fake timers or waitFor with timeout)
→ step 3 evidence: click 'Show me' → await step 4
→ step 4 cut-the-edge: click 'Show me' → await step 5; assert formula verdict now ✗
→ step 5 is info: click 'Finish ✓'
→ assert workspace restored: state 'mine' back on canvas, formula list shows 'AG p',
  no tutorial banner
```

- [ ] **Step 2: Run — expect PASS with the Task 5 implementation**: `npm test -- src/ui/learn-e2e.test.tsx`. Where it fails, fix the runner (not the test's intent).

- [ ] **Step 3: Full suite + commit**

```bash
npm test
git add src/ui/learn-e2e.test.tsx
git commit -m "test(learn): end-to-end EF tutorial walkthrough"
```

---

## Content tasks (8–10)

Shared rules for all three content tasks — **read before starting**:
- No new test files: Task 3's battery validates everything. Run `npm test -- src/learn` after each content module; apply the **Semantics guard** from the header when an expectation fails.
- Every tutorial's **step-0 setup must pin `model`, `formulas`, and `trace: null`** (leftover user traces must not pre-satisfy later checkpoints). Add this battery assertion in Task 8 (once):
  `expect(t.steps[0].setup?.trace, `${t.id} step 0 must pin trace`).toBeNull();` and require step-0 `model` + `formulas` similarly.
- Every task step needs a `solution`; the last step is always info.
- `selectedIs(…)`/`hasFormula(…)` target strings must round-trip through the logic's `pretty` — the battery tells you the correct string if you guess wrong (fix the string, not the helper).
- Extend `REF_BY_PALETTE` and `refIdForNode` in `content/index.ts` with each operator you add (check real palette labels / AST kind strings). CTL* palette temporal buttons (G F X U) map to the `ltl-*` references — same path semantics; note that in each such reference's `pitfalls` ("in CTL* this operator builds path formulas under A/E").
- Verdict ground truth used below (hand-derived from the definitions; battery re-verifies with the real checkers): on `M_BOOK` — `X r` ✓, `X p` ✗, `F r` ✓, `F G r` ✗ (counterexample lasso s0,s1 loop 0), `G F r` ✓, `G !(p & r)` ✓, `G q` ✗ (counterexample s0,s2 loop 1), `q U r` ✓, `(!p) U r` ✗, `AX r` ✓, `AX q` ✗, `EX (q & r)` ✓, `EX (p & q)` ✗, `AF r` ✓, `AG (p | q | r)` ✓, `AG q` ✗, `A[q U r]` ✓, `A[q U (p & r)]` ✗, `E[q U r]` ✓, `E[(p & q) U r]` ✓, `E (G (F p))` ✓ (CTL*), `E (G p)` ✗ (CTL*), `A (F r)` ✓ (CTL*), `A (G (F r))` ✓ (CTL*); on `M_ESCAPE` — `EG p` ✓, `AG p` ✗, `AF (! p)` ✗ (a-self-loop counterexample; deleting a→a flips it to ✓), `EG p & AG (EX (! p))` ✓; on `M_DEAD` — `AF (AX false)` ✓ ("every run eventually deadlocks", maximal-path semantics).

### Task 8: LTL content — X, F, G, U

**Files:** Create `src/learn/content/ltl.ts`; modify `src/learn/content/index.ts` (aggregate + maps), `src/learn/content/content.test.ts` (the step-0 assertions above).

- [ ] **Step 1: References.** Four `ReferenceDoc`s, ids `ltl-X/F/G/U`, all `bookRef` `'MCS §5.2'`, `tutorialId` `tut-ltl-<op>`:
  - **X** (`X φ`, "Next"): informal — φ holds in the path's next state; the only operator no combination of the others can express. formal — `π ⊨ X φ iff π¹ ⊨ φ`. equivalences: `¬X φ ≡ X ¬φ (self-dual)`. patterns: `G (p -> X q)` "p is always immediately followed by q". pitfalls: next STATE, not next moment p changes; in CTL* builds path formulas under A/E.
  - **F** (`F φ`, "Finally / eventually"): informal — φ holds now or in some future state; the future includes the present. formal — `π ⊨ F φ iff ∃i ≥ 0 : πⁱ ⊨ φ`. equivalences: `F φ ≡ ⊤ U φ`, `¬F φ ≡ G ¬φ`, `F F φ ≡ F φ`. patterns: `G (req -> F ack)` "every request is eventually acknowledged (MCS §5.2.3)", `F (G waiting)` "the run eventually stabilizes into waiting forever". pitfalls: `F G φ` and `G F φ` differ — order matters; no deadline, "eventually" may take arbitrarily long.
  - **G** (`G φ`, "Globally / always"): informal — φ holds at every state from now on; invariants live here. formal — `π ⊨ G φ iff ∀i ≥ 0 : πⁱ ⊨ φ`. equivalences: `¬G φ ≡ F ¬φ`, `G φ ≡ φ ∧ X G φ (unfolding)`. patterns: `G (!(c1 & c2))` "mutual exclusion, the book's safety property (MCS §5.2.5)", `G (F enabled)` "enabled infinitely often — a fairness constraint is exactly a G F condition (MCS §5.3)". pitfalls: `G φ ⇒ φ` (present included); a single ✗ position kills the whole path.
  - **U** (`φ U ψ`, "Until"): informal — ψ eventually holds, and φ holds at every state strictly before that; the book's smoke/sick example: "I will smoke until I get sick" really promises sickness happens. formal — `π ⊨ φ U ψ iff ∃i ≥ 0 : πⁱ ⊨ ψ and ∀j < i : πʲ ⊨ φ`. equivalences: `F φ ≡ ⊤ U φ`, `φ U ψ ≡ ψ ∨ (φ ∧ X (φ U ψ))`. patterns: `G (up -> (up U floor5))` "once going up, keep going up until floor 5 (MCS §5.2.3)". pitfalls: **U is an obligation** — if ψ never comes, `φ U ψ` fails even when φ holds forever (that weaker reading is W, weak-until, not in this tool — MCS §5.2.4); ψ at position 0 satisfies it immediately, no φ needed.

- [ ] **Step 2: Tutorials.** All on `M_BOOK`, all ~5 steps in the pattern established by `TUT_CTL_EF` (step-0 pins model+formulas+`trace: null`):
  - `tut-ltl-X`: ① info intro `X r` ✓∀ (setup formulas `[{X r, ltl}]`, active 0) — LTL is checked on *paths*; the ∀ verdict means every path from every initial state. ② task add `X p` (`hasFormula('ltl','X p')`; solution adds it) — verdict ✗: s2 lacks p. ③ task get a counterexample trace loaded (`hasTrace()`; text: "click **Load counterexample** on the ✗ formula"; solution `{ trace: { stateIds: ['s0','s2'], loopIndex: 1 } }`) — the timeline matrix shows `X p` ✗ at position 0. ④ info: read the matrix row — X shifts everything one column left. ⑤ info: X is self-dual and inexpressible from F/G/U (MCS §5.2.4).
  - `tut-ltl-F`: ① intro `F r` ✓ (future includes present). ② task add `F G r` (`hasFormula`) — ✗: "eventually always r" demands stabilization. ③ task load its counterexample (`hasTrace()`; solution trace `['s0','s1']` loop 0) — the s0↔s1 loop visits r at s1 forever but never *stays* in r. ④ info: contrast `G F r` (✓ — r infinitely often); the book's p.147 example pair. ⑤ info: dualities + request/response pattern.
  - `tut-ltl-G`: ① intro `G !(p & r)` ✓ — an invariant: no state ever has both. ② task add `G q` (`hasFormula`) — ✗. ③ task load counterexample (`hasTrace()`; solution trace `['s0','s2']` loop 1) — one visit to s2 breaks always-q. ④ info: `G F φ` = "infinitely often" = fairness (MCS §5.3). ⑤ info: duality `¬G ≡ F¬`; unfolding `G φ ≡ φ ∧ X G φ` is literally how the checker works.
  - `tut-ltl-U`: ① intro `q U r` ✓ — q carries until r arrives (arrives at step 1 on every path). ② info: the smoke/sick reading — U promises the right side happens. ③ task add `(!p) U r` (`hasFormula`) — ✗: at position 0, p holds and r doesn't, so the "until" is already broken. ④ task load counterexample (`hasTrace()`; solution trace `['s0','s2']` loop 1). ⑤ info: obligation vs W (weak-until, not in tool); `F φ ≡ ⊤ U φ`.

- [ ] **Step 3:** `npm test -- src/learn`, fix content per battery, then full `npm test`.
- [ ] **Step 4: Commit** — `git add src/learn && git commit -m "feat(learn): LTL operator references + tutorials"`

### Task 9: CTL content — AX, EX, AF, AG, EG, AU, EU

**Files:** Modify `src/learn/content/ctl.ts` (add to existing EF), `src/learn/content/index.ts`.

- [ ] **Step 1: References.** Ids `ctl-AX/EX/AF/AG/EG/AU/EU`, `bookRef` `'MCS §5.5'`, each with `tutorialId`. Required content per doc (own words; informal readings follow the book's §5.5.1 list):
  - **AX** — "in every next state". formal `M,s ⊨ AX φ iff for all s → s′: M,s′ ⊨ φ`. equivalences `AX φ ≡ ¬EX ¬φ`. patterns: `AG (p -> AX q)`. pitfalls: **vacuously true at deadlocks** (no successors → "all successors" is empty); this tool's `AX false` is exactly the deadlock detector.
  - **EX** — "in some next state". formal dual. equivalences `EX φ ≡ ¬AX ¬φ`. patterns: `AG (n1 -> EX t1)` "non-blocking: a process can always request — the book's CTL-only property (MCS §5.2.5/5.5.2)". pitfalls: false at deadlocks for every φ.
  - **AF** — "on every path, eventually". formal `every maximal path from s passes a φ-state`. equivalences `AF φ ≡ ¬EG ¬φ`. patterns: `AG (t1 -> AF c1)` "liveness: every request is eventually served (MCS §5.2.5)", `AF (AX false)` "every run eventually deadlocks (MCS p.160/162)". pitfalls: this tool counts finite maximal paths (deadlock semantics — Inspector warns when it matters); `AF AG φ` is *stronger* than LTL `F G φ` (book Remark 5.5.1).
  - **AG** — "on every path, at every state" = invariantly. formal. equivalences `AG φ ≡ ¬EF ¬φ`. patterns: `AG (!(c1 & c2))` "safety invariant", `AG (EF restart)` "reset always possible — CTL-only (MCS §5.5.2)". pitfalls: `AG` quantifies over *reachable* states only.
  - **EG** — "some path where φ holds forever". formal (maximal path). equivalences `EG φ ≡ ¬AF ¬φ`. patterns: `EG p & AG (EX (! p))` "p can persist forever although it could die at any moment — the book's opening branching-time example (MCS Example 5.2.1), inexpressible in LTL". pitfalls: the witness is a lasso (or a finite maximal path in this tool's deadlock semantics).
  - **AU** — `A[φ U ψ]` "on every path, φ until ψ — and ψ must come". formal. equivalences: book p.162's `A[φ U ψ] ≡ ¬(E[¬ψ U (¬φ ∧ ¬ψ)] ∨ EG ¬ψ)` (display-only). patterns: `A[q U r]`. pitfalls: obligation on every path; no weak variant in the tool.
  - **EU** — `E[φ U ψ]` "some path carries φ until ψ". formal (the book's Prop 10.1.1 finite-path characterization — a *finite* witness suffices). equivalences: `EF φ ≡ E[true U φ]`. patterns: `E[(p & q) U r]` (book p.160). pitfalls: the checker computes it by backward reachability from ψ-states (MCS §10.1) — watch the iteration records in the inspector.
- [ ] **Step 2: Tutorials** (each ~5 steps, same conventions):
  - `tut-ctl-AX` on `M_BOOK`: ① intro `AX r` ✓ (both successors carry r). ② task add `AX q` (`hasFormula`) ✗ — s2. ③ info + setup swap to `M_DEAD` with formulas `[{ text: 'AF (AX false)', logic: 'ctl' }]`, active 0: at a deadlock "every successor" is vacuous — `AX false` marks stuck states, and `AF (AX false)` (✓ here) says every run eventually deadlocks. ④ task select the `AX false` subformula (`selectedIs('AX false')`, solution selects it) — sat set = exactly the deadlock d1. ⑤ info: duality with EX; this vacuity is a deliberate semantic choice documented in the Inspector.
  - `tut-ctl-EX` on `M_BOOK`: ① intro `EX (q & r)` ✓ (book Ex 5.5.1). ② task select its root (`selectedIs(…)` — battery gives the exact pretty). ③ task add `EX (p & q)` ✗ (`hasFormula`) — no successor of s0 has both. ④ info: non-blocking pattern `AG (n1 -> EX t1)` from the book's mutex chapter. ⑤ info: duality; false at deadlocks.
  - `tut-ctl-AF` on `M_ESCAPE`: ① intro `AF (! p)` ✗ — the a-self-loop is a run where p never dies; evidence shows it. ② task turn on evidence (`evidenceShown()`). ③ task **delete a → a** (`and(lacksTransition('a','a'), verdictIs(0, true))`, solution `{ model: M_ESCAPE_CUT }` — add that constant to models.ts: `M_ESCAPE` minus the a→a transition) — now every run must fall to b: AF flips ✓. ④ info: `AF ≡ ¬EG¬` — you just destroyed EG p's witness. ⑤ info: liveness patterns + deadlock-semantics note.
  - `tut-ctl-AG` on `M_BOOK`: ① intro `AG (p | q | r)` ✓ — invariant over all reachable states. ② task add `AG q` ✗. ③ task evidence (`evidenceShown()`) — counterexample path into s2. ④ info + setup swap to `M_REACH` formulas `[{ 'AG (EF p)', ctl }]`: the book's ψ1 — always-possibly-p, the classic CTL-not-LTL formula (Thm 5.5.1). ⑤ info: duality `AG ≡ ¬EF¬`.
  - `tut-ctl-EG` on `M_ESCAPE`: ① intro `EG p` ✓ — witness: stay on the a-loop forever. ② task select `EG p` root (`selectedIs('EG p')`). ③ task delete a → a (`and(lacksTransition('a','a'), verdictIs(0, false))`, solution `M_ESCAPE_CUT`). ④ info + restore `M_ESCAPE` with formulas `[{ 'EG p & AG (EX (! p))', ctl }]` ✓: the book's Example 5.2.1 — p *can* stay true forever although at every moment it *could* become false; branching time in one formula. ⑤ info: duality; lasso witnesses.
  - `tut-ctl-AU` on `M_BOOK`: ① intro `A[q U r]` ✓ — every path: q carries, r arrives at step 1. ② task add `A[q U (p & r)]` (`hasFormula`) ✗ — the goal never occurs, and **U fails when the goal never comes**, even though q holds along the way. ③ task select the failing root (`selectedIs(…)`). ④ info: this is the U-obligation again — weak-until would accept it (not in tool, MCS §5.2.4). ⑤ info: the p.162 duality chain.
  - `tut-ctl-EU` on `M_BOOK`: ① intro `E[q U r]` ✓. ② task add the book's own `E[(p & q) U r]` (`hasFormula`) ✓ (MCS p.160). ③ task add `E[true U r]` (`hasFormula`) — compare with `EF r`: same sat set, `EF` *is* sugar for it. ④ info: how the checker computes EU backwards from r-states (MCS §10.1) — open the iteration steps in the Inspector. ⑤ info: duality/relatives.
- [ ] **Step 3:** `npm test -- src/learn`, then full `npm test`.
- [ ] **Step 4: Commit** — `git add src/learn && git commit -m "feat(learn): CTL operator references + tutorials"`

### Task 10: CTL* content — A and E

**Files:** Create `src/learn/content/ctlstar.ts`; modify `src/learn/content/index.ts`.

- [ ] **Step 1: References.** Ids `star-A`, `star-E`, `bookRef` `'MCS §5.4'`:
  - **A** (`A α`, "on every path"): informal — turns a path formula into a state formula: α must hold on *every* path from here; plain LTL formulas are implicitly A-quantified (Prop 5.4.1: `M,s ⊨_LTL α iff M,s ⊨_CTL* A α`). formal — `M,s ⊨ A α iff for every path π from s: M,π ⊨ α`. equivalences `A α ≡ ¬E ¬α`. patterns: `A (G (F r))` "on every path, r happens infinitely often". pitfalls: `A` binds a whole *path* formula — `A (F (G p))` is NOT the CTL `AF AG p` (book §5.5.3/Remark 5.5.1); state formulas inside restart path quantification.
  - **E** (`E α`, "on some path"): informal — some path from here satisfies α; the quantifier LTL lacks (the book's "encoding trick" only negates it, §5.2.5). formal dual. equivalences `E α ≡ ¬A ¬α`. patterns: `E (G (F p))` "some path visits p infinitely often — the book's ψ4, in CTL* but in neither LTL nor CTL (§5.5.3)". pitfalls: needs an infinite-path witness; this tool checks it per-state with a Büchi product — see the Automaton/Product tabs.
- [ ] **Step 2: Tutorials**, both on `M_BOOK`:
  - `tut-star-A`: ① intro setup formulas `[{ 'F r', ltl }]` ✓∀ — an LTL formula's ∀ verdict quantifies over all paths implicitly. ② task add CTL* `A (F r)` (`hasFormula('ctlstar', 'A (F r)')`) — same verdict, now the quantifier is *written* (Prop 5.4.1). ③ task add `A (G (F r))` (`hasFormula`) ✓ — mixing G/F under one A: every path hits r infinitely often. ④ info: select nodes in the tree — the inspector tags each node state/path; A is the bridge from path back to state. ⑤ info: duality; CTL is CTL* with quantifiers glued to single operators.
  - `tut-star-E`: ① intro `E (G (F p))` ✓ — some path (the s0↔s1 loop) sees p infinitely often; the book's ψ4, expressible in neither LTL nor CTL. ② task select its `G (F p)` path-subformula (`selectedIs(…)` — battery-verified pretty). ③ task check the **Automaton** tab (`tabIs('automaton')`, solution `{ viewTab: 'automaton' }`) — the Büchi automaton the checker ran for this quantifier. ④ task add `E (G p)` (`hasFormula`) ✗ — no path can stay in p-states forever (no p-cycle). ⑤ info: duality `E ≡ ¬A¬`; the per-state product check (MCS ch.10's construction, factored as automaton × model).
- [ ] **Step 3:** `npm test -- src/learn`, then full `npm test`.
- [ ] **Step 4: Commit** — `git add src/learn && git commit -m "feat(learn): CTL* quantifier references + tutorials"`

---

### Task 11: Finish — map completeness, suite, docs

**Files:** Modify `src/learn/content/index.ts`, `src/learn/content/content.test.ts`.

- [ ] **Step 1: Map-completeness test** (add to `content.test.ts`): every palette label in `Composer.tsx`'s three palettes that denotes an operator with a reference must appear in `REF_BY_PALETTE` (import the palette or duplicate the label lists as fixtures with a comment); every `ReferenceDoc` with a `tutorialId` resolves; every tutorial id is referenced by exactly one `ReferenceDoc` **except** `tut-booleans` (shared by the five boolean docs — assert ≥1 instead).
- [ ] **Step 2: Full suite** — `npm test`: everything green (expect ≈ 338 pre-existing + ~35 new).
- [ ] **Step 3: Commit**

```bash
git add src/learn src/ui
git commit -m "test(learn): reference/palette map completeness"
```


