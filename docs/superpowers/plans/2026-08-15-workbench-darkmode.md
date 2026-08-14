# Workbench Drawer + Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Builder/Patterns move into a wide drawer over the canvas; the whole app converts to semantic design tokens with system-following + manually-overridable dark mode.

**Architecture:** Token blocks in `src/styles.css` (`:root` light / `:root[data-theme='dark']`), `src/ui/theme.ts` + Header toggle, SVG canvases converted to `var()` colors, `src/ui/Workbench.tsx` drawer shell hosting the existing `BuilderView`/`PatternPicker`.

**Tech Stack:** React 18 + TS + Vite; vitest + jsdom. **Run tests ONLY via `npm test`.** Suite currently 542 passing.

**Spec:** `docs/superpowers/specs/2026-08-15-workbench-darkmode-design.md` — normative (token names, coherence rules, toggle behavior). Read first.

⚠️ **Coherence guard:** the builder draft/tree coherence rules (readonly textarea, writer lockout, edit-transition seeding, import normalization) are protected by existing regression tests. Re-anchor selectors when the drawer moves DOM around; NEVER change what those tests assert. If a coherence behavior seems to need changing, STOP and report BLOCKED.

---

### Task 1: Token foundation — styles.css restructure (light-only, no visual change)

**Files:** Modify `src/styles.css`; Test `src/ui/tokens.test.ts` (new).

- [x] **Step 1: Failing drift test:** read `src/styles.css` as text (vitest can `import ... ?raw` or `readFileSync`); assert (a) it contains a `:root {` block defining every token named in the spec (surfaces, semantics, scale — enumerate them in the test as a fixture array), (b) outside the two token blocks there are NO raw hex colors (`/#[0-9a-fA-F]{3,8}\b/`) and no `rgb(`/`rgba(` except inside `var(--shadow-…)`/token definitions — implement by slicing the file into token-blocks vs rest and regexing the rest.
- [x] **Step 2: FAIL** → **Step 3:** restructure: add the `:root` token block with light values chosen FROM the current palette (map the 99 existing hex usages onto the nearest semantic token; keep current look — this task is a refactor, not a redesign); add an EMPTY-for-now `:root[data-theme='dark']` block with a comment (Task 2 fills it); sweep every rule to `var(--…)` for colors, and snap padding/font-size/radius to the `--space-*`/`--fs-*`/`--radius-*` scale (nearest step; eyeball-preserving).
- [x] **Step 4: PASS + full suite** (few UI tests assert colors; if any do, re-anchor to tokens/classes, report). **Step 5: Commit** `refactor(ui): semantic design tokens, light values`.

### Task 2: theme.ts + Header toggle + dark values

**Files:** Create `src/ui/theme.ts`; Modify `src/ui/Header.tsx`, `src/ui/App.tsx` (mount-time init), `src/styles.css` (dark block); Test `src/ui/theme.test.ts` + extend Header tests.

- [x] **Step 1: Failing tests:** `resolveTheme('auto', true) === 'dark'`, `('auto', false) === 'light'`, explicit prefs pass through; `applyTheme` sets `document.documentElement.dataset.theme` to the RESOLVED value and persists the PREF under `tle-theme`; `cycle('auto') === 'light'` → `'dark'` → `'auto'`; bad stored value → `'auto'`; auto attaches a matchMedia change listener that re-applies (stub `window.matchMedia` in the test — jsdom lacks it; provide addEventListener/removeEventListener capture) and `detachThemeListener`/re-apply on pref change removes it. Header: button shows ◑/☀/☾ per pref, click cycles + applies.
- [x] **Step 2: FAIL** → **Step 3:** implement `theme.ts` (`type ThemePref = 'auto'|'light'|'dark'`; `loadPref`, `applyTheme(pref)`, `cyclePref`), Header button (title `Theme: auto/light/dark`), App calls `applyTheme(loadPref())` in a mount effect. Fill the dark token block per the spec's dark-value guidance (true dark neutrals, adjusted-lightness semantics, no #000/#fff pairs).
- [x] **Step 4: PASS + full suite.** **Step 5: Commit** `feat(ui): dark mode with system-follow + manual toggle`.

