/** Dwyer et al. property-pattern template matrix (5 patterns × 3 scopes).
 *
 *  Templates are written with slot tokens `P S q r` — idents reserved to the
 *  template language, never user props. LTL forms are Dwyer's published
 *  mappings (W expanded via `φ W ψ ≡ G φ ∨ (φ U ψ)`), except precedence/after
 *  which is deliberately strengthened — see the note at that cell; every CTL* form is the
 *  A-wrapped LTL path formula (Prop 5.4.1); plain CTL is offered only under
 *  the Globally scope — Dwyer's scoped CTL mappings need weak-until.
 */

export type SlotName = 'P' | 'S' | 'q' | 'r';

/** Templates with slot tokens; `ctl` present only for the Globally scope. */
export interface PatternCell { ltl: string; ctlstar: string; ctl?: string }

export interface PatternDef {
  id: string;                      // 'absence' | 'universality' | 'existence' | 'response' | 'precedence'
  name: string;                    // Dwyer name
  intent: string;                  // one-sentence reading, slot-aware
  slots: SlotName[];               // pattern slots: P (+ S for response/precedence)
  scopes: { globally: PatternCell; before: PatternCell; after: PatternCell };
}

const HOLE = '▢';
const SLOTS: SlotName[] = ['P', 'S', 'q', 'r'];
const ATOMIC = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** ctlstar = A-wrapped ltl; ctl only when given (Globally scope). */
function cell(ltl: string, ctl?: string): PatternCell {
  const c: PatternCell = { ltl, ctlstar: `A (${ltl})` };
  if (ctl !== undefined) c.ctl = ctl;
  return c;
}

export const PATTERNS: PatternDef[] = [
  {
    id: 'absence',
    name: 'Absence',
    intent: 'P never holds within the scope.',
    slots: ['P'],
    scopes: {
      globally: cell('G (! P)', 'AG (! P)'),
      before: cell('F r -> ((! P) U r)'),
      after: cell('G (q -> G (! P))'),
    },
  },
  {
    id: 'universality',
    name: 'Universality',
    intent: 'P holds at every state within the scope.',
    slots: ['P'],
    scopes: {
      globally: cell('G P', 'AG P'),
      before: cell('F r -> (P U r)'),
      after: cell('G (q -> G P)'),
    },
  },
  {
    id: 'existence',
    name: 'Existence',
    intent: 'P holds at some state within the scope.',
    slots: ['P'],
    scopes: {
      globally: cell('F P', 'AF P'),
      before: cell('G (! r) | ((! r) U (P & ! r))'),
      after: cell('G (! q) | F (q & F P)'),
    },
  },
  {
    id: 'response',
    name: 'Response',
    intent: 'Whenever P holds, S eventually responds within the scope.',
    slots: ['P', 'S'],
    scopes: {
      globally: cell('G (P -> F S)', 'AG (P -> AF S)'),
      before: cell('F r -> ((P -> ((! r) U (S & ! r))) U r)'),
      after: cell('G (q -> G (P -> F S))'),
    },
  },
  {
    id: 'precedence',
    name: 'Precedence',
    intent: 'S always precedes the first P within the scope.',
    slots: ['P', 'S'],
    scopes: {
      globally: cell('G (! P) | ((! P) U S)', '! E[(! S) U (P & ! S)]'),
      before: cell('F r -> ((! P) U (S | r))'),
      // Deliberately stronger than Dwyer's published `[]!Q | <>(Q & (!P W S))`:
      // this form anchors the scope at the FIRST q (Dwyer's ∃-form would let a
      // later q open a clean sub-scope, e.g. trace [q][p][q][s] satisfies
      // Dwyer's but not ours). First-q matches the intended "After q" reading.
      after: cell('G (! q) | ((! q) U (q & (G (! P) | ((! P) U S))))'),
    },
  },
];

/** Substitute slot tokens in a template. Filled slots are replaced with the
 *  fill (parenthesized unless it is a single atomic ident); unfilled slots
 *  become composer holes (▢). Whole-token match only — multi-char props
 *  containing slot letters are never touched. Total: never throws. */
export function instantiate(template: string, fill: Partial<Record<SlotName, string>>): string {
  // Single pass over all slot tokens so a fill that itself contains a slot
  // letter (e.g. a model prop literally named 'q') is never re-substituted.
  return template.replace(new RegExp('\\b(' + SLOTS.join('|') + ')\\b', 'g'), (m) => {
    const given = fill[m as SlotName];
    if (given === undefined) return HOLE;
    return ATOMIC.test(given) ? given : `(${given})`;
  });
}
