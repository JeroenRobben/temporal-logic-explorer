# LTL on Lasso Traces — Design

**Date:** 2026-08-07
**Status:** Approved
**Prerequisites:** CTL v1 + editor v2 (both merged to master; 72 tests).

## Purpose

Second logic for the Temporal Logic Explorer: LTL formulas evaluated on one **active lasso trace** through the current Kripke structure. Makes the tool bi-logical — `AG EF p` (CTL, against the branching structure) and `G F p` (LTL, against a chosen trace) coexist in one formula list. The LTL header tab becomes live; CTL* stays disabled.

Key decisions from brainstorming: traces are paths in the model (not standalone proposition rows); one active trace at a time; per-formula logic tags (not a global mode switch); trace built by canvas record mode **plus** timeline trim/extend buttons; the timeline shows a **subformula matrix** for the selected LTL formula.

## Core (all pure TS, unit-tested, no React)

### LTL parser (`src/core/ltl-parser.ts`)

Same architecture as `ctl-parser.ts` (lexer → recursive descent → per-parse node ids → pretty-printer → `ParseError {message, pos, hint}`), separate module. AST kinds: `true false prop not and or implies iff` plus `X F G` (unary prefix) and `U` (binary infix, right-associative).

Precedence: unary (`! X F G`) > `U` > `∧` > `∨` > `→` > `↔`. So `F p U q` = `(F p) U q`, `p U q & r` = `(p U q) & r`. The pretty-printer always parenthesizes `U` nodes to keep output unambiguous.

Mode hints: `AG p`, `EF p`, etc. → ParseError with hint "path quantifiers are CTL — in LTL write G p / F p"; `A[p U q]` / `E[p U q]` similarly. (The CTL parser already hints the reverse direction.)

### Trace (`src/core/trace.ts`)

```ts
export interface Lasso { stateIds: string[]; loopIndex: number }
export function validateLasso(model: KripkeStructure, lasso: Lasso): string | null
```

Positions `0..n-1`; the successor of position `n-1` is `loopIndex`. Valid iff non-empty, `loopIndex < n`, all states exist in the model, every consecutive pair is a transition, and `last → stateIds[loopIndex]` is a transition. Helpers: `nextPosition(lasso, i)`, `propsAt(model, lasso, i)`.

The UI holds an in-progress trace as `{ stateIds: string[]; loopIndex: number | null }` — a **prefix-only trace** (loop not yet closed) has `loopIndex: null` and is never passed to the checker; `checkLTL` only accepts complete lassos (non-null `loopIndex`).

### LTL checker (`src/core/ltl-checker.ts`)

```ts
export function checkLTL(model: KripkeStructure, lasso: Lasso, root: LTLNode): Map<number, boolean[]>
```

Per subformula node id: truth value at every position (array length = trace length). Bottom-up over the AST. `prop`/booleans pointwise; `X φ` at `i` = φ at `nextPosition(i)`; `F G U` by backward iteration with a **two-sweep loop fixpoint**: one backward pass initializes, a second pass through the loop portion stabilizes wrap-around dependencies (sufficient because these connectives are monotone in their future values on a lasso). Formula verdict = root row at position 0.

## UI

### Formula panel & tabs

Header tabs LTL and CTL both enabled; the active tab is the **entry mode** — `FormulaEntry` gains a `logic: 'ltl' | 'ctl'` field set at entry time (defaulting to `'ctl'` for saved/imported v1 data). Rows show a small `LTL`/`CTL` badge. CTL rows unchanged. LTL rows: verdict from position 0 against the active trace; `–` with tooltip "build a trace first" when no valid complete trace exists.

### Timeline pane (bottom, ~180px, collapsible)

Appears when a trace exists or an LTL formula is selected.

- **Trace strip:** chips `work → error → reset ⟲` with the loop entry marked; ✕ per chip trims from that position onward; successor buttons extend or close the loop (option-C authoring); "clear trace"; record-mode toggle mirroring the canvas.
- **Matrix:** columns = positions (loop columns tinted, `⟲` bracket); rows = all model propositions (small dots), then every subformula of the selected LTL formula bottom-up, each with its `colorForNode` swatch. Cells ●/○ (green/red).
- **Interactions:** hover a column → highlight that state on canvas; click a subformula row → selects that node (shared `selectedNodeId` with the inspector tree); hover a true `F/U/X` cell → underline the justifying position (witness column, computed from checker rows on the fly).

### Canvas record mode

"⏺ Build trace" toggle (timeline + canvas button). While recording: normal editing suspended; successors of the trace end glow (pulsing ring); clicking one appends; clicking a state already on the trace closes the loop there and exits; Escape exits leaving a prefix-only trace ("no loop yet" hint, verdicts stay `–`). Trace overlay rendering: violet path with numbered badges ①②③ and dashed loop-back edge — distinct from the orange CTL evidence overlay, which is unchanged.

### Inspector

Selected LTL formula: subformula tree with swatches and glosses (`G` = "at every step from here on", `F` = "eventually", `X` = "in the next step", `U` = "left holds until right does"), verdict at position 0, parse errors + hints. **No canvas state-coloring for LTL nodes** — LTL truth is per-position, not per-state; the matrix is its home. Clicking a tree node highlights the matching matrix row.

### Persistence & undo

`SavedState` gains optional `trace?: Lasso | null` (backward-compatible; validated on load, dropped if invalid). Undo/redo (model history) does NOT include trace edits — the trace is separate lightweight state. On every model change the trace is revalidated: broken → cleared with a dismissible notice; intact → kept.

## Error handling

- LTL parse errors mirror CTL's, with symmetric mode hints.
- No trace → LTL verdicts `–`; timeline shows a "build a trace" prompt.
- Model edit invalidating the trace → trace cleared + notice ("trace cleared — it used deleted states/transitions").
- Prefix-only trace → visible, verdicts `–`, "close the loop" hint.
- v1 JSON imports (no `trace`/`logic` fields) load unchanged; missing `logic` defaults to `'ctl'`.

## Testing

- **ltl-parser:** precedence table (incl. U right-assoc, `F p U q`), unicode round-trips, error positions, CTL-ism hints.
- **trace:** validation cases (broken pair, missing loop-back, empty, foreign states).
- **ltl-checker:** hand-computed rows — `G F p` (p in loop vs prefix-only), `F G p`, `p U q` (q in prefix/loop/never), `X` at wrap position, nested `G (p -> F q)`; row lengths; verdict = row[0].
- **UI (jsdom):** LTL badge + `–` without trace; verdicts/matrix with a set trace; trim re-evaluates; deleting a trace state clears trace. Record-mode pointer flow verified manually.

## Out of scope (later iterations)

Full LTL over all paths (Büchi), CTL*, multiple named traces, LTL canvas coloring, R/W operators.
