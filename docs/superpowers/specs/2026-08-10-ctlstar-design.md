# CTL* — Design

**Date:** 2026-08-10
**Status:** Approved
**Prerequisites:** CTL v1, editor v2, LTL-on-traces, Büchi all-paths (all merged; 158 tests).

## Purpose

CTL* as the third and final logic of the original roadmap: state formulas with `A ψ` / `E ψ` over arbitrary path formulas mixing temporal operators and nested state formulas. Completes the tri-logic comparison — `AG EF p` (CTL), `G F p` (LTL, on traces and all-paths), `A F G p` / `A G (E F p)` (CTL*) coexisting in one formula list over one model.

Decisions from brainstorming: evidence for the **top-level quantifier only** (failing root `A ψ` → counterexample lasso; holding root `E ψ` → witness lasso; both load as traces); **Automaton/Product tabs work for the selected A/E subformula** (pseudo-props translated back to state-formula labels).

## Core

### Parser (`src/core/ctlstar-parser.ts`)

`StarNode` = the LTL node kinds (`true false prop not and or implies iff X F G U`) plus `{ kind: 'A' | 'E'; child: StarNode }`, per-parse numeric ids. Grammar = the LTL grammar with `A`/`E` at unary precedence. Consequence (pinned by tests): `A p U q` parses as `(A p) U q`; users write `A (p U q)`. The pretty-printer parenthesizes quantifier children containing binary path operators. Errors with position + hints: `A[p U q]` bracket syntax → "that's CTL — in CTL* write `A (p U q)`"; `AG`-style glued tokens → "space: A G p".

**Classification pass** — `classify(root): Map<id, 'state' | 'path'>`, bottom-up: `prop/true/false` → state; `A/E` → state; boolean connectives → state iff all children state; `X/F/G/U` → path. If the ROOT is path-level → `ParseError`-style error: "temporal operators need a path quantifier here — write A … or E …". Exposed for the checker and the inspector.

### Checker (`src/core/ctlstar-checker.ts`)

```ts
checkCTLStar(model, root): {
  sat: Map<nodeId, Set<stateId>>;      // state-level nodes only
  verdict: boolean | null;             // all initial states ∈ sat(root); null if no initials
  quantifiers: Map<nodeId, {
    automaton: BuchiAutomaton;         // what the checker ran: ¬ψ′ for A-nodes, ψ′ for E-nodes
    labeledModel: KripkeStructure;     // propositions extended with pseudo-props
    legend: Map<string, string>;       // '#12' → pretty(state subformula)
  }>;
}
// throws AutomatonTooLarge upward; UI renders it as a ⚠ verdict
```

Standard recursive CTL* algorithm: bottom-up over state structure. For `A ψ`: build ψ′ by replacing each **maximal state-level subnode** of ψ with pseudo-prop `#<nodeId>` (recursing into those first to compute their sat sets); label a cloned model (`labeledModel`) with pseudo-props per sat; `aut = ltlToBuchi(¬ψ′)`; `sat(A ψ) = { s | findAcceptingLasso(buildProduct(labeledModel, aut, [s])) === null }`. `E ψ` is evaluated as `S ∖ sat(A ¬ψ)`, and its stored automaton is the one for ψ′ (what a witness search runs against); the inspector labels which is shown. Pseudo-prop names `#<id>` are unparseable, so they can never collide with user propositions.

### Product extension (`src/core/product.ts`)

`buildProduct(model, aut, initialIds?: string[])` — optional third parameter overriding which model states seed the product (default: the model's `isInitial` states). Fully backward compatible.

### Evidence (top level only)

Root `A ψ` with a violating initial state s → accepting lasso of `product(labeledModel, aut(¬ψ′), [s])`, projected to model state ids (valid in the real model — same graph). Root `E ψ` holding at initial s → the same search over `aut(ψ′)` gives a witness. Both are `Lasso` values for the existing load-as-trace flow.

## UI

- **Entry:** CTL* header tab live; `Logic` gains `'ctlstar'`; rows badge `CTL*`, single ✓/✗/⚠/– verdict over initial states (no trace verdict). CTL/LTL rows unchanged. Storage: old payloads unaffected (`logic` validation extended to accept `'ctlstar'`).
- **Inspector tree:** state-level nodes → color swatch + click-to-color canvas from `sat` (the CTL experience); path-level nodes → hollow swatch + "path" tag, gloss "path formula — true of paths, not states"; A/E nodes → quantifier gloss + per-initial-state verdicts for that subformula.
- **Tabs:** generalized visibility — active LTL formula (as today), or active CTL* formula with an A/E node selected. Automaton view renders that node's stored automaton (labeled "¬ψ (for A)" / "ψ (for E)"); guard labels translate pseudo-props via the legend (e.g. `#12` → `⟨E F q⟩`); Product view uses the labeled model.
- **Evidence buttons:** root-A failing → "Load counterexample as trace"; root-E holding → "Load witness as trace". Timeline shows chips/prop rows/canvas overlay (the subformula matrix stays LTL-only).
- **Perf:** CTL* checking runs eagerly in the analyses memo, memoized on the structural model key (positions never retrigger), like the LTL pipeline.

## Error handling

Parse errors with the hints above; classification error for bare-temporal roots; `AutomatonTooLarge` → `⚠` verdict + inspector note ("simplify the formula"); no initial states → `–`. Deadlock caveats unchanged (vacuous A over states without infinite paths — existing warning covers it).

## Testing

- **Parser:** grammar table incl. the `A p U q` precedence trap, unicode, hints (`A[p U q]`, glued `AG`), classification table, bare-temporal-root error.
- **Checker — the CTL cross-check battery (this iteration's key gate):** state-set equality between `checkCTLStar` and `checkCTL` on equivalent pairs across several models: `A G (E F p)` ≡ `AG EF p`, `A X p` ≡ `AX p`, `E (p U q)` ≡ `E[p U q]`, `A F p` ≡ `AF p`, `E G p` ≡ `EG p`. Plus beyond-CTL cases hand-checked: `A F G p`, `E (G F p)`; `E ψ` ≡ complement of `A ¬ψ`; nested `A G (p -> E F q)` ≡ `AG (p -> EF q)`.
- **Evidence:** top-level lassos validate via `validateLasso`; for pure-path ψ, counterexamples falsify / witnesses satisfy ψ per `checkLTL`.
- **UI (jsdom):** CTL* row verdict; state-node click colors; A/E selection reveals tabs; evidence button loads a trace.

## Out of scope (later)

Computation-tree unfolding view (last roadmap item), nested-quantifier evidence, R/W surface syntax, automaton-view animations.
