# Temporal Logic Explorer

A client-side playground for exploring temporal logic formulas against Kripke
structures — built to learn CTL (and eventually LTL and CTL*) by seeing it.

## Run

    npm install
    npm run dev

## Use

- **Canvas:** click empty space (or press `N`) to add a state, drag a state to move it
  (20px grid snap — hold Alt to disable), drag the blue rim handle to another state
  (or itself) to add a transition, click a transition to select it, double-click a
  state to rename inline, right-click for propositions, Delete removes the selection,
  arrows nudge, mouse wheel zooms. Ctrl+Z / Ctrl+Shift+Z undo and redo; the
  Auto-layout button untangles the graph.
- **Formulas (left):** pick LTL / CTL / CTL* with the header tabs and compose with
  live feedback: syntax-highlighted input, errors with one-click fixes as you type,
  clickable proposition chips and operator palette (templates insert ▢ holes — Tab
  jumps between them), and a live plain-English reading of what you wrote. ✎ edits
  a formula in place; selecting a subformula in the inspector offers wrap/negate/
  A↔E-swap gestures.
  CTL: `AX EX AF EF AG EG`, `A[p U q]`, `E[p U q]` — checked against the structure.
  LTL: `X F G`, `p U q` — checked against the current trace. Shared: `! & | -> <->`.
  LTL rows carry two verdicts: on the current trace, and `∀` — over all infinite
  paths, checked by translating ¬φ to a Büchi automaton and searching the product
  with your model for an accepting cycle. When `∀✗`, one click loads the
  counterexample as the active trace. Select an LTL formula to get Model /
  Automaton / Product tabs above the canvas and explore the construction itself.
  CTL*: `A`/`E` quantify arbitrary path formulas — `A F G p`, `A G (E F p)`,
  `E (G F p)` — checked by labeling state subformulas and running the Büchi
  pipeline per state. State subformulas color the canvas; selecting an A/E
  node shows its automaton and product (pseudo-props ⟨…⟩ stand for labeled
  state subformulas); a failing top-level `A` (or holding `E`) loads its
  counterexample (witness) as the active trace.
- **Inspector (right):** select a formula and click a subformula to color the
  states satisfying it; step through fixpoint iterations; toggle
  witness/counterexample paths. Select a state to edit its propositions.
- **Trace (bottom):** press ⏺ and click states on the canvas to walk a path; click a
  state already on the trace to close the loop (lasso). The timeline shows every
  subformula's truth at every position — loop columns tinted, hover a true F/U/X
  cell to see the position that justifies it. Trim with ✕, extend with the
  successor buttons. Canvas clicks close the loop when you revisit a state; the
  timeline's → buttons instead pass through it (for traces that visit a state
  twice before looping).
- **Tree (canvas tab):** unfolds the computation tree from the initial state(s)
  — depth slider 1–6, ⟳ marks where a branch re-enters a visited state. The
  selected state-subformula colors tree nodes; the active trace and the active
  counterexample/witness each light up as a root-downward branch (↓⟳ where they
  continue beyond the shown depth) — a trace is one branch of this tree, which
  is exactly the LTL-vs-branching story.

Everything is checked live on every edit and saved to localStorage.

## Roadmap

LTL on lasso traces → LTL over the structure (Büchi) → CTL*. See
`docs/superpowers/specs/` for the design.
