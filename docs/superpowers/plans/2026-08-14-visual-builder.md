# Visual AST Formula Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hole-driven visual formula builder as a composer mode: click holes to fill from a position-legal palette, edits pretty-print into the draft.

**Architecture:** Pure `src/builder/htree.ts` (hole-tolerant tree + toText/fromAst) and `src/builder/catalog.ts` (per-logic, context-aware palettes) validated by round-trip and random-build properties; `BuilderView` rendered inside Composer with the draft as single source of truth.

**Tech Stack:** React 18 + TS + Vite; vitest + jsdom. **Run tests ONLY via `npm test`.** Suite currently 474 passing.

**Spec:** `docs/superpowers/specs/2026-08-14-visual-builder-design.md` — normative, read first.

⚠️ **Semantics guard:** round-trip or classify failures mean the builder's syntax tables or legality rules are wrong — fix them against the parsers; NEVER adjust parsers/checkers to accommodate the builder. Report every such fix.

---

### Task 1: htree core — types, edits, toText

**Files:** Create `src/builder/htree.ts`; Test `src/builder/htree.test.ts`.

- [x] **Step 1: Failing tests** for: `nodeAt/replaceAt/wrapAt/deleteAt` on nested trees (root ops included; invalid paths no-op returning the SAME tree reference), `holes()` path enumeration in left-to-right order, `isComplete`, and `toText` cases per logic pinned exactly:
  - CTL: `{op:'AU',children:[hole,prop p]}` → `A[▢ U p]`; `{op:'AG',children:[{op:'implies',children:[prop p, {op:'EF',children:[prop q]}]}]}` → `AG (p -> EF q)`; `not` → `! p`; consts → `true`/`false`.
  - LTL: `(p U ▢)`, `G (p -> F q)` shapes.
  - CTL*: `A (G (F p))` — quantifiers print `A (…)`/`E (…)`.
- [x] **Step 2: Run — FAIL.** `npm test -- src/builder`
- [x] **Step 3: Implement.** Types per spec. Per-op syntax table `{arity, print(childTexts): string}` per logic-family: booleans `! x` / `(x & y)` / `(x | y)` / `(x -> y)` / `(x <-> y)`; LTL/CTL* temporals `X x`/`F x`/`G x`/`(x U y)`; CTL pairs `AX x`…`AG x`, `A[x U y]`, `E[x U y]`; CTL* quantifiers `A (x)`/`E (x)`. Parenthesize binary ops always (snippet-template style); unary operands parenthesized when the child is an `op` other than another unary chain — simplest correct rule: wrap any non-leaf child of a unary op in parens (`AG (p -> q)`, `AG p`, `! (p & q)`, `! p`, `G (F p)` is fine as `G F p` or `G (F p)` — pick always-parens for non-leaf, it must merely reparse correctly, not be minimal).
- [x] **Step 4: PASS + full suite.** **Step 5: Commit** `feat(builder): hole-tolerant formula tree with toText`.

### Task 2: fromAst + round-trip properties

**Files:** Modify `src/builder/htree.ts`; Test `src/builder/roundtrip.test.ts`.

- [x] **Step 1: Failing tests:**
  - `fromAst(logic, text)` on hand cases per logic (CTL `AG (p -> EF q)`, LTL `G (p -> F q)`, CTL* `A (G (F p))`) produces the expected HNode shapes; parse errors → null; **verify each parser's real AST kind strings before mapping** (CTL kinds: true/false/prop/not/and/or/implies/iff/EX/AX/EF/AF/EG/AG/EU/AU; check LTL for const kinds; check CTL* quantifier/temporal kinds).
  - Round-trip property, ~500 random complete trees per logic (seeded mulberry32; generate by random legal choices with depth cap 5, leaf-bias at the cap): `parseForLogic(logic, toText(t))` non-null AND `fromAst(logic, toText(t))` structurally equals `t` (deep-compare; consts/props/ops).
  - Corpus import: every parseable formula string in the repo's content — pull `patterns` fields from `REFERENCES` (learn) with each doc's parse logic, and every `PATTERNS` cell fully instantiated (P→p,S→s,q→q,r→r) in its logic — must `fromAst` non-null and round-trip `toText→parse` successfully.
