# Full LTL via Büchi Automata — Design

**Date:** 2026-08-07
**Status:** Approved
**Prerequisites:** CTL v1, editor v2, LTL-on-traces (all merged; 105 tests).

## Purpose

Every LTL formula gets a second verdict — holds on **all infinite paths** of the structure — via the classic pipeline: negate φ → translate ¬φ to a Büchi automaton (GPVW tableau) → product with the model → SCC-based emptiness check. A failing check yields a counterexample lasso loadable directly into the existing trace/timeline machinery. The automaton and product are first-class visible artifacts (center-canvas view tabs), because the construction itself is a learning goal.

Decisions from brainstorming: automaton visible & explorable (not engine-only); LTL rows show **both** verdicts (trace + all-paths) side by side; counterexamples load as the active trace; single center canvas with **Model | Automaton | Product** tabs (no split view).

## Core (pure TS, unit-tested)

### Büchi translation (`src/core/buchi.ts`)

```ts
interface BuchiState { id: number; name: string; obligations: string[]; accepting: boolean; initial: boolean }
interface BuchiTransition { from: number; to: number; guard: Literal[] }  // conjunction of literals; [] = true
type Literal = { prop: string; negated: boolean }
interface BuchiAutomaton { states: BuchiState[]; transitions: BuchiTransition[] }
export function ltlToBuchi(root: LTLNode, maxStates?: number): BuchiAutomaton  // throws AutomatonTooLarge
```

