# Operator Explanations & Guided Tutorials ("Learn") — Design

**Date:** 2026-08-14
**Status:** Approved
**Prerequisites:** Full tri-logic app + composer (338 tests, master).
**Source material:** MCS.pdf (Denecker, *Modelling of Complex Systems*, KU Leuven 2018), ch. 5 (§5.2 LTL, §5.4 CTL*, §5.5 CTL) and ch. 10 (algorithms). Content is **book-informed but written in our own words** — book structure, conventions, and examples (rebuilt as tool models), no verbatim text. Divergences from the book (our maximal-path CTL deadlock semantics; W/R not surfaced) are called out explicitly in the content, not papered over.

## Purpose

Every operator in the tool gets (a) a **reference explanation** — informal semantics, formal rule, dualities/equivalences, practical patterns, pitfalls — and (b) an **interactive guided tutorial** that drives the real app: each step loads a small example model + formula, directs attention ("select the EG node; note s1 is in its sat set"), and task steps only advance when the user actually does the thing (checkpoint predicates over live app state). Learning by doing, per Jeroen's goals.

Decisions from brainstorming: **interactive checkpointed tutorials** (approach A; no DOM-spotlight machinery — at most a CSS highlight ring via stable data-attributes); **all current operators** (~15 tutorials; W/R remain future work); **Learn panel + `?` links everywhere**; content **book-informed, own words**.

## Coverage

| Tutorial | Logic | Reference also covers |
|---|---|---|
| booleans | shared | ¬ ∧ ∨ → ↔ (one tutorial, five reference entries) |
| X, F, G, U | LTL | duality F/G, U-equivalences, W/R as "not in tool yet" notes |
| AX, EX, AF, EF, AG, EG, AU, EU | CTL | pair dualities (AX≡¬EX¬ …), EF≡E[⊤ U ·], deadlock divergence notes |
| A, E | CTL* | LTL embedding A[α], state-vs-path classification |

## Architecture

New `src/learn/` (content + pure engine) plus a Learn UI panel. App gains a small "tutorial session" state (active tutorial id, step index, stashed pre-tutorial workspace).

### `src/learn/types.ts` (pure)

```ts
interface ReferenceDoc {
  id: string;               // 'ltl-U', 'ctl-EG', 'bool-and', 'star-A', …
  logic: Logic | 'shared';
  symbol: string;           // display form, e.g. 'E[φ U ψ]'
  name: string;             // 'Exists-Until'
  informal: string;         // book-informed prose (own words)
  formal: string;           // satisfaction rule, book-style notation
  equivalences: string[];   // e.g. 'AG φ ≡ ¬EF ¬φ'
  patterns: { formula: string; reading: string }[];  // practical spec patterns
  pitfalls: string[];       // incl. deadlock-semantics divergence where relevant
  bookRef: string;          // e.g. 'MCS §5.5.1'
  tutorialId?: string;
}

interface TutorialStep {
  text: string;                     // step instruction/explanation (markdown-lite: **bold**, `code`)
  setup?: StepSetup;                // applied on entering the step
  checkpoint?: (v: LearnView) => boolean;  // task step: auto-advance when true
  solution?: StepSetup;             // "show me" — applying it must satisfy checkpoint (tested)
  highlight?: string;               // data-learn anchor id to ring, e.g. 'palette-EG'
}
interface StepSetup {               // declarative app mutations, all optional
  model?: KripkeStructure;
  formulas?: { text: string; logic: Logic }[];
  activeFormulaIndex?: number;      // → activeFormulaId after load
  selectSubformulaPretty?: string;  // select inspector node whose pretty matches
  viewTab?: 'model' | 'tree' | 'automaton' | 'product';
  trace?: Lasso | null;
}
interface Tutorial {
  id: string; title: string; logic: Logic | 'shared';
  intro: string; steps: TutorialStep[];
}
interface LearnView {               // read-only projection of app state for checkpoints
  model: KripkeStructure;
  formulas: { text: string; logic: Logic; verdict?: boolean | null }[];
  activeFormulaIndex: number;
  selectedSubformulaPretty: string | null;
  viewTab: string;
  hasTrace: boolean;
}
```