- [x] **Step 2: FAIL** → **Step 3: implement `fromAst`** (per-logic recursive kind→OpId mapping; unknown kind → null overall). **Step 4: PASS + full suite.** **Step 5: Commit** `feat(builder): fromAst + round-trip property batteries`.

### Task 3: catalog — position-aware legality

**Files:** Create `src/builder/catalog.ts`; Test `src/builder/catalog.test.ts`.

- [x] **Step 1: Failing tests:** CTL/LTL palettes position-independent (all ops everywhere, props+consts true); CTL*: at root (`path=[]`, bare-hole tree) ops exclude X/F/G/U and include A/E + booleans; inside `A` subtree (path under a quantifier) ops include X/F/G/U and nested A/E; inside a boolean op at state level (e.g. `(▢ & ▢)` root) still state-level (no bare temporals). Random-build invariant: 300 CTL* trees built choosing uniformly from `optionsFor` at each hole (depth-capped, then fill leaves with props) — every one parses via toText AND `parseCTLStar`+`classify` yields a state-level root (import the real classify; check its export/API first).
- [x] **Step 2: FAIL** → **Step 3: implement** `optionsFor(logic, tree, path)`: for ctlstar, walk the path from the root; `pathLevel` becomes true when passing through an `A`/`E` node and stays true below (temporal ops preserve it; booleans preserve the CURRENT level — at state level booleans keep state level). **Step 4: PASS + full suite.** **Step 5: Commit** `feat(builder): position-aware operator catalog`.

### Task 4: BuilderView UI + Composer integration

**Files:** Create `src/ui/BuilderView.tsx`; Modify `src/ui/Composer.tsx`, `src/styles.css`; Test `src/ui/BuilderView.test.tsx`.

- [ ] **Step 1: Failing tests** (render Composer, model with props `go`/`stop`): `⌗ Builder` toggle exists (hidden while editing? NO — spec says editing composes: seed via effLogic; test the ✎-edit + builder path too); toggling with draft `AG go` shows an AG node containing a prop node `go`, textarea readonly; toggling with unparseable non-empty draft shows bare hole + notice; hole click opens palette (for a CTL* bare-hole root: contains `A`, `∧`, props, NOT `F`); picking `AG` (CTL) replaces hole with AG node + child hole AND updates the textarea value to `AG ▢`; completing to `AG go` flips the status line to ✓ with gloss; node action menu: replace / wrap (`¬` on `go` → draft `AG (! go)` — accept the toText parenthesization) / delete-to-hole; toggle off returns to editable textarea with the built draft intact.
- [ ] **Step 2: FAIL** → **Step 3: implement.** BuilderView props `{ logic, model, initialText, onChange(text), onNotice? }`; internal HNode state seeded via `fromAst(logic, initialText)` (null → bare hole + notice when initialText non-empty). Composer: `builderOpen` state; `⌗` button beside the input; while open set `readOnly` on the textarea and render BuilderView (below the input, above status line) with `initialText=draft`, `onChange=setDraft`; reset/reseed BuilderView on `effLogic` change (key it by effLogic) and when opening. Popovers: absolutely-positioned menu; Escape/outside-click close (document listener with cleanup). Styling: nested `.hnode` boxes, `.hnode-hole` amber chip, token classes for operator labels.
- [ ] **Step 4: PASS + full suite** (existing Composer/pattern tests unchanged; re-anchor only, report). **Step 5: Commit** `feat(builder): hole-driven builder view in composer`.

### Task 5: Finish

- [ ] Full `npm test` + `npx tsc --noEmit` clean; report final counts. Commit stragglers if any.
