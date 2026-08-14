# Dwyer Property-Pattern Library — Design

**Date:** 2026-08-14
**Status:** Approved
**Prerequisites:** Learn system merged (400 tests, master).
**Series:** Iteration 2 of 3 (composer ✓ → **pattern library** → visual AST builder).

## Purpose

Formula authoring practice via named specification idioms: the five core Dwyer et al. patterns (Absence, Universality, Existence, Response, Precedence) across three scopes (Globally, Before r, After q), pickable in the composer with prop slots and browsable as Learn reference pages.

Decisions: **5 patterns × 3 scopes** (the W-heavy Between/Until scopes wait for W/R operators); **composer picker row + Learn pages**; per cell the template is offered in **LTL and CTL\*** (the CTL* form is the A-wrapped LTL path formula, per Prop 5.4.1), plus **plain CTL for the Globally scope only** — Dwyer's scoped CTL mappings need weak-until and their U-expansions are pedagogically hostile; the Learn page says so explicitly (it's the same lesson the Learn content already teaches about CTL's limits).

## Components

### `src/patterns/patterns.ts` (pure data + instantiation)

```ts
export type SlotName = 'P' | 'S' | 'q' | 'r';
export interface PatternCell { ltl: string; ctlstar: string; ctl?: string }  // templates with slot tokens
export interface PatternDef {
  id: string;                      // 'absence' | 'universality' | 'existence' | 'response' | 'precedence'
  name: string;                    // Dwyer name
  intent: string;                  // one-sentence reading, slot-aware ("P never holds…")
  slots: SlotName[];               // pattern slots: P (+ S for response/precedence)
  scopes: { globally: PatternCell; before: PatternCell; after: PatternCell };
}
export const PATTERNS: PatternDef[];
export function instantiate(template: string, fill: Partial<Record<SlotName, string>>): string;
```

Templates are written with slot tokens `P S q r` (single capital/lowercase idents reserved to the template language, not user props). `instantiate` substitutes filled slots (parenthesizing non-atomic fills) and replaces unfilled slots with the composer hole `▢`. Scope slots: `before` adds `r`, `after` adds `q`.

Template matrix (LTL forms are Dwyer's; W is expanded via `φ W ψ ≡ G φ ∨ (φ U ψ)`; CTL* = `A (<ltl>)`; CTL only under `globally`):

| pattern | globally (ltl / ctl) | before r (ltl) | after q (ltl) |
|---|---|---|---|
| absence | `G (! P)` / `AG (! P)` | `F r -> ((! P) U r)` | `G (q -> G (! P))` |
| universality | `G P` / `AG P` | `F r -> (P U r)` | `G (q -> G P)` |
| existence | `F P` / `AF P` | `G (! r) \| ((! r) U (P & ! r))` | `G (! q) \| F (q & F P)` |
| response | `G (P -> F S)` / `AG (P -> AF S)` | `F r -> ((P -> ((! r) U (S & ! r))) U r)` | `G (q -> G (P -> F S))` |
| precedence | `G (! P) \| ((! P) U S)` / `! E[(! S) U (P & ! S)]` | `F r -> ((! P) U (S \| r))` | `G (! q) \| ((! q) U (q & (G (! P) \| ((! P) U S))))` |

(Response: S responds to P. Precedence: S precedes P.)

### `src/ui/PatternPicker.tsx` (inside the composer stack, collapsible row)

- Pattern dropdown + scope dropdown + logic toggle (LTL / CTL* always; CTL enabled only on Globally).
- One prop-chip row per slot of the current pattern+scope (`P`, `S`, `q`, `r` labeled with their roles); clicking a model-prop chip fills that slot, an × clears it; unfilled slots insert as `▢` holes (Tab cycling takes over after insert).
- Live preview: instantiated template pretty-printed + `glossify` line.
- **Insert** replaces the composer draft with the instantiated template and switches the entry logic to the picked logic; focus lands in the input at the first hole (reuse composer snippet mechanics).

### Learn pages

Five new `ReferenceDoc`-shaped entries (`pat-absence` … `pat-precedence`) with a new category value `logic: 'pattern'`; `LearnPanel` grouping gains a "Patterns (Dwyer)" section. Sections repurposed: *Meaning* = intent + when to reach for it; *Formal rule* = the Globally LTL template; *Equivalences* = the CTL/CTL* forms; *Patterns* = one worked instantiation per scope (must parse, LTL); *Pitfalls* = scope subtleties (vacuous satisfaction when the scope never opens/closes; why scoped CTL is omitted; Dwyer attribution + MCS §5.2.3/§5.5.2 kinship). No tutorials in this iteration (`tutorialId` unset).

## Error handling

Instantiation is total: unfilled → holes; fills are validated as existing propositions before substitution (picker only offers model props). Slot tokens can never leak: instantiate replaces all of them by construction, and a battery test asserts no `P S q r` slot tokens survive instantiation with all slots filled.

## Testing

- **Template battery** (pure): every cell × logic parses after full instantiation with distinct atomic props and round-trips through pretty; repeated-slot substitution consistent; unfilled slots become exactly the hole count expected; no slot token survives full instantiation.
- **Cross-check fuzz** (the safety net): for each pattern, Globally LTL vs Globally CTL instance agree (checkLTLAllPaths verdict vs checkCTL verdict) on ~200 random total models (3–6 states, props p/s); Before/After LTL vs CTL* A-wrapped instance agree via checkCTLStar on ~100 random total models. Disagreement = template derivation bug (semantics guard applies: fix templates against Dwyer originals, never checkers).
- **UI (jsdom):** picker renders per logic; slot fill + insert produces the expected draft with holes; CTL disabled off-Globally; Learn shows the Patterns group and a page's sections.
- Existing 400 tests stay green.

## Out of scope

Between/After-until scopes (need W/R), Existence bounded variants, chain patterns (Chain Response/Precedence), pattern tutorials, NL search over patterns.