### Task 3: SVG canvases to tokens

**Files:** Modify `src/ui/Canvas.tsx`, `src/ui/GraphView.tsx`, `src/ui/TreeView.tsx`, `src/ui/Timeline.tsx` (+ any other inline SVG color sites — grep `#[0-9a-fA-F]` and `fill=|stroke=` across src/ui); extend `src/ui/tokens.test.ts`.

- [ ] **Step 1: Failing test:** extend the drift test to scan the four component files: no raw hex color literals in JSX attributes/style objects (allow them ONLY in a single exported `LEGACY_COLORS` map if one proves necessary — target zero).
- [ ] **Step 2: FAIL** → **Step 3:** replace inline fills/strokes with `var(--…)` (SVG presentation attributes accept var()) or move to CSS classes; verdict rings/trace/evidence/deadlock/selection colors map to their semantic tokens (spec list). Where an SVG needs a color-mixed variant (e.g. translucent fill), use `color-mix(in srgb, var(--x) 20%, transparent)` in CSS.
- [ ] **Step 4: PASS + full suite** (canvas tests assert structure, not colors; re-anchor if any color assertions exist, report). **Step 5: Commit** `refactor(ui): canvas SVG colors from tokens`.

### Task 4: Workbench drawer

**Files:** Create `src/ui/Workbench.tsx`; Modify `src/ui/Composer.tsx` (remove inline builder placement + patterns row; add `⌗ Builder`/`⧉ Patterns` buttons; lift drawer state), `src/ui/App.tsx` (drawer renders inside `.pane.center` — pass open-state/setter down or lift to App: LIFT to App, since the drawer is positioned in the center pane while the buttons live in the left pane), `src/styles.css`; Tests: new `src/ui/Workbench.test.tsx`, re-anchor `BuilderView.test.tsx`/`PatternPicker.test.tsx`/`learn-links` selectors as needed.

- [ ] **Step 1: Failing tests (Workbench.test.tsx, rendering App):** the two buttons open the drawer in the right mode; backdrop visible + canvas behind it; Esc, ✕, and backdrop-click close; header mode switch swaps builder ↔ patterns preserving the draft; builder-mode: textarea readonly + palette/chips disabled (same lockout observable as today); patterns-mode: textarea stays editable, Insert closes the drawer and the draft holds the instantiated template with selection on the first hole; ✎-edit while drawer open in builder mode seeds from the row text (mirror the existing edit-transition test through the drawer).
- [ ] **Step 2: FAIL** → **Step 3:** implement. App owns `workbench: null | 'builder' | 'patterns'`. Composer receives `workbench` + `onOpenWorkbench(mode)` and keeps ALL builder coherence wiring it has today, with `builderOpen := workbench === 'builder'` (rename/adapt; writer lockout + readOnly logic unchanged). Workbench.tsx renders in `.pane.center` (sibling of the canvas stack): backdrop div + panel; needs the BuilderView/PatternPicker props Composer currently supplies — thread via App (move the shared bits — draft/setDraft equivalents — carefully: BuilderView's `initialText`/`onChange` bind to Composer's draft, so the cleanest cut is: Workbench CONTENT is rendered by Composer via a portal (`createPortal`) into a div App places in the center pane (`<div id="workbench-slot"/>` via ref). Use React portal — keeps all state in Composer, zero prop-threading through App beyond the slot ref and open-state.) Esc/outside listeners with cleanup; drawer CSS from tokens (`--backdrop`, `--shadow-2`, `--radius-2`); roomier `.hnode`/`PatternPicker` styles scoped under `.workbench`.
- [ ] **Step 4: PASS + full suite** — every pre-existing builder/pattern coherence test green (selector re-anchors reported one by one). **Step 5: Commit** `feat(ui): workbench drawer for builder and patterns`.

### Task 5: Finish

- [ ] Full `npm test` + `npx tsc --noEmit`; verify the tokens drift test covers styles.css + all four SVG components; report final counts and a list of what needs the by-hand visual QA pass (light/dark × canvas tabs × drawer modes).
