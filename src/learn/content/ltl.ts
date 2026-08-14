import { ReferenceDoc, Tutorial } from '../types';
import { hasFormula, hasTrace } from '../helpers';
import { M_BOOK } from './models';

export const REF_LTL_X: ReferenceDoc = {
  id: 'ltl-X', logic: 'ltl', symbol: 'X φ', name: 'Next',
  informal: 'X φ holds on a path when φ holds in the path’s next state — one step forward, no further. It is the only operator no combination of the others can express: F, G and U cannot count steps.',
  formal: 'π ⊨ X φ  iff  π¹ ⊨ φ  (the path shifted by one state satisfies φ).',
  equivalences: ['¬X φ ≡ X ¬φ (self-dual)'],
  patterns: [
    { formula: 'G (p -> X q)', reading: 'p is always immediately followed by q' },
  ],
  pitfalls: [
    'X means the next STATE of the path, not "the next moment p changes" — if nothing changes for ten steps, X still looks exactly one step ahead.',
    'In CTL* this operator builds path formulas under A/E — X φ alone is a path formula, not a state formula.',
  ],
  bookRef: 'MCS §5.2', tutorialId: 'tut-ltl-X',
};

export const REF_LTL_F: ReferenceDoc = {
  id: 'ltl-F', logic: 'ltl', symbol: 'F φ', name: 'Finally / eventually',
  informal: 'F φ holds on a path when φ holds now or in some future state — the future includes the present, so a path already satisfying φ satisfies F φ at position 0.',
  formal: 'π ⊨ F φ  iff  ∃i ≥ 0 : πⁱ ⊨ φ.',
  equivalences: ['F φ ≡ ⊤ U φ', '¬F φ ≡ G ¬φ', 'F F φ ≡ F φ'],
  patterns: [
    { formula: 'G (req -> F ack)', reading: 'every request is eventually acknowledged (MCS §5.2.3)' },
    { formula: 'F (G waiting)', reading: 'the run eventually stabilizes into waiting forever' },
  ],
  pitfalls: [
    '`F G φ` and `G F φ` differ — order matters: "eventually always" demands stabilization, "always eventually" only demands infinitely many visits.',
    'There is no deadline: "eventually" may take arbitrarily long, so F φ says nothing about when.',
    'In CTL* this operator builds path formulas under A/E — pair it with a quantifier to get a state formula.',
  ],
  bookRef: 'MCS §5.2', tutorialId: 'tut-ltl-F',
};

export const REF_LTL_G: ReferenceDoc = {
  id: 'ltl-G', logic: 'ltl', symbol: 'G φ', name: 'Globally / always',
  informal: 'G φ holds on a path when φ holds at every state from now on, the current one included. Invariants live here: whatever must never be violated is a G formula.',
  formal: 'π ⊨ G φ  iff  ∀i ≥ 0 : πⁱ ⊨ φ.',
  equivalences: ['¬G φ ≡ F ¬φ', 'G φ ≡ φ ∧ X G φ (unfolding)'],
  patterns: [
    { formula: 'G (!(c1 & c2))', reading: 'mutual exclusion, the book’s safety property (MCS §5.2.5)' },
    { formula: 'G (F enabled)', reading: 'enabled infinitely often — a fairness constraint is exactly a G F condition (MCS §5.3)' },
  ],
  pitfalls: [
    'G φ implies φ — the present is included, "from now on" starts now.',
    'A single position where φ fails kills the whole path: G is as strong as its weakest state.',
    'In CTL* this operator builds path formulas under A/E — A (G φ) is the state-formula reading.',
  ],
  bookRef: 'MCS §5.2', tutorialId: 'tut-ltl-G',
};

