# Dwyer Property-Pattern Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five Dwyer patterns × three scopes as instantiable templates (LTL + CTL* everywhere, CTL for Globally), with a composer picker row and Learn reference pages.

**Architecture:** Pure `src/patterns/patterns.ts` (template matrix + `instantiate`) validated by a parse/round-trip battery and an LTL↔CTL/CTL* cross-check fuzz; `PatternPicker` rendered inside the Composer stack; five `ReferenceDoc` entries under a new `'pattern'` category in the Learn index.

**Tech Stack:** React 18 + TS + Vite; vitest + jsdom. **Run tests ONLY via `npm test`** (never vitest directly). Suite currently 400 passing.

**Spec:** `docs/superpowers/specs/2026-08-14-pattern-library-design.md` — read first; the template matrix there is normative.

⚠️ **Semantics guard:** if the cross-check fuzz (Task 2) finds an LTL/CTL(/CTL*) disagreement, the template derivation is wrong — fix the template against Dwyer's published mappings (spec table) and report; NEVER touch checkers or weaken the fuzz. Report BLOCKED if you believe a checker is at fault.

---

### Task 1: Pattern data + instantiation + template battery

**Files:**
- Create: `src/patterns/patterns.ts`
- Test: `src/patterns/patterns.test.ts`

- [ ] **Step 1: Write failing tests** — for every pattern × scope × offered logic:
  - full instantiation (`P→'alpha', S→'beta', q→'gamma', r→'delta'` — multi-char props prove whole-token substitution) parses in that logic (`parseForLogic` from `src/learn/engine`) and round-trips `pretty(parse(x))` idempotently;
  - no slot token (`/\b[PSqr]\b/`) survives full instantiation;
  - unfilled slots produce exactly the expected number of `▢` holes (absence globally: 1; response before-r: 3 — count per cell from the spec table);
  - repeated slots substitute consistently (`instantiate` of response-before-r with `S→'x'` contains `x` at every S site, zero `S` tokens);
  - non-atomic fill is parenthesized: `instantiate('G (! P)', {P: 'a & b'})` === `'G (! (a & b))'`;
  - `PATTERNS` shape: 5 patterns, ids/slots per spec (`response`/`precedence` have `['P','S']`, others `['P']`), every scope cell has `ltl` + `ctlstar`, `ctl` present iff `globally`;
  - every `ctlstar` template === `'A (' + ltl + ')'` structurally (parse both, assert the CTL* AST's quantifier child pretty equals the LTL pretty — or simply string-assert the construction).
- [ ] **Step 2: Run — expect FAIL**: `npm test -- src/patterns`
- [ ] **Step 3: Implement `patterns.ts`** — types per spec; the template matrix EXACTLY as the spec table (LTL strings verbatim; `ctlstar` generated as `` `A (${ltl})` ``; `ctl` only under globally); `instantiate` via per-slot whole-token regex replace (`new RegExp('\\b' + slot + '\\b', 'g')`), wrapping fills in parens unless the fill matches `/^[A-Za-z_][A-Za-z0-9_]*$/`, unfilled slots → `'▢'`.
- [ ] **Step 4: Run — expect PASS**, then full `npm test` (400 + new).
- [ ] **Step 5: Commit** — `git add src/patterns && git commit -m "feat(patterns): Dwyer 5x3 template matrix with instantiation"`

### Task 2: Cross-check fuzz battery

**Files:**
- Test: `src/patterns/crosscheck.test.ts`

- [ ] **Step 1: Implement the fuzz** (this is a test-only task; deterministic seed — reuse the repo's existing seeded-PRNG idiom from prior fuzz batteries, grep `mulberry\|seed` in existing tests):
  - Random TOTAL model generator: 3–6 states, ids `n0…`, every state ≥1 outgoing transition (add a self-loop where the random draw gives none), each state independently labeled with subsets of `['p','s']` (Globally check) or `['p','s','q','r']` (scoped check); exactly one initial state (rotate through all states as initial across iterations for breadth).
  - **Globally LTL ≡ CTL** (5 patterns × 200 models): instantiate both with `P→'p', S→'s'`; assert `checkLTLAllPaths(model, parseLTL(ltl)).kind === 'holds'` ⟺ `checkCTL(model, parseCTL(ctl)).verdict` (check the real result shapes in `src/core/ltl-allpaths.ts` / `ctl-checker.ts`; skip iterations where allPaths returns `too-large`, count and assert < 10% skipped).
  - **Before-r and After-q LTL ≡ CTL\*** (5 patterns × 2 scopes × 100 models): assert LTL ∀ verdict ⟺ `checkCTLStar(model, parseCTLStar(ctlstar)).verdict`, same too-large skip rule.
  - On any counterexample, fail with the serialized model + both formulas (so a human can replay it).
- [ ] **Step 2: Run** — `npm test -- src/patterns`. Apply the Semantics guard on any disagreement. Then full suite.
- [ ] **Step 3: Commit** — `git add src/patterns && git commit -m "test(patterns): LTL/CTL/CTL* template cross-check fuzz"`

### Task 3: PatternPicker in the composer

**Files:**
- Create: `src/ui/PatternPicker.tsx`
- Modify: `src/ui/Composer.tsx`, `src/styles.css`
- Test: `src/ui/PatternPicker.test.tsx`

- [ ] **Step 1: Write failing tests** (render Composer with a model exposing props `go`, `stop`; not the bare picker):
  - a "Patterns" disclosure row exists in the composer stack; opening it shows pattern + scope dropdowns and the logic toggle;
  - CTL option disabled unless scope is Globally (switch scope to "Before r" → CTL radio/button disabled, and if CTL was selected the picker falls back to LTL);
  - slot chips: with pattern Response, slots P and S render, clicking prop chip `go` under P fills it (chip shows `P = go`), preview line updates to the instantiated string;
  - Insert with S unfilled sets the composer draft to the instantiated template containing `▢` (assert via the composer textarea value), switches entry logic when the picker logic ≠ current tab (assert `onSwitchLogic` observable effect — follow how existing Composer tests assert logic switching), and selection lands on the first hole;
  - preview shows a gloss line only when fully filled (parseable), otherwise just the template text.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement** — `PatternPicker` props: `{ model, logic, onInsert(text: string, logic: Logic) }`; internal state pattern/scope/logic-choice/fills. Composer renders it (collapsed by default, hidden entirely while `editing`) below the operator palette; `onInsert` handler in Composer: `onSwitchLogic(l)` when needed, `setDraft(text)`, then focus + `selectHole(0)` (mirror the existing snippet-insert flow; note `selectHole` reads `draft` state — reuse whatever mechanism `insertAtCaret` uses to select the first hole after a state update, e.g. an effect or the same rAF/timeout idiom; follow the existing code). Preview: instantiated string; gloss via `glossify(parse, logic)` when it parses (reuse `parseForLogic`). Slot labels with roles: `P — the behavior`, `S — the trigger/response`, `q — scope opens`, `r — scope closes` (short title attrs fine).
- [ ] **Step 4: Run — expect PASS**, full suite; existing Composer tests must not change assertions.
- [ ] **Step 5: Commit** — `git add src/ui src/styles.css && git commit -m "feat(patterns): composer pattern picker with slot chips"`

### Task 4: Learn pages for patterns

**Files:**
- Create: `src/learn/content/patterns.ts`
- Modify: `src/learn/types.ts` (`logic: Logic | 'shared' | 'pattern'`), `src/ui/LearnPanel.tsx` (group header "Patterns (Dwyer)", ordered last), `src/learn/content/index.ts`
- Test: extend `src/ui/LearnPanel.test.tsx` (one test: Patterns group renders, opening `pat-response` shows intent + both logics' templates)

- [ ] **Step 1: Failing test**, **Step 2: run**, **Step 3: implement** five docs `pat-absence/universality/existence/response/precedence`:
  - `symbol`: the Globally LTL template with slot letters (e.g. `G (P → F S)` display form); `name`: Dwyer name + reading (e.g. "Response — S responds to P");
  - *Meaning*: intent + when to reach for it (own words; Dwyer et al. attribution);
  - *Formal rule* field: the Globally LTL template; *Equivalences*: the CTL (globally) and CTL* forms + the Before/After LTL templates as display strings;
  - `patterns` field: one WORKED instantiation per scope with real props (must parse as LTL — battery enforces);
  - `pitfalls`: vacuous truth when the scope never opens/closes (`F r ->` antecedent, After-q with no q); why scoped plain-CTL is omitted (weak-until; ties to the U-obligation lesson in `ltl-U`); MCS §5.2.3/§5.5.2 kinship for response/absence examples.
  - Content battery covers the docs automatically (patterns parse, sections non-empty); `logic: 'pattern'` needs a one-line battery adjustment where it maps doc logic → parse logic (treat `'pattern'` like `'shared'` → ctl? No: use **ltl** for `'pattern'` docs since their worked examples are LTL — adjust the battery's logic-resolution accordingly and note it).
- [ ] **Step 4: Full suite green.**
- [ ] **Step 5: Commit** — `git add src/learn src/ui && git commit -m "feat(patterns): Dwyer reference pages in Learn"`

### Task 5: Finish

- [ ] **Step 1:** Full `npm test`; `npx tsc --noEmit` clean.
- [ ] **Step 2:** Sanity-check REF map untouched invariants (learn-links tests green — pattern docs deliberately have no palette mapping).
- [ ] **Step 3:** Commit any stragglers; report final counts.