Checkpoints are plain TS functions in content modules — pure over `LearnView`, unit-testable. Setups are data; App owns the single `applySetup` that executes them (model load commits to history; formulas replace the list; selection resolved by pretty-string match).

### `src/learn/content/` (pure data modules)

One module per logic area: `booleans.ts`, `ltl.ts`, `ctl.ts`, `ctlstar.ts`, aggregated by `src/learn/content/index.ts` exporting `REFERENCES: ReferenceDoc[]` and `TUTORIALS: Tutorial[]`. Example models are small (3–5 states) and book-derived: the three-state `{p,q}/{q,r}/{r}` structure of Exercise 5.5.1, the two-state AG EG p structure of Fig 5.12, the deadlock remark model of p.162, mutual-exclusion-style shapes where useful.

### `src/learn/engine.ts` (pure)

`stepState(tutorial, stepIndex, view) → { kind: 'task' | 'info', done: boolean }`; `canAdvance`, `isLast`. Trivial by design — the substance lives in content + App wiring; keeping it pure makes the whole step lifecycle testable without React.

### UI

- **Right-pane tabs:** the right pane becomes `Inspector | Learn` tabs (Inspector default; Learn badge dot while a tutorial is active). `src/ui/LearnPanel.tsx`:
  - *Index view:* operators grouped by logic (symbol + name + one-liner); click → reference view.
  - *Reference view:* renders `ReferenceDoc` sections; **Start tutorial** button when `tutorialId` set.
  - *Tutorial view:* step counter, step text, Back / Next (info steps) or live checkpoint status ✓/… (task steps) with **Show me** fallback, Exit. Auto-advance on checkpoint satisfaction (checked on every app-state change, debounce-free — checks are cheap pure predicates).
- **Sandbox:** starting a tutorial stashes `{model, formulas, trace, activeFormulaId}`; exit (or finish) restores it. Uses the existing history commit/replace so undo stays coherent. A slim banner over the canvas signals tutorial mode ("Tutorial: EG — step 3/7 · Exit").
- **`?` links:** Composer palette buttons and Inspector subformula nodes get a small `?` affordance opening the Learn tab at the matching reference (operator → reference id map in `src/learn/content/index.ts`). Anchors use `data-learn` attributes; the active step's `highlight` id gets a CSS ring.

## Error handling

- Content validated by tests, not at runtime; `applySetup` ignores unknown pretty-match selections (no throw), and a checkpoint referencing missing state simply stays unsatisfied.
- Exiting mid-tutorial always restores the stash, including via the banner during any step.
- Deleting the Learn-active formula or editing the model during a tutorial is allowed (it's the point); checkpoints re-evaluate from whatever state results.

## Testing

- **Content battery (the safety net):** for every tutorial, replay all steps applying `setup`; assert every model is well-formed (transitions reference states), every formula parses in its logic, every checkpoint is *not* satisfied by its own step's entry state (no auto-skip) **and is** satisfied after applying its `solution`. For every ReferenceDoc: non-empty sections, `patterns` formulas parse in the doc's logic (`equivalences` are display-only strings containing metavariables), `tutorialId`/`id` cross-links resolve.
- **Engine units:** task/info classification, advance gating, last-step handling.
- **jsdom integration:** Learn tab renders index; `?` on a palette button opens the right reference; full run-through of one pilot tutorial (EF): start → stash → step setups mutate app → satisfy a checkpoint by clicking in the real UI → finish → workspace restored; Show me satisfies a checkpoint; Exit mid-way restores.
- Existing 338 tests stay green.

## Out of scope

W/R operators (surface syntax), fairness content, DOM spotlight/driver.js overlays, progress persistence across sessions, quizzes/scoring, NL content localization.