export const REF_LTL_U: ReferenceDoc = {
  id: 'ltl-U', logic: 'ltl', symbol: 'φ U ψ', name: 'Until',
  informal: 'φ U ψ holds on a path when ψ eventually holds and φ holds at every state strictly before that. The book’s reading: "I will smoke until I get sick" — the sentence really promises that sickness happens.',
  formal: 'π ⊨ φ U ψ  iff  ∃i ≥ 0 : πⁱ ⊨ ψ and ∀j < i : πʲ ⊨ φ.',
  equivalences: ['F φ ≡ ⊤ U φ', 'φ U ψ ≡ ψ ∨ (φ ∧ X (φ U ψ))'],
  patterns: [
    { formula: 'G (up -> (up U floor5))', reading: 'once going up, keep going up until floor 5 (MCS §5.2.3)' },
  ],
  pitfalls: [
    'U is an obligation — if ψ never comes, φ U ψ fails even when φ holds forever. That weaker reading is W, weak-until, not in this tool (MCS §5.2.4).',
    'ψ at position 0 satisfies φ U ψ immediately — no φ is needed at all.',
    'In CTL* this operator builds path formulas under A/E — CTL’s A[φ U ψ]/E[φ U ψ] are the quantified forms.',
  ],
  bookRef: 'MCS §5.2', tutorialId: 'tut-ltl-U',
};