Steps:
1. **Negation-normal form** (internal datatype adds R): `¬X φ ≡ X ¬φ`, `¬F φ ≡ G ¬φ`, `¬G φ ≡ F ¬φ`, `¬(φ U ψ) ≡ ¬φ R ¬ψ`, `F φ ≡ true U φ`, `G φ ≡ false R φ`. Implication/iff eliminated first. Users never see R.
2. **GPVW tableau:** states = obligation sets; expansion via `φ U ψ ≡ ψ ∨ (φ ∧ X(φ U ψ))` and `φ R ψ ≡ ψ ∧ (φ ∨ X(φ R ψ))`; X-parts become successor obligations. Literal obligations form the transition **guard checked against the model state being read**; the automaton reads `L(s₀) L(s₁) …` (first state's labeling included).
3. **Generalized-Büchi acceptance** (one set per U-subformula: states where that until is discharged or absent) → **degeneralized** to plain Büchi via the standard counter construction.
4. States carry pretty-printed obligation sets (for the inspector) and generated names `q0, q1, …`.

**Size cap:** default 500 states; exceeding it throws a typed `AutomatonTooLarge` error the UI turns into a `∀⚠` verdict. (Teaching formulas stay under ~20.)

### Product (`src/core/product.ts`)

```ts
interface ProductState { id: string /* `${modelId}×${buchiId}` */; modelStateId: string; buchiStateId: number; accepting: boolean; initial: boolean }
interface ProductGraph { states: ProductState[]; edges: { from: string; to: string }[] }
export function buildProduct(model: KripkeStructure, aut: BuchiAutomaton): ProductGraph
```

`(s, q)` exists iff some automaton transition into `q` (or `q` initial) has its guard satisfied by `propositions(s)` — concretely: initial product states are (initial model s) × (automaton-initial q with guard-satisfying entry); edge `(s,q) → (s',q')` iff model `s→s'` and automaton `q→q'` with `q'`-entry guard satisfied by `propositions(s')`. Deadlock model states yield successor-less product states (harmless — never on a cycle). Only reachable states are materialized.

### Emptiness + counterexample (`src/core/emptiness.ts`)

```ts
export function findAcceptingLasso(product: ProductGraph): { path: string[]; loopIndex: number } | null
```

Tarjan SCCs over the reachable product; non-empty iff some SCC contains an accepting state and has a cycle (≥2 states, or a single state with a self-loop). Extraction: BFS from an initial product state to an accepting state in such an SCC, then a cycle inside the SCC back to it. Projection to model state ids gives a `Lasso` (must pass `validateLasso` — asserted in tests).

### Entry point (`src/core/ltl-allpaths.ts`)

```ts
export type AllPathsResult =
  | { kind: 'holds' }
  | { kind: 'fails'; counterexample: Lasso }
  | { kind: 'too-large' }
  | { kind: 'no-initial' };
export function checkLTLAllPaths(model: KripkeStructure, root: LTLNode):
  AllPathsResult & { automaton?: BuchiAutomaton; product?: ProductGraph }
```

Negates root (wrap in `not`), translates, builds product, checks emptiness. `holds` iff empty. Automaton/product returned for the view whenever translation succeeded. No initial states → `no-initial`. Deadlock-only models (no infinite paths from initial states) come out vacuously `holds` — the existing deadlock warning explains this.

## UI

### Center-canvas view tabs

Tab strip (`Model | Automaton | Product`) appears atop the center pane when the active formula is LTL and parsed. Model = today's editable canvas, untouched. Automaton/Product render via a new read-only **`GraphView`** component (same SVG idioms: circles, curved/self-loop edges via `edgePath`, arrowheads, wheel zoom + drag pan; no editing/handles/recording). Positions from `forceLayout`, computed per graph and cached (recomputed when the formula or model changes). Visuals: accepting = double circle; guards as small monospace edge labels (`¬r`, `p∧q`, `true` for empty); product nodes labeled `work×q1`; initial markers as in the model canvas. Deselecting the LTL formula (or selecting CTL) hides the tabs and reverts to Model.

### Verdicts & formula rows

LTL rows show two marks: the trace verdict (as today) and an all-paths mark prefixed `∀` (`∀✓`, `∀✗`, `∀⚠` too-large, `∀–` no initial states). Tooltips name the semantics. CTL rows unchanged. `Analysis` gains `allPaths?: AllPathsResult`-shaped data for LTL entries.

### Inspector & counterexample flow

LTL formula view additions: all-paths verdict line; automaton stats (automaton states/accepting count, product states); when the Automaton/Product tab is active, hovering a node shows its obligation set / parent pair in a dedicated inspector section (no floating tooltips). On `fails`: a **"Load counterexample as trace"** button — replaces the current trace with the extracted lasso (clearing record mode, clearing any trace notice); the timeline then shows per-position truth on the offending path and the violet overlay draws it on the Model tab.

## Error handling

- `AutomatonTooLarge` → `∀⚠` + inspector note ("automaton exceeds 500 states — simplify the formula").
- No initial states → `∀–` with the existing "mark an initial state" hint.
- Parse errors unchanged (no tabs shown).
- Everything recomputes on every edit; the automaton cap is the runaway guard. All-paths **verdicts** are computed eagerly for every LTL row inside the analyses memo (never stale after model edits); the **graph objects** handed to GraphView (with layout) are derived only for the active formula. If drag-time recomputation proves sluggish, memoize per (formula text, model) — but measure first; teaching-scale inputs are expected to be fine.

## Testing

- **buchi:** NNF correctness table; automaton language sanity for `F p`, `G p`, `G F p`, `p U q` via acceptance simulation on hand-built word prefixes (lasso words); size bounds; too-large throw.
- **product/emptiness:** classics against hand-checked models — `G F r` fails on the reset model (work self-loop counterexample) and holds after removing that self-loop; `F r` / `∀(p U q)` on branching structures; single-state models; deadlock-only models vacuously hold.
- **Cross-checker invariant** (the key test): every extracted counterexample passes `validateLasso` AND `checkLTL(model, cex, φ)` evaluates φ **false** at position 0. Run over a battery of formula/model pairs.
- **UI (jsdom):** LTL rows show both marks; failing formula shows the load-counterexample button; clicking it sets a trace and the timeline renders; tabs appear only for active parsed LTL formulas. GraphView pointer behavior manual.

## Out of scope (later)

CTL* (next), automaton-view step-through animations, on-the-fly product exploration, fairness constraints, R/W surface syntax.
