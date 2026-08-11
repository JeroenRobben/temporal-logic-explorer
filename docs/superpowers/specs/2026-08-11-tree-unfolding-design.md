# Computation-Tree Unfolding View — Design

**Date:** 2026-08-11
**Status:** Approved
**Prerequisites:** All three logics merged (CTL, LTL traces + all-paths, CTL*); 210 tests.

## Purpose

The last item of the original design: unroll the Kripke structure from its initial state(s) into the execution tree, making the branching-vs-linear distinction visible — path quantifiers pick branches of this tree; a trace is one root-downward branch of it.

Decisions from brainstorming: **depth slider** (1–6, auto-unfold, no click-to-expand); all three overlays: **trace as a branch**, **evidence as a branch**, **quantifier glosses on hover**; node coloring by the selected state-subformula is the core.

## Core (`src/core/unfold.ts`, pure)

```ts
export interface TreeNode {
  key: string;      // path key: root "0", children "0.0", "0.1", …
  stateId: string;
  depth: number;
  revisit: boolean; // stateId already occurred on this node's root-path
  children: TreeNode[];
}
export function unfoldTree(model: KripkeStructure, rootStateId: string, maxDepth: number): TreeNode
export function countNodes(root: TreeNode): number
```

Children are generated in the model's transition order (deterministic) for nodes with `depth < maxDepth`. `revisit` nodes still expand (the ⟳ marker teaches where infinite regress lives without hiding structure). **Node cap:** the UI clamps the effective depth so total nodes across all roots stay ≤ 800 (computed by trying depths downward from the slider value), with a visible notice when clamped.

## UI

### Tree tab

Center-canvas tab row becomes `Model | Tree | [Automaton | Product]` — Tree is always present when the model has ≥ 1 initial state (model-centric, independent of formula selection); Automaton/Product stay contextual. Hidden (with fallback to Model) when no initial states exist.

### `src/ui/TreeView.tsx` (read-only)

- One tree per initial state, side by side; pan/zoom (GraphView idioms; wheel non-passive, drag pan, no editing).
- **Tidy-tree layout**, deterministic: leaves get sequential x-slots (~70px), parents center over their children; y = depth × ~90px. No force layout.
- Toolbar above the canvas: depth slider (1–6, default 3, component state only) + node count + clamp notice when active.
- Node rendering: small circles (r≈16) with state names; ⟳ suffix on revisit nodes; edges plain.

### Overlays

- **Subformula coloring (core):** the selected inspector node's sat set — CTL (`record.results`) or CTL* (`starResult.sat`) — colors every tree node whose `stateId` ∈ sat (ring in `colorForNode`). LTL formulas provide no state sets → no coloring (tab still functions).
- **Trace branch:** the active trace's state sequence maps onto each tree as the root-downward branch matching its prefix (greedy walk: from the root, follow the child whose `stateId` matches the next trace position; stop at depth bound). Violet, matching the canvas overlay; a ↓⟳ marker at the cut-off signals continuation/loop beyond view. Only drawn on trees whose root matches the trace start.
- **Evidence branch:** the active evidence lasso (CTL evidence path, LTL ∀-counterexample, CTL* witness/counterexample) renders identically in the evidence orange.
- **Quantifier gloss:** hovering a tree node while a quantified subformula is selected (CTL temporal or CTL* A/E) feeds the existing inspector hover panel with tree-terms text: universal quantifiers → "must hold along every branch below this node"; existential → "one branch below suffices". Non-quantified selection → node's state name + propositions.

## Error handling

No initial states → Tree tab hidden. Node cap ≤ 800 with clamp notice. Depth resets to 3 on remount (not persisted). Deleting states/transitions while on the Tree tab recomputes automatically (pure derivation from model).

## Testing

- **unfold:** shape/keys on the reset example (depth 2/3), revisit marking (self-loop child flagged), depth-0 root only, determinism, countNodes.
- **Layout:** unit-testable helper — no two nodes at the same depth share an x-slot; parents centered.
- **UI (jsdom):** Tree tab appears for the default example and renders the expected node count at depth 3; selecting a CTL subformula colors tree nodes (assert ring elements); loading a trace draws the branch (assert violet path elements); no-initial-state model hides the tab.
- Pointer flows (pan/zoom) verified manually.

## Out of scope

Click-to-expand branches, animation of unfolding, LTL per-position coloring on tree branches, exporting tree images.
