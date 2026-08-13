# Formula Composer (Input Ergonomics) — Design

**Date:** 2026-08-14
**Status:** Approved
**Prerequisites:** Full tri-logic app + correctness audit (296 tests, master).
**Series:** Iteration 1 of 3 (composer → property-pattern library → visual formula builder). Natural-language→formula was considered and dropped.

## Purpose

Typing formulas currently requires memorizing each logic's syntax with feedback only after Enter. This iteration makes the input assistive: live errors with one-click fixes, clickable propositions and operators, snippet templates with holes, live pretty+gloss preview, syntax highlighting, edit-in-place, and wrap/negate/swap gestures on the inspector trees.

Decisions from brainstorming: **always-visible compact stack** layout (input → status line → prop chips → operator palette); **overlay-textarea** highlighting (no CodeMirror/contentEditable, zero deps).

## Components

### `src/ui/Composer.tsx` (new; FormulaPanel keeps the list and delegates entry/editing)

Props: `logic: Logic`, `model: KripkeStructure`, `editing: { id: string; text: string } | null`, `onSave: (text: string) => void`, `onCancelEdit: () => void`. All list state stays in FormulaPanel/App.

Stack (per layout decision):
1. **Highlighted input** — single-line overlay: transparent-text `<textarea rows={1}>` above an aligned token layer (same monospace font/metrics); caret/selection native.
2. **Status line**, exactly one of:
   - *Holes pending* (draft contains `▢`): "fill the holes — Tab jumps to the next"; Enter refuses to save.
   - *Parse error*: message + caret column marker + hint + quick-fix buttons (see ParseError.fix) + cross-logic action ("switch this formula to CTL/LTL/CTL*") when the hint names another logic; clicking a fix replaces the draft, the cross-logic action switches `entryLogic` keeping the draft.
   - *Parses*: `✓ {pretty} — "{glossify(ast, logic)}"`.
3. **Proposition chips** — `allPropositions(model)`, click inserts at caret.
4. **Operator palette** — per tab, each button tooltipped with its GLOSS phrase:
   - CTL: `AG EF AF EG AX EX A[▢ U ▢] E[▢ U ▢] ∧ ∨ ¬ → ↔`
   - LTL: `G F X (▢ U ▢) ∧ ∨ ¬ → ↔`
   - CTL*: `A E G F X (▢ U ▢) ∧ ∨ ¬ → ↔`
   Binary connectives insert `(▢ <op> ▢)` templates; unary/quantifier buttons insert the operator + space.

**Insertion:** at `selectionStart`, smart-spaced (add a space beside non-space/paren neighbors); focus returns with caret after the insertion. Snippet templates instead select their first `▢`; **Tab / Shift+Tab** cycle holes (wrapping); typing replaces the selected hole. `▢` is unlexable in all grammars — it cannot leak into a committed formula.

**Editing mode:** ✎ on a formula row loads its text (row highlighted; banner "editing — Enter saves, Esc cancels"). Enter → `onSave` updates the entry **keeping its id** (structural-key memos recompute on `formulas` identity change — verified safe in the audit). Escape restores the pre-edit draft. Deleting the edited row cancels the edit. While editing, Enter always saves the edit (never adds).

### `src/ui/highlight.ts` (new, pure)

`tokenize(text, logic): { text; cls }[]` — regex-level tokens (idents, operator symbols, parens/brackets, `▢` holes, whitespace) with per-logic keyword sets mapping idents to classes: `quantifier` (A/E + CTL pairs), `temporal` (X/F/G/U per logic), `prop`, `connective`, `paren`, `hole`, `plain`. Approximate by design — it colors, it does not parse. Colors: temporals/quantifiers in the logic accent, props in canvas blue, connectives dim, holes amber chips.

### `src/ui/gloss.ts` (new, pure)

`glossify(ast, logic): string` — bounded-depth (3) English paraphrase using the GLOSS vocabulary, ellipsizing deeper structure ("on every path, at every step: on some path, eventually …"). Works over all three AST types (per-logic adapters).

### `src/ui/formulaEdits.ts` (new, pure)

- `wrapNode(logic, text, nodeId, wrapper): string | null` — parse, wrap the identified node (`not`, or a temporal/quantifier legal for the logic), re-emit whole formula via the logic's `pretty`. CTL* guard: reject (return null) if the result's ROOT would classify path-level.
- `swapQuantifier(logic, text, nodeId): string | null` — CTL pairs `AG↔EG AF↔EF AX↔EX AU↔EU`; CTL* `A↔E`; null for LTL/non-quantified nodes.
- Determinism of per-parse node ids makes text→AST→text targeting safe (pretty round-trips hardened by the audit). Any unexpected failure returns null; callers surface a status note and change nothing.

### Core change: `ParseError.fix`

`ParseError` gains optional `fix?: { label: string; replacement: string }`, populated where a deterministic rewrite exists (all three parsers): glued tokens (`AG p` → `A G p`; `FG p` → `F G p`), CTL-bracket-in-CTL* (`A[p U q]` → `A (p U q)`). Replacement strings must reparse cleanly (tested). Existing message/hint/pos behavior unchanged.

### Inspector: gesture row

When a subformula node is selected (any logic), an action row appears under the tree: `¬` wrap; per-logic wraps (CTL: `AG EF AF EG AX EX`; LTL: `G F X`; CTL*: `A E G F X`); `A↔E` shown only on quantified nodes. Actions run `formulaEdits` + `onUpdateFormula(id, newText)` (new App callback); selection clears with the reparse. Rejected CTL* root-path wraps show the "needs a path quantifier" note instead of applying.

## Error handling

The composer never throws: every keystroke lands in one of the three status states. Empty draft → neutral (no error). `formulaEdits` failures are silent no-ops with a status note. Quick-fix replacements are validated by construction (tests assert each fix reparses).

## Testing

- **Pure units:** highlight token classes per logic (incl. hole + logic-accent membership); glossify across all operators + depth bounding; formulaEdits wrap/swap/negate for all three logics — property: result reparses AND pretty of the original target subtree occurs within the new pretty; ParseError.fix replacements reparse cleanly for every fix site.
- **jsdom integration (Composer):** live error appears mid-typing with hint; chip insertion at caret; palette snippet + Tab hole cycling + Enter refusal with holes; quick-fix click rewrites the draft; cross-logic switch preserves draft; success preview shows pretty + gloss; edit-in-place saves same id (verdict updates, id stable); wrap gesture updates the row text and clears node selection.
- Existing 296 tests stay green; a handful of `.formula-input` queries in App/Header tests will need re-anchoring to the new composer markup (mechanical; assertions unchanged).

## Out of scope (later iterations)

Property-pattern library (iteration 2), visual AST builder (iteration 3), autocomplete dropdown, multi-line formulas, NL→formula (dropped).
