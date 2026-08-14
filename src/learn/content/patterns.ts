// Dwyer et al. property-pattern reference pages. Every template string shown
// here is DERIVED from the verified matrix in src/patterns/patterns.ts —
// never retyped — so these pages can never drift from what the cross-check
// battery has validated. `display` only maps ASCII connectives to glyphs.
import { ReferenceDoc } from '../types';
import { PATTERNS, PatternDef, SlotName, instantiate } from '../../patterns/patterns';

/** ASCII template → display glyphs (no re-typing of formulas, pure mapping). */
function display(t: string): string {
  return t.replace(/->/g, '→').replace(/!/g, '¬').replace(/\|/g, '∨').replace(/&/g, '∧');
}

function def(id: string): PatternDef {
  const d = PATTERNS.find((p) => p.id === id);
  if (!d) throw new Error(`unknown pattern id: ${id}`);
  return d;
}

/** Shared scope pitfalls — the same subtleties bite every pattern. */
const SCOPE_PITFALLS = [
  'Vacuous scopes: the Before-r templates start with `F r ->` — on a path where r never occurs the property holds vacuously, whatever P does. Likewise After-q holds trivially on paths where q never occurs.',
  'No plain-CTL forms outside Globally: Dwyer\'s scoped CTL mappings need weak-until (φ W ψ), and expanding W into U-formulas produces exactly the obligation subtleties the ltl-U page warns about — so this tool offers scoped templates in LTL and CTL* only.',
];

interface DocBits {
  reading: string;                      // appended to the Dwyer name
  informal: string;                     // intent + when to reach for it
  fills: Partial<Record<SlotName, string>>;  // real props for worked examples
  readings: { globally: string; before: string; after: string };
  extraPitfalls: string[];
}

function patternDoc(id: string, bits: DocBits): ReferenceDoc {
  const d = def(id);
  const { globally, before, after } = d.scopes;
  return {
    id: `pat-${id}`,
    logic: 'pattern',
    symbol: display(globally.ltl),
    name: `${d.name} — ${bits.reading}`,
    informal: bits.informal,
    formal: `Globally scope: ${display(globally.ltl)}`,
    equivalences: [
      `CTL (globally): ${display(globally.ctl!)}`,
      `CTL*: ${display(globally.ctlstar)}`,
      `LTL, before r: ${display(before.ltl)}`,
      `LTL, after q: ${display(after.ltl)}`,
    ],
    patterns: [
      { formula: instantiate(globally.ltl, bits.fills), reading: bits.readings.globally },
      { formula: instantiate(before.ltl, bits.fills), reading: bits.readings.before },
      { formula: instantiate(after.ltl, bits.fills), reading: bits.readings.after },
    ],
    pitfalls: [...SCOPE_PITFALLS, ...bits.extraPitfalls],
    bookRef: 'Dwyer et al.; MCS §5.2.3/§5.5.2',
  };
}

export const PATTERN_REFS: ReferenceDoc[] = [
  patternDoc('absence', {
    reading: 'P never holds',
    informal:
      'A state or event P is absent throughout the scope. Reach for it when something must never happen — an error state, a forbidden combination, a lock held twice. This is the most common safety property; Dwyer et al. found Absence and its scoped variants throughout real specifications.',
    fills: { P: 'error', q: 'init', r: 'shutdown' },
    readings: {
      globally: 'the error state is unreachable on every path',
      before: 'no error occurs before shutdown (on paths that do shut down)',
      after: 'once initialised, an error never occurs',
    },
    extraPitfalls: [
      'The Globally form is MCS\'s classic safety idiom — AG ¬(bad) in §5.5.2, G ¬(bad) in §5.2.3 (e.g. mutual exclusion AG ¬(c1 ∧ c2)).',
    ],
  }),
  patternDoc('universality', {
    reading: 'P holds throughout',
    informal:
      'A property P holds at every state of the scope — an invariant. Reach for it when a condition must be continuously maintained: a resource stays within bounds, a flag stays set during a transaction. Universality is Absence\'s mirror (G P vs G ¬P); Dwyer et al. list it as its own pattern because specifications state it positively.',
    fills: { P: 'safe', q: 'armed', r: 'landed' },
    readings: {
      globally: 'the system is safe at every reachable point of every path',
      before: 'safety is maintained until landing (on paths that land)',
      after: 'from the moment the system is armed, it stays safe forever',
    },
    extraPitfalls: [
      'Universality with fill ¬P is exactly Absence — pick whichever polarity reads naturally in your domain; the tool treats them as distinct templates because Dwyer\'s catalogue does.',
    ],
  }),
  patternDoc('existence', {
    reading: 'P eventually holds',
    informal:
      'A state or event P occurs at least once within the scope — a liveness guarantee. Reach for it when something must happen: a computation terminates, a request is eventually served, an initialisation completes. Dwyer et al.\'s Existence is the scoped generalisation of plain eventuality (F P).',
    fills: { P: 'done', q: 'started', r: 'reset' },
    readings: {
      globally: 'every path eventually reaches completion',
      before: 'completion happens before any reset (or reset never happens)',
      after: 'if the task starts, it eventually completes',
    },
    extraPitfalls: [
      'The scoped forms use a disjunct like `G ¬r ∨ …` instead of `F r →` — Existence inside a scope that never closes is deliberately satisfied, a different vacuity choice than Absence/Universality make. Check which reading your requirement intends.',
    ],
  }),
  patternDoc('response', {
    reading: 'S responds to P',
    informal:
      'Every occurrence of the stimulus P is eventually followed by the response S within the scope. Reach for it when every request must be answered, every alarm handled, every message acknowledged — Dwyer et al. found Response the single most frequent pattern in real specifications. It is the temporal shape of "if P then later S".',
    fills: { P: 'req', S: 'ack', q: 'connected', r: 'closed' },
    readings: {
      globally: 'every request is eventually acknowledged',
      before: 'until the channel closes, each request is acknowledged before the close',
      after: 'once connected, every request is eventually acknowledged',
    },
    extraPitfalls: [
      'Response is MCS\'s §5.2.3 idiom G (requested → F granted) and §5.5.2\'s AG (requested → AF granted) — the Globally row is exactly that pair.',
      'Response allows S to coincide with P at the same state (F includes now) and does not forbid S without a preceding P — for the latter you want Precedence.',
    ],
  }),
  patternDoc('precedence', {
    reading: 'S precedes P',
    informal:
      'The first occurrence of P (if any) must be preceded (or accompanied) by S within the scope — an enablement condition. Reach for it when P is only legitimate after S: no access before authentication, no output before initialisation. Dwyer et al. pair it with Response: Response obliges a future, Precedence guards a past.',
    fills: { P: 'access', S: 'auth', q: 'boot', r: 'logout' },
    readings: {
      globally: 'no access happens before authentication (or access never happens)',
      before: 'before logout, any access is preceded by authentication',
      after: 'after boot, authentication must come before the first access',
    },
    extraPitfalls: [
      'Precedence is vacuously satisfied when P never occurs — `G ¬P ∨ …` deliberately accepts paths with no P at all. It obliges nothing to happen, unlike Response.',
      'The Globally CTL form `¬ E[(¬ S) U (P ∧ ¬ S)]` is a negated exists-until, not an A-form — Dwyer\'s direct mapping; it says no path reaches P while still S-free.',
    ],
  }),
];
