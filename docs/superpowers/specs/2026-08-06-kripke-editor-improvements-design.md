# Kripke Editor Improvements — Design

**Date:** 2026-08-06
**Status:** Approved
**Scope:** Editor layer only (`Canvas.tsx`, `App.tsx`, `Header.tsx`, `Inspector.tsx`, `types.ts`) plus two new modules. Core checker/parser/evidence untouched.

## Features

### 1. Transition selection & deletion
`Selection` gains a `{ kind: 'transition'; from: string; to: string }` variant. Each edge renders an invisible wide hit path (stroke ~14) above the visible path; clicking it selects the transition (visible path turns blue, width 3). Delete key removes a selected transition. The inspector shows a transition pane ("work → error") with a delete button.

### 2. Undo / redo
Snapshot history of the whole `KripkeStructure` (a few KB at this scale — simplicity over the command pattern). New pure module `src/ui/history.ts` (`init/commit/replace/checkpoint/undo/redo`, capped at 100 entries) wrapped by a `useHistory` hook. Semantics:

- Discrete edits (add/delete state or transition, rename, prop toggle, nudge) → `commit` (one entry each).
- Drags → `checkpoint()` on first movement, then `replace()` per pointermove: the whole drag is one undo entry. Same pattern for auto-layout animation.
- `reset()` on example-load and import (history cleared).

Shortcuts: Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo. Header gains Undo/Redo buttons disabled via `canUndo`/`canRedo`.

### 3. Connect-handle transition drawing (replaces rim/center zones)
Hovering a state shows a small blue arrow handle (r≈9) on the rim, positioned toward the cursor (angle from state center to cursor). Dragging the handle draws the dashed preview edge; dragging anywhere else on the state moves it. The hover region extends to R + handle radius + margin so the handle doesn't flicker while the cursor crosses onto it. The old 9px rim zone is removed.

### 4. Hover affordances
The handle itself (appears on hover), plus: while dragging an edge, the state under the cursor (drop target) gets a highlight ring. Releasing over empty canvas cancels silently.

### 5. Inline rename
Double-click swaps the state's name for an `<foreignObject>` text input on the canvas (autofocused, pre-filled). Enter/blur commits (trimmed, non-empty), Escape cancels. `window.prompt` is gone.

### 6. Canvas proposition toggling
Right-click a state opens a small context menu (absolutely positioned div over the canvas): all propositions with checkboxes plus a "new proposition + Enter" input using the same validation as the inspector (identifier syntax, operator names like AG/EF blocked — the reserved list is shared, exported from Inspector). Closes on outside click / Escape / selecting elsewhere.

### 7. Auto-layout
New pure module `src/core/layout.ts`: `forceLayout(model, iterations=150, k=120): Map<stateId, {x, y}>` — deterministic Fruchterman-Reingold (no randomness: seeds from current positions, coincident states get deterministic jitter; self-loops ignored; original centroid preserved). Header gains an "Auto-layout" button; App animates current → target positions over ~300ms with requestAnimationFrame using `replace()`, after a single `checkpoint()` (whole layout = one undo entry).

### 8. Grid snapping
While dragging states (and when placing new ones), positions snap to a 20px grid; holding Alt disables snapping. Existing positions are never touched retroactively.

### 9. Keyboard-first editing
Handled in Canvas (it owns geometry): `N` adds a state at the last cursor position (snapped; falls back to viewport center), arrow keys nudge the selected state by one grid step (each press = one undo entry, preventDefault to avoid scrolling). Existing App shortcuts (Delete, Escape, Ctrl+Z/Y) remain in App. All shortcuts guard against focus in form controls.

## Canvas prop contract (revised)

```ts
interface CanvasProps {
  model; onChange(m);        // committed edit → history entry
  onPreview(m);              // transient drag update, no history entry
  onBeginEdit();             // checkpoint before a drag sequence
  selectedStateId; selectedTransition: {from,to} | null;
  onSelectState(id); onSelectTransition(t | null);
  highlight; evidence; deadlocks;
}
```

## Error handling

Rename to empty string → cancel (no change). New-prop validation identical to inspector. Layout of an empty model → no-op. Undo at empty stack / redo at empty future → no-op (buttons disabled). Context menu for a deleted state → closes.

## Testing

- `history.ts`: unit tests — commit/undo/redo sequences, replace not creating entries, checkpoint+replace = one entry, cap eviction, reset.
- `layout.ts`: unit tests — empty/single-state, determinism, connected pair ends at reasonable distance, coincident starts don't NaN, centroid preserved.
- Integration (jsdom): undo restores a deleted formula-independent model edit; transition selection variant flows; existing 52 tests keep passing. Canvas pointer interactions remain manually verified (jsdom has no SVG layout).