export const TUT_LTL_X: Tutorial = {
  id: 'tut-ltl-X', title: 'X — next state', logic: 'ltl',
  intro: 'X looks exactly one step ahead. The smallest temporal operator — and the one nothing else can imitate.',
  steps: [
    { text: 'Back on the book’s running example (MCS p.147). LTL formulas are checked on **paths**, not single states: the ∀ badge on `X r` means *every* path from every initial state satisfies it. Here that holds — both successors of s0 (`s1` and `s2`) carry `r`, so whatever the first step is, `r` is next.',
      setup: { model: M_BOOK, formulas: [{ text: 'X r', logic: 'ltl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now add the formula `X p` (logic LTL). Its verdict is ✗ — a path may step to `s2`, which lacks `p`.',
      checkpoint: hasFormula('ltl', 'X p'),
      solution: { formulas: [{ text: 'X r', logic: 'ltl' }, { text: 'X p', logic: 'ltl' }] } },
    { text: 'A ✗ LTL verdict always comes with a witness path. Select the `X p` row (∀✗ badge), then click **Load counterexample as trace** in the inspector — the lasso s0 → s2 (looping at s2) loads as a trace, and the timeline matrix shows `X p` ✗ at position 0.',
      checkpoint: hasTrace(),
      solution: { trace: { stateIds: ['s0', 's2'], loopIndex: 1 } } },
    { text: 'Read the matrix row for `X p`: it is exactly the `p` row **shifted one column left**. That is all X does — evaluate its argument one position later.' },
    { text: 'X is its own dual (`¬X φ ≡ X ¬φ`) and it is the one operator no combination of F, G and U can express: they are all step-count-blind (MCS §5.2.4). Try F next.' },
  ],
};

export const TUT_LTL_F: Tutorial = {
  id: 'tut-ltl-F', title: 'F — eventually', logic: 'ltl',
  intro: 'F is "eventually": somewhere along the path, now or later. Watch how it differs from "eventually forever".',
  steps: [
    { text: 'On the running example, `F r` holds on every path (✓∀): either the first step reaches an `r`-state, or — since s1 and s2 both carry `r` — you were already about to. The future includes the present: a path starting in an `r`-state satisfies `F r` at position 0.',
      setup: { model: M_BOOK, formulas: [{ text: 'F r', logic: 'ltl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now add `F (G r)` — "eventually **always** r". This demands the path *stabilizes* into r-states forever, and the verdict is ✗.',
      checkpoint: hasFormula('ltl', 'F (G r)'),
      solution: { formulas: [{ text: 'F r', logic: 'ltl' }, { text: 'F (G r)', logic: 'ltl' }] } },
    { text: 'Select the ✗ row (∀✗ badge), then click **Load counterexample as trace** in the inspector. The lasso s0 ⇄ s1 (looping back to s0) visits `r` at every s1 — infinitely often! — yet never *stays* in r: each return to s0 breaks `G r` again.',
      checkpoint: hasTrace(),
      solution: { trace: { stateIds: ['s0', 's1'], loopIndex: 0 } } },
    { text: 'Contrast with `G (F r)` — "always eventually r" — which is ✓ on this model: the s0⇄s1 loop that killed `F G r` satisfies it happily, because r keeps coming back. This is the book’s p.147 example pair: **F G ≠ G F**, and the order tells you whether you demanded stabilization or mere recurrence.' },
    { text: 'Dualities: `¬F φ ≡ G ¬φ` ("never" is the negation of "eventually") and `F φ ≡ ⊤ U φ` — F is Until with a trivial left side. The workhorse pattern is request/response: `G (req -> F ack)` (MCS §5.2.3).' },
  ],
};

export const TUT_LTL_G: Tutorial = {
  id: 'tut-ltl-G', title: 'G — always', logic: 'ltl',
  intro: 'G is "always from now on" — the shape of every invariant and every safety property.',
  steps: [
    { text: 'On the running example, `G !(p & r)` is ✓∀: no reachable state carries both `p` and `r`, so the invariant holds at every position of every path. This is what a **safety property** looks like — nothing bad ever happens.',
      setup: { model: M_BOOK, formulas: [{ text: 'G !(p & r)', logic: 'ltl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now add `G q`. It is ✗ — `q` holds at s0 and s1, but not everywhere.',
      checkpoint: hasFormula('ltl', 'G q'),
      solution: { formulas: [{ text: 'G !(p & r)', logic: 'ltl' }, { text: 'G q', logic: 'ltl' }] } },
    { text: 'Select the ✗ row (∀✗ badge), then click **Load counterexample as trace** in the inspector: the lasso s0 → s2 (staying at s2) visits `s2` once — and one q-less position is all it takes. G is as strong as its weakest state.',
      checkpoint: hasTrace(),
      solution: { trace: { stateIds: ['s0', 's2'], loopIndex: 1 } } },
    { text: 'Nesting G over F gives the third classic shape: `G (F φ)` — "φ infinitely often". Fairness constraints are exactly G F conditions: "the scheduler grants me infinitely often" (MCS §5.3).' },
    { text: 'Duality: `¬G φ ≡ F ¬φ` — an invariant fails exactly when a violation is eventually reached. And the unfolding `G φ ≡ φ ∧ X G φ` — "φ now, and G φ from the next state" — is literally how the checker evaluates G along a lasso.' },
  ],
};

export const TUT_LTL_U: Tutorial = {
  id: 'tut-ltl-U', title: 'U — until', logic: 'ltl',
  intro: 'Until carries one condition up to the arrival of another — and promises the arrival.',
  steps: [
    { text: 'On the running example, `q U r` is ✓∀: `q` holds at s0, and every path reaches an `r`-state (s1 or s2) at step 1 — `q` carries until `r` arrives.',
      setup: { model: M_BOOK, formulas: [{ text: 'q U r', logic: 'ltl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'The book’s reading of φ U ψ: **"I will smoke until I get sick."** The sentence doesn’t just describe smoking — it promises the sickness happens. U always contains an F: the right side *must* eventually hold.' },
    { text: 'Now add `(!p) U r`. It is ✗ — at position 0 (state s0), `p` holds and `r` doesn’t, so the "until" is already broken at the very first state.',
      checkpoint: hasFormula('ltl', '(!p) U r'),
      solution: { formulas: [{ text: 'q U r', logic: 'ltl' }, { text: '(!p) U r', logic: 'ltl' }] } },
    { text: 'Select the ✗ row (∀✗ badge), then click **Load counterexample as trace** in the inspector to see a concrete failing path: s0 → s2 (staying at s2). The timeline matrix shows `!p` already false at position 0, before `r` ever arrives.',
      checkpoint: hasTrace(),
      solution: { trace: { stateIds: ['s0', 's2'], loopIndex: 1 } } },
    { text: 'U is an **obligation**: if ψ never comes, φ U ψ fails even when φ holds forever. The weaker reading — φ forever also counts — is W, weak-until, which this tool does not include (MCS §5.2.4). And `F φ ≡ ⊤ U φ`: eventually is just Until with nothing to carry.' },
  ],
};

export const LTL_REFS: ReferenceDoc[] = [REF_LTL_X, REF_LTL_F, REF_LTL_G, REF_LTL_U];
export const LTL_TUTS: Tutorial[] = [TUT_LTL_X, TUT_LTL_F, TUT_LTL_G, TUT_LTL_U];
