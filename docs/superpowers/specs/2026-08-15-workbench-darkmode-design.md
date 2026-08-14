# Composer Workbench Drawer + Dark Mode / Design Tokens — Design

**Date:** 2026-08-15
**Status:** Approved
**Prerequisites:** Full series merged (542 tests, master).

## Purpose

Two UI problems, one pass: (1) the Builder and Patterns features are buried as small toggles in an overloaded left-pane stack — they move into a roomy **workbench drawer** that opens over the canvas; (2) the app gets **dark mode** via a full design-token refactor (semantic color variables + spacing/type scale) applied app-wide, including the SVG canvases.

Decisions from brainstorming (mockup B chosen): wide workbench drawer over the canvas; dark mode follows the system with a persisted manual override (auto/light/dark); full token pass (colors AND spacing/typography), not colors-only.

## Part 1 — Workbench drawer

### Layout

- The left-pane composer keeps: highlighted text input, status line, prop chips, operator palette. The inline `⌗ Builder` toggle and the collapsible Patterns row are REMOVED and replaced by two prominent buttons under the palette: `⌗ Builder` and `⧉ Patterns`.
- Clicking either opens the **drawer**: an absolutely positioned panel inset within the center pane (`.pane.center`), over a dimmed backdrop covering the canvas. Rounded, elevated (shadow token), header row = mode title + live draft pretty + `✕` close. Esc and backdrop-click close. One drawer, two modes (`builder` | `patterns`); the header offers a small mode switch so you can hop between them without closing.
- `src/ui/Workbench.tsx` owns the shell (backdrop, positioning, Esc/outside handlers, mode switch); it renders the existing `BuilderView` or `PatternPicker` as content. Both get roomier layout via new CSS only (bigger `.hnode` blocks, palette/popover text at full size, PatternPicker rows spread horizontally) — component logic unchanged except where noted.

### Coherence rules (carried over from the builder review — MUST survive)

- Builder mode open ⇒ textarea `readOnly`; prop chips, operator palette, quick-fix flows behave exactly as with the old `builderOpen` (writer lockout). The existing regression tests keep passing with selectors re-anchored to the drawer.
- Builder still seeds from the draft on open, normalizes the draft on import (`toText`), collapses unparseable drafts to `▢` with the notice, and remounts on `effLogic`/editing transitions (same keys).
- Patterns mode: Insert instantiates into the draft (existing behavior), closes the drawer, focuses the first hole in the text input. Patterns mode does NOT lock the textarea (it never did).
- Editing a row (✎) while the drawer is open composes exactly as before (builder seeds from the row text).

## Part 2 — Design tokens + dark mode

### Token architecture (`src/styles.css` restructured, no new files)

- `:root` defines semantic tokens (light values); `:root[data-theme='dark']` overrides them. Nothing outside the two token blocks names a raw color.
  - Surfaces/text: `--bg`, `--panel`, `--panel-raised`, `--border`, `--border-strong`, `--text`, `--text-dim`, `--backdrop`.
  - Semantics: `--accent` (interactive blue), `--pass`, `--fail`, `--warn`, `--hole` (amber), `--evidence` (orange), `--trace` (violet), `--selection`, `--deadlock`, plus the token-class colors (`--tok-quantifier`, `--tok-temporal`, `--tok-prop`, `--tok-connective`).
  - Scale: `--space-1..6` (4/8/12/16/24/32), `--fs-0..3` (12/13/15/18), `--radius-1/2` (4/8), `--shadow-1/2`.
- Sweep ALL of `styles.css` to tokens — colors, paddings, font sizes, radii. Density stays close to current values (snap to the nearest scale step); this is a tightening pass, not a relayout.
- SVG canvases (`Canvas`, `GraphView`, `TreeView`, `Timeline`): every hardcoded fill/stroke moves to `var(--…)` (SVG presentation attributes accept `var()`) or to CSS classes. State fill, edge stroke, labels, verdict rings, trace/evidence overlays, deadlock badges all read tokens so dark mode reaches the canvas.
- Dark values: true dark neutrals (near-black bg, dark panels), same hue family for semantics with lightness adjusted for contrast on dark; hole/evidence/trace hues stay recognizable. Contrast target: readable at a glance, no pure #000/#fff pairs.

### Theme switching

- `src/ui/theme.ts` (pure-ish): `resolveTheme(pref, systemDark)`, `applyTheme(pref)` sets `data-theme` on `document.documentElement` (only ever `'light'`/`'dark'`; `auto` resolves first), persists pref under `tle-theme`, and (for `auto`) attaches a `matchMedia('(prefers-color-scheme: dark)')` change listener.
- Header gains a theme button cycling `auto → light → dark → auto` (icon ☀/☾/◑ + title). Initial pref read from localStorage (default `auto`) at App mount.

## Error handling

Drawer state is UI-only (not persisted); Esc always closes; unknown stored theme value falls back to `auto`. matchMedia listener detached on unmount. No behavior changes to checkers/content.

## Testing

- **theme.ts:** resolve/apply/persist/cycle units incl. bad stored value; jsdom matchMedia stubbed (repo has no stub yet — add a tiny one in the test).
- **Workbench (jsdom):** opens in each mode from the two buttons; Esc + backdrop + ✕ close; mode switch preserves the draft; builder-mode readonly + writer lockout (existing regression tests re-anchored, assertions unchanged); patterns Insert closes drawer and fills draft; ✎-edit transition with drawer open still seeds correctly (existing test re-anchored).
- **Header:** theme button cycles and sets `data-theme` + localStorage.
- **Token sanity:** a test asserting `styles.css` contains no raw hex colors outside the two token blocks (regex over the file — cheap drift guard).
- Existing 542 tests stay green (selector re-anchoring only where the drawer moved things; no assertion changes).
- Visual QA (light + dark, all four canvas tabs, drawer both modes) by hand — flagged in the final report.

## Out of scope

Radix/shadcn/Tailwind adoption, mobile/responsive layout, animation polish beyond a simple drawer fade, per-logic accent theming, canvas background grid restyle.
