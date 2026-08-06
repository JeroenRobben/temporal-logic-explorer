# Temporal Logic Explorer — Design

**Date:** 2026-08-06
**Status:** Approved

## Purpose

A web-based tool for exploring temporal logic formulas (LTL / CTL / CTL*) against Kripke structures, built as a personal learning instrument. Three learning goals, in scope over time: building intuition for the semantics (why `AG EF p` differs from `G F p`), implementing and visualizing the model-checking algorithms themselves, and practicing formula authoring.

**V1 scope:** visual Kripke structure editor + CTL parser + CTL fixpoint model checker, with subformula coloring, fixpoint iteration step-through, and witness/counterexample highlighting. LTL (traces first, Büchi later) and CTL* are future iterations; the architecture anticipates them but v1 implements none of them.

Audience is the author only: features and feedback richness win over polish, onboarding, and shareability.

## Architecture

Fully client-side React + TypeScript + Vite app, deployable as static files. No server.

Two cleanly separated layers:

- **`src/core/`** — pure TypeScript, zero React/DOM dependencies. Kripke structure model, CTL AST + parser, fixpoint checker, evidence extraction. Fully unit-testable without a browser.
- **`src/ui/`** — React components: three-pane layout, SVG canvas, all interaction. UI state (selection, hover, fixpoint step index) lives here and derives everything else from core outputs.

Data flow is one-directional: model or formula edits → re-run checker → UI re-renders from the fresh evaluation record. No caching or incremental checking; full recompute on every change (milliseconds at this scale).

## Core

### Kripke structure (`core/kripke.ts`)

Plain data:

```ts
{
  states: { id, name, propositions: string[], isInitial }[],
  transitions: { from, to }[]
}
```

Per-state position (x, y) is stored alongside but is UI-only metadata the core ignores. The transition relation is not forced to be total; the checker flags deadlock states (no successors) with a warning, since CTL semantics assume totality — itself a teachable moment.

### CTL parser (`core/ctl-parser.ts`)

Hand-written recursive-descent parser (small grammar; hand-writing yields precise, friendly errors).

Syntax: `true`, `false`, propositions, `¬`/`!`, `∧`/`&`, `∨`/`|`, `->`, `<->`; temporal operators `AX EX AF EF AG EG A[φ U ψ] E[φ U ψ]`. Input is ASCII-friendly; formulas pretty-print to Unicode. Parse errors report position + message. Each AST node carries an id so evaluation results key off subformula nodes.

### Checker (`core/ctl-checker.ts`)

Textbook bottom-up fixpoint labeling. Internal normalization only where harmless (e.g. `AF φ` via `A[true U φ]`), but evaluation follows the AST the user wrote so the UI's subformula tree matches their syntax.

Output — the **evaluation record** — per subformula node:

- `sat: Set<stateId>` — final satisfying set
- `iterations: Set<stateId>[]` — for fixpoint operators (EF, EG, AF, AG, EU, AU), the intermediate set per iteration; length 1 for non-fixpoint nodes

Formula verdict = every initial state is in the root node's `sat`. This one record powers coloring, stepping, and verdicts.

### Evidence (`core/evidence.ts`)

For a selected formula and chosen initial state, produce a witness (formula holds) or counterexample (formula fails): e.g. for `EF p` a shortest path to a p-state (recovered BFS-style from the iteration layers); for failing `AG p` a path to a ¬p-state; for `EG p` a lasso inside the p-region. Represented as a path — list of state ids with an optional loop-back index — that the canvas highlights.

Evidence is best-effort: v1 covers the common operators at top level, not arbitrary nesting; the UI states explicitly when it cannot show evidence.

## UI

### Layout

Three-pane: header with logic tabs (LTL and CTL* visible but disabled, labeled as coming later), formula list left (~24%), canvas center, inspector right (~26%).

### Formula panel (left)

Text input adds formulas. Each row: pretty-printed formula + ✓/✗ verdict (or parse-error indicator; details in inspector). Click selects; × removes. All formulas persist and re-check live on any model edit.

### Canvas (center) — custom SVG, no graph library

- Click empty space → new state. Drag from a state's edge → transition (to itself = self-loop, rendered as an arc). Drag state body → move. Click → select. Double-click → rename. Delete key removes selection. Initial-state flag and propositions toggle via inspector or right-click.
- Transitions are curved paths with arrowheads; opposite-direction pairs curve apart.
- **Coloring:** selecting a subformula node in the inspector colors states in its `sat` set (ring/fill). During fixpoint stepping, the current iteration's set is colored with this step's newly-added states emphasized.
- **Evidence:** the selected formula's witness/counterexample renders as an animated dashed overlay along transitions, loop portion marked.
- Pan/zoom kept simple (wheel; background drag).

### Inspector (right) — context-sensitive

- **Formula selected:** subformula tree (indented, matching user syntax), each node clickable with a color swatch; fixpoint stepper (⏮ ◀ i/n ▶ ⏭) for fixpoint nodes; one-line English gloss of hovered operator; per-initial-state verdicts; witness/counterexample toggle.
- **State selected:** name, initial flag, proposition checkboxes (typing a new proposition name adds it globally), plus which of the current formula's subformulas hold at this state.

### Persistence & examples

Model + formulas auto-save to localStorage. Header dropdown with 3–4 canned examples (mutual exclusion; a reset system demonstrating `AG EF`; a deadlock demo). Export/import as JSON download.

## Error handling

- Parse errors inline under the input, with position and a hint. The parser special-cases common LTL-isms (e.g. `FG p` → "in CTL every temporal operator needs a path quantifier, like `AF AG p`").
- Empty model or no initial states → "no verdict" with an explanatory note, never a misleading ✗.
- Deadlock states get a warning badge on the canvas.
- Malformed imported JSON rejected with a message; never crashes the app.

## Testing

Vitest, concentrated on `src/core/`:

- **Parser:** valid/invalid formula tables, precedence, ASCII↔Unicode round-trips, error positions.
- **Checker:** hand-computed small Kripke structures with known answers — `AG EF p` where it holds/fails, `EG` requiring a genuine lasso, until edge cases, expected fixpoint iteration counts.
- **Evidence:** returned paths verified to be real paths in the structure satisfying the claimed property.
- **UI:** a few component smoke tests only; interaction correctness validated by use.

## Future iterations (out of v1 scope)

Build order after v1: LTL on lasso traces (timeline pane docks at the bottom), full LTL over the structure via Büchi automata, CTL* (LTL path-checking recursively invoked), computation-tree unfolding view. Not designed in detail here; each gets its own spec.
