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
- **Formulas (left):** type CTL, press Enter. ASCII syntax: `! & | -> <->`,
  `AX EX AF EF AG EG`, `A[p U q]`, `E[p U q]`.
- **Inspector (right):** select a formula and click a subformula to color the
  states satisfying it; step through fixpoint iterations; toggle
  witness/counterexample paths. Select a state to edit its propositions.

Everything is checked live on every edit and saved to localStorage.

## Roadmap

LTL on lasso traces → LTL over the structure (Büchi) → CTL*. See
`docs/superpowers/specs/` for the design.
