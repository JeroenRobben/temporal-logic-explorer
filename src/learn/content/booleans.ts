import { ReferenceDoc, Tutorial } from '../types';
import { hasFormula, selectedIs } from '../helpers';
import { M_BOOK } from './models';

export const BOOL_REFS: ReferenceDoc[] = [
  {
    id: 'bool-not',
    logic: 'shared',
    symbol: '¬φ',
    name: 'Negation',
    informal:
      '¬φ holds at a state exactly when φ does not hold there. Its sat set is the complement: every state outside the sat set of φ.',
    formal: 'M,s ⊨ ¬φ  iff  M,s ⊭ φ',
    equivalences: ['¬¬φ ≡ φ', '¬(φ ∧ ψ) ≡ ¬φ ∨ ¬ψ (De Morgan)', '¬(φ ∨ ψ) ≡ ¬φ ∧ ¬ψ (De Morgan)'],
    patterns: [
      { formula: '!(c1 & c2)', reading: 'mutual exclusion as a state formula (MCS §5.2.5)' },
    ],
    pitfalls: [
      'Negation flips the answer at one state — it says nothing about other states or about paths; ¬F φ on a path is G ¬φ, not F ¬φ.',
    ],
    bookRef: 'MCS §5.2.1/§9.1',
  },
  {
    id: 'bool-and',
    logic: 'shared',
    symbol: 'φ ∧ ψ',
    name: 'Conjunction',
    informal:
      'φ ∧ ψ holds at a state when both conjuncts hold there. Its sat set is the intersection of the two sat sets.',
    formal: 'M,s ⊨ φ ∧ ψ  iff  M,s ⊨ φ and M,s ⊨ ψ',
    equivalences: ['¬(φ ∧ ψ) ≡ ¬φ ∨ ¬ψ (De Morgan)', 'φ ∧ φ ≡ φ', 'φ ∧ ψ ≡ ψ ∧ φ'],
    patterns: [
      { formula: '!(c1 & c2)', reading: 'mutual exclusion as a state formula (MCS §5.2.5)' },
    ],
    pitfalls: [
      'Both conjuncts are checked at the same state — p ∧ q never means "p here and q somewhere else"; reaching for that needs a temporal operator.',
    ],
    bookRef: 'MCS §5.2.1/§9.1',
  },
  {
    id: 'bool-or',
    logic: 'shared',
    symbol: 'φ ∨ ψ',
    name: 'Disjunction',
    informal:
      'φ ∨ ψ holds at a state when at least one disjunct holds there (inclusive — both is fine). Its sat set is the union of the two sat sets.',
    formal: 'M,s ⊨ φ ∨ ψ  iff  M,s ⊨ φ or M,s ⊨ ψ',
    equivalences: ['¬(φ ∨ ψ) ≡ ¬φ ∧ ¬ψ (De Morgan)', 'φ ∨ φ ≡ φ', 'φ ∨ ψ ≡ ψ ∨ φ'],
    patterns: [
      { formula: 'AG (p | q | r)', reading: 'every reachable state is labelled by at least one proposition' },
    ],
    pitfalls: [
      'Disjunction is inclusive: a state satisfying both φ and ψ satisfies φ ∨ ψ — there is no exclusive-or connective in this tool.',
    ],
    bookRef: 'MCS §5.2.1/§9.1',
  },
  {
    id: 'bool-implies',
    logic: 'shared',
    symbol: 'φ → ψ',
    name: 'Implication',
    informal:
      'φ → ψ holds at a state unless φ holds there while ψ fails — it only rules out the one bad combination. It reads "wherever φ holds, ψ holds too".',
    formal: 'M,s ⊨ φ → ψ  iff  M,s ⊭ φ or M,s ⊨ ψ',
    equivalences: ['φ → ψ ≡ ¬φ ∨ ψ', '¬(φ → ψ) ≡ φ ∧ ¬ψ', 'φ → ψ ≡ ¬ψ → ¬φ (contraposition)'],
    patterns: [
      { formula: 'p -> EX q', reading: 'conditional possibility' },
    ],
    pitfalls: [
      'Vacuous truth: `p → r` is true wherever `p` is false — an implication whose premise never holds is satisfied everywhere.',
      'Implication is not causation or sequence: φ → ψ compares the two at the same state; "φ then later ψ" needs a temporal operator (e.g. G (φ → F ψ)).',
    ],
    bookRef: 'MCS §5.2.1/§9.1',
  },
  {
    id: 'bool-iff',
    logic: 'shared',
    symbol: 'φ ↔ ψ',
    name: 'Biconditional',
    informal:
      'φ ↔ ψ holds at a state when the two sides agree there — both hold or neither does. It is truth-value equality at a single state.',
    formal: 'M,s ⊨ φ ↔ ψ  iff  (M,s ⊨ φ and M,s ⊨ ψ) or (M,s ⊭ φ and M,s ⊭ ψ)',
    equivalences: ['φ ↔ ψ ≡ (φ → ψ) ∧ (ψ → φ)', '¬(φ ↔ ψ) ≡ φ ↔ ¬ψ', '¬¬φ ≡ φ'],
    patterns: [
      { formula: 'AG (p <-> q)', reading: 'the two propositions agree at every reachable state' },
    ],
    pitfalls: [
      'State-by-state agreement is weaker than equivalence of formulas: p ↔ q can hold at some states and fail at others; φ ≡ ψ means they agree at every state of every model.',
    ],
    bookRef: 'MCS §5.2.1/§9.1',
  },
];

export const TUT_BOOLEANS: Tutorial = {
  id: 'tut-booleans', title: 'Boolean connectives', logic: 'shared',
  intro: 'Propositional connectives evaluated at a single state — the ground floor every temporal operator builds on.',
  steps: [
    { text: 'This is the running example structure from the book (MCS p.147): `s0{p,q}`, `s1{q,r}`, `s2{r}`. The formula `p ∧ q` is a **state formula** — it is checked at each state separately. The ✓ verdict means it holds at the initial state s0.',
      setup: { model: M_BOOK, formulas: [{ text: 'p & q', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Select the `q` leaf in the inspector tree. The canvas rings every state whose label contains `q` — its **sat set** {s0, s1}. Every connective just combines sat sets.',
      checkpoint: selectedIs('q'), solution: { selectSubformulaPretty: 'q' }, highlight: 'inspector-tree' },
    { text: 'Implication is the classic trap: **`p → r` is true at every state where `p` is false** (vacuously). Add the formula `p -> r` and check its verdict: ✗ at s0 (p holds, r does not) — but select its root and note s1 and s2 are in the sat set.',
      checkpoint: hasFormula('ctl', 'p -> r'), solution: { formulas: [{ text: 'p & q', logic: 'ctl' }, { text: 'p -> r', logic: 'ctl' }] } },
    { text: 'Duality preview: `¬(p ∧ q) ≡ ¬p ∨ ¬q` (De Morgan). The same pattern returns at temporal scale — `¬F` is `G¬`, `¬AF` is `EG¬`. Each temporal reference page lists its dualities.' },
  ],
};
