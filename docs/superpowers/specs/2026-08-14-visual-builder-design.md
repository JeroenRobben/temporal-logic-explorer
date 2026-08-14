# Visual AST Formula Builder — Design

**Date:** 2026-08-14
**Status:** Approved
**Prerequisites:** Composer + pattern library merged (474 tests, master).
**Series:** Iteration 3 of 3 (composer ✓ → pattern library ✓ → **visual builder**).

## Purpose

Build formulas structurally instead of textually: start from a single hole, click a hole to get a palette of exactly the operators/propositions legal at that position (logic- and context-aware), picking one creates child holes; any node can be replaced, wrapped, or deleted back to a hole. The builder is a mode of the composer — builder edits pretty-print into the draft (with `▢` holes), so the existing status line, save flow, and hole discipline keep working unchanged.

Decision from brainstorming: **hole-driven tree builder** (no drag-and-drop; no inspector-tree editing).

## Data model (`src/builder/htree.ts`, pure)

The builder cannot use the parsers' ASTs (they reject holes), so it owns a hole-tolerant tree:

```ts
export type HNode =
  | { kind: 'hole' }
  | { kind: 'prop'; name: string }
  | { kind: 'const'; value: boolean }              // true / false
  | { kind: 'op'; op: OpId; children: HNode[] };   // arity fixed per op

export type OpId =                                  // per-logic catalogs reference these
  | 'not' | 'and' | 'or' | 'implies' | 'iff'
  | 'X' | 'F' | 'G' | 'U'                           // LTL + CTL* path level
  | 'AX' | 'EX' | 'AF' | 'EF' | 'AG' | 'EG' | 'AU' | 'EU'  // CTL
  | 'A' | 'E';                                      // CTL* quantifiers
```

Paths address nodes as child-index lists (`[] = root`, `[0,1] = second child of first child`). Pure operations, all total (invalid path → unchanged tree):

- `nodeAt(tree, path)`, `replaceAt(tree, path, node)` — picking a palette entry replaces a hole (or an existing node) with `op` + hole children / prop / const;
- `wrapAt(tree, path, op)` — node becomes first child of the new op, remaining children holes;
- `deleteAt(tree, path)` — node collapses back to a hole (root included);
- `toText(tree, logic): string` — pretty-prints with `▢` for holes, fully parenthesized the way the composer's snippet templates already are (`(▢ & ▢)`, `A[▢ U ▢]`, `A (▢)` for CTL* quantifiers); MUST round-trip: for hole-free trees, `parse(toText(t))` succeeds and `pretty` agrees structurally;
- `fromAst(logic, text): HNode | null` — seeds the builder from a parseable draft (null on parse error; the caller then starts from a bare hole);
- `holes(tree): Path[]`, `isComplete(tree)`.

## Legality (`src/builder/catalog.ts`, pure)

`optionsFor(logic, tree, path): { ops: OpId[]; props: boolean; consts: boolean }` — what the palette offers at a hole:

- **CTL:** booleans + the eight CTL pairs everywhere; props/consts everywhere.
- **LTL:** booleans + X F G U everywhere; props/consts everywhere.
- **CTL\*:** context-sensitive — a hole is *path-level* iff it sits strictly inside an `A`/`E` subtree (any depth, since path formulas compose); at state level (root and inside pure-boolean context outside quantifiers) the palette offers booleans + `A`/`E` + props/consts but NOT bare temporal operators (they'd make the root path-level, which `classify` rejects); at path level everything is offered (booleans, temporals, nested `A`/`E`, props). This mirrors `ctlstar-parser`'s classification; the invariant (validated by test): any complete tree built only through offered options parses AND classifies with a state-level root.

## UI (`src/ui/BuilderView.tsx`, rendered by Composer)

- A `⌗ Builder` toggle button beside the composer input. Toggling on: seed from the draft via `fromAst` when it parses; otherwise (parse error, holes, or empty) start from a bare hole — with a one-line notice when a non-empty draft couldn't be imported. Toggling off just hides the builder (draft already reflects it).
- Rendering: nested rounded boxes, one per node; operator label styled with the existing token classes (quantifier/temporal/connective), props in prop color, holes as amber `▢` chips (same glyph as text mode). Layout is nested inline-blocks — no SVG, no drag.
- Interaction: click a **hole** → popover palette (ops from `optionsFor`, then prop chips, true/false); click an **operator/prop node** → small action menu: *replace* (reopens the palette for that position), *wrap* (¬ + the logic's unary temporal/quantifier set, filtered by the same legality), *delete to hole*. Escape/click-outside closes popovers.
- Every edit calls `onChange(toText(tree))` → Composer `setDraft`; the status line (holes pending / parse ✓ + gloss) updates through the existing pipeline for free. While the builder is open the textarea is read-only (single source of truth; the `⌗` button is the way back).
- Editing-mode (`✎` on a row) composes: builder seeds from the row's text via `effLogic` — no special cases beyond using `effLogic` everywhere the logic is needed.

## Error handling

All htree ops total; unknown paths no-op. `toText` of a bare hole is `▢` (draft shows one hole; Enter already refuses). Builder state resets when `effLogic` changes (different catalogs) — with the same import-from-draft attempt. No new persistence.

## Testing

- **htree pure:** replace/wrap/delete on nested trees incl. root; toText round-trip property over ~500 random complete trees per logic (generate via catalog-legal random choices; parse + structural compare); fromAst∘toText identity on the same corpus; fromAst on every Learn/pattern example formula in the repo's content (they all parse → must all import).
- **catalog pure:** CTL* state-level hole excludes bare temporals, path-level includes them; random-build invariant: 300 random CTL* trees built only through offered options all classify state-rooted.
- **UI (jsdom):** toggle seeds from parseable draft (build `AG ▢` from `AG p` → shows AG node + prop); hole click → palette filtered per logic (CTL* root palette lacks `F`); pick op → children holes appear and draft updates with `▢`; complete a formula → status line shows ✓ + gloss; wrap and delete actions; non-parseable draft → bare hole + notice; textarea read-only while builder open.
- Existing 474 tests stay green.

## Out of scope

Drag-and-drop, keyboard-only tree navigation, collapsing/zooming large trees, builder for trace/pattern slots, undo inside the builder (the draft-level flow covers it).
