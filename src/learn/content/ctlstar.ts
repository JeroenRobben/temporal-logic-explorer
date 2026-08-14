import { ReferenceDoc, Tutorial } from '../types';
import { hasFormula, selectedIs, tabIs } from '../helpers';
import { M_BOOK } from './models';

export const REF_STAR_A: ReferenceDoc = {
  id: 'star-A', logic: 'ctlstar', symbol: 'A α', name: 'All-paths quantifier',
  informal: 'A turns a path formula into a state formula: A α holds at a state when α holds on *every* path from it. Plain LTL formulas are implicitly A-quantified — the book’s Prop 5.4.1: M,s ⊨_LTL α iff M,s ⊨_CTL* A α — so A is the quantifier you were already using without writing it.',
  formal: 'M,s ⊨ A α  iff  for every path π starting at s: M,π ⊨ α.',
  equivalences: ['A α ≡ ¬E ¬α'],
  patterns: [
    { formula: 'A (G (F r))', reading: 'on every path, r happens infinitely often' },
  ],
  pitfalls: [
    'A binds a whole *path* formula, not one operator: `A (F (G p))` is NOT the CTL `AF AG p` — the CTL formula re-quantifies over all branches at the stabilization point and is strictly stronger (MCS §5.5.3, Remark 5.5.1).',
    'State formulas inside a path formula restart path quantification: once you write A or E again, the paths of the outer quantifier are forgotten.',
  ],
  bookRef: 'MCS §5.4', tutorialId: 'tut-star-A',
};

export const REF_STAR_E: ReferenceDoc = {
  id: 'star-E', logic: 'ctlstar', symbol: 'E α', name: 'Some-path quantifier',
  informal: 'E α holds at a state when *some* path from it satisfies α — possibility over full path behaviour. This is exactly the quantifier LTL lacks: the book’s "encoding trick" (§5.2.5) can only negate an A, never assert a genuine E over an arbitrary path formula.',
  formal: 'M,s ⊨ E α  iff  there is a path π starting at s with M,π ⊨ α.',
  equivalences: ['E α ≡ ¬A ¬α'],
  patterns: [
    { formula: 'E (G (F p))', reading: 'some path visits p infinitely often — the book’s ψ4, in CTL* but in neither LTL nor CTL (§5.5.3)' },
  ],
  pitfalls: [
    'The witness for E is an infinite path (a lasso) — this tool checks E per state by running a Büchi automaton for α in product with the model; see the Automaton and Product tabs.',
    'E asserts a possibility, not a policy: other paths from the same state may violate α outright.',
  ],
  bookRef: 'MCS §5.4', tutorialId: 'tut-star-E',
};

export const TUT_STAR_A: Tutorial = {
  id: 'tut-star-A', title: 'A — on every path', logic: 'ctlstar',
  intro: 'A is the bridge from path formulas back to state formulas — and the quantifier LTL always applied silently.',
  steps: [
    { text: 'Back on the book’s running example, as plain LTL: `F r` carries a ✓∀ badge — the ∀ says the verdict quantifies over **all** paths from every initial state, implicitly. LTL never writes that quantifier down.',
      setup: { model: M_BOOK, formulas: [{ text: 'F r', logic: 'ltl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now add the CTL* formula `A (F r)`. Same meaning, same verdict — but the quantifier is *written*. This is the book’s Prop 5.4.1: `M,s ⊨_LTL α  iff  M,s ⊨_CTL* A α` — LTL is the A-fragment of CTL*.',
      checkpoint: hasFormula('ctlstar', 'A (F r)'),
      solution: { formulas: [{ text: 'F r', logic: 'ltl' }, { text: 'A (F r)', logic: 'ctlstar' }] } },
    { text: 'Add `A (G (F r))` — a *compound* path formula under one A: on every path, r happens infinitely often. It is ✓ here — every loop of the model keeps passing an r-state. In CTL you would be forced to interleave quantifiers (`AG AF r`); CTL* lets G and F talk about the *same* path.',
      checkpoint: hasFormula('ctlstar', 'A (G (F r))'),
      solution: { formulas: [{ text: 'F r', logic: 'ltl' }, { text: 'A (F r)', logic: 'ctlstar' }, { text: 'A (G (F r))', logic: 'ctlstar' }] } },
    { text: 'Select nodes in the syntax tree and watch the Inspector tag each one **state** or **path**: `G F r` is a path formula (meaningful only along a path), while `A G F r` is a state formula again. A is the bridge from path back to state.' },
    { text: 'Duality: `A α ≡ ¬E ¬α`. And CTL is just CTL* with the quantifiers glued to single operators — AG, AF, AX are A+G, A+F, A+X fused. Careful though: `A (F (G p))` is **not** CTL’s `AF AG p` (MCS Remark 5.5.1). Try the E tutorial next.' },
  ],
};

export const TUT_STAR_E: Tutorial = {
  id: 'tut-star-E', title: 'E — on some path', logic: 'ctlstar',
  intro: 'E asserts a possibility over whole path behaviour — the quantifier that takes you beyond both LTL and CTL.',
  steps: [
    { text: 'On the running example, `E (G (F p))` is ✓: **some** path — the s0 ⇄ s1 loop — visits `p` infinitely often. This is the book’s ψ4 (MCS §5.5.3): expressible in CTL* but in *neither* LTL (no E) *nor* CTL (G F cannot be split into quantified pieces).',
      setup: { model: M_BOOK, formulas: [{ text: 'E (G (F p))', logic: 'ctlstar' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Select the `G F p` path-subformula in the syntax tree — the Inspector tags it as a **path** formula: it only makes sense along a path, and the E above it is what turns it back into a checkable state property.',
      checkpoint: selectedIs('G F p'),
      solution: { selectSubformulaPretty: 'G F p' }, highlight: 'inspector-tree' },
    { text: 'How does the tool check it? Open the **Automaton** tab: it shows the Büchi automaton built for the path formula under this quantifier — the checker runs it in product with the model and looks for an accepting cycle.',
      checkpoint: tabIs('automaton'),
      solution: { viewTab: 'automaton' } },
    { text: 'Now add `E (G p)` — "some path stays in p-states forever". It is ✗: `p` holds only at s0, and s0 has no self-loop, so no path can remain in p-states. No accepting lasso exists in the product.',
      checkpoint: hasFormula('ctlstar', 'E (G p)'),
      solution: { formulas: [{ text: 'E (G (F p))', logic: 'ctlstar' }, { text: 'E (G p)', logic: 'ctlstar' }] } },
    { text: 'Duality: `E α ≡ ¬A ¬α` — asserting a possibility is denying its universal negation, the move LTL’s "encoding trick" (§5.2.5) can only make at the top level. Under the hood the check is per-state: automaton × model, the construction of MCS ch. 10 factored through Büchi automata.' },
  ],
};

export const STAR_REFS: ReferenceDoc[] = [REF_STAR_A, REF_STAR_E];
export const STAR_TUTS: Tutorial[] = [TUT_STAR_A, TUT_STAR_E];
