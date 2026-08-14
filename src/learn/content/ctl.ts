import { ReferenceDoc, Tutorial } from '../types';
import { and, evidenceShown, hasFormula, lacksTransition, selectedIs, verdictIs } from '../helpers';
import { M_BOOK, M_DEAD, M_ESCAPE, M_ESCAPE_CUT, M_REACH, M_REACH_CUT } from './models';

export const REF_CTL_EF: ReferenceDoc = {
  id: 'ctl-EF', logic: 'ctl', symbol: 'EF φ', name: 'Exists-Finally (reachability)',
  informal: 'EF φ holds at a state when some path from it reaches a state where φ holds — φ is possibly reachable. The book reads it as "some path goes through a state in which φ is true"; because the future includes the present, a state satisfying φ satisfies EF φ itself.',
  formal: 'M,s ⊨ EF φ  iff  there is a path s = s₀ → s₁ → … and some i ≥ 0 with M,sᵢ ⊨ φ.',
  equivalences: ['EF φ ≡ E[⊤ U φ]', 'AG φ ≡ ¬EF ¬φ'],
  patterns: [
    { formula: 'AG (EF restart)', reading: 'from every reachable state it is possible to get back to restart (MCS §5.5.2)' },
    { formula: 'EF (c1 & c2)', reading: 'a bad combination is reachable — safety violation phrased as reachability' },
  ],
  pitfalls: [
    'Possibility is exactly what LTL cannot express: M,s ⊭ φ is not the same as M,s ⊨ ¬φ (the book’s "encoding trick" discussion, MCS §5.2.5).',
    'This tool uses maximal-path semantics at deadlocks: finite paths that end in a deadlock still count as paths for EF.',
  ],
  bookRef: 'MCS §5.5.1–5.5.3', tutorialId: 'tut-ctl-EF',
};

export const TUT_CTL_EF: Tutorial = {
  id: 'tut-ctl-EF', title: 'EF — reachability', logic: 'ctl',
  intro: 'EF is "possibly": some run reaches φ. Built on the book’s two-state substructure example (Fig 5.12).',
  steps: [
    { text: 'Two states from MCS Fig 5.12: `s` (no propositions) can stay at `s` or move to `t`, where `p` holds. **EF p** asks: can we reach `p`? The ✓ verdict says yes from s.',
      setup: { model: M_REACH, formulas: [{ text: 'EF p', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Select the `EF p` root in the inspector tree — the sat-set rings show **both** states satisfy it: from `t`, p holds *now*, and the future includes the present.',
      checkpoint: selectedIs('EF p'), solution: { selectSubformulaPretty: 'EF p' }, highlight: 'inspector-tree' },
    { text: 'Turn on **Evidence** to see the witness path s → t drawn on the canvas — the finite path that certifies EF p.',
      checkpoint: evidenceShown(), solution: { showEvidence: true }, highlight: 'inspector-evidence' },
    { text: 'Now break reachability: **delete the transition s → t** (click it, press Delete). The verdict flips to ✗. This is the book’s substructure theorem (5.5.1) in action: removing edges can only shrink what EF reaches — which is why AG EF p can never be expressed in LTL.',
      checkpoint: and(lacksTransition('s', 't'), verdictIs(0, false)), solution: { model: M_REACH_CUT } },
    { text: 'Duality: `AG φ ≡ ¬EF ¬φ` — invariance is the impossibility of reaching a violation. And `EF φ ≡ E[⊤ U φ]`: EF is just Until with a trivial left side. Try the AG tutorial next.' },
  ],
};

export const REF_CTL_AX: ReferenceDoc = {
  id: 'ctl-AX', logic: 'ctl', symbol: 'AX φ', name: 'All-Next',
  informal: 'AX φ holds at a state when φ holds in every next state — whatever the very first step is, φ waits on the other side. The book reads it as "in every next state, φ" (MCS §5.5.1).',
  formal: 'M,s ⊨ AX φ  iff  for all transitions s → s′: M,s′ ⊨ φ.',
  equivalences: ['AX φ ≡ ¬EX ¬φ'],
  patterns: [
    { formula: 'AG (p -> AX q)', reading: 'whenever p holds, q is guaranteed one step later — on every branch' },
  ],
  pitfalls: [
    'AX is vacuously true at deadlocks: a state with no successors satisfies AX φ for every φ, because "all successors" quantifies over the empty set. This tool’s `AX false` is exactly the deadlock detector.',
    'AX looks exactly one step ahead on every branch — it says nothing about the state you are in now.',
  ],
  bookRef: 'MCS §5.5', tutorialId: 'tut-ctl-AX',
};

export const REF_CTL_EX: ReferenceDoc = {
  id: 'ctl-EX', logic: 'ctl', symbol: 'EX φ', name: 'Exists-Next',
  informal: 'EX φ holds at a state when φ holds in some next state — at least one available step lands in φ. The book reads it as "in some next state, φ" (MCS §5.5.1).',
  formal: 'M,s ⊨ EX φ  iff  there is a transition s → s′ with M,s′ ⊨ φ.',
  equivalences: ['EX φ ≡ ¬AX ¬φ'],
  patterns: [
    { formula: 'AG (n1 -> EX t1)', reading: 'non-blocking: a process can always request — the book’s CTL-only property (MCS §5.2.5/5.5.2)' },
  ],
  pitfalls: [
    'EX is false at deadlocks for every φ — even `EX true` fails where there is no step to take, which is the dual of AX’s vacuous truth.',
    'EX asserts a possibility of one step, not a policy: the system may also have steps that avoid φ entirely.',
  ],
  bookRef: 'MCS §5.5', tutorialId: 'tut-ctl-EX',
};

export const REF_CTL_AF: ReferenceDoc = {
  id: 'ctl-AF', logic: 'ctl', symbol: 'AF φ', name: 'All-Finally (inevitability)',
  informal: 'AF φ holds at a state when every path from it eventually passes a φ-state — φ is inevitable, no run can dodge it forever. The book reads it as "on all paths, in some future state" (MCS §5.5.1).',
  formal: 'M,s ⊨ AF φ  iff  every maximal path s = s₀ → s₁ → … has some i ≥ 0 with M,sᵢ ⊨ φ.',
  equivalences: ['AF φ ≡ ¬EG ¬φ'],
  patterns: [
    { formula: 'AG (t1 -> AF c1)', reading: 'liveness: every request is eventually served (MCS §5.2.5)' },
    { formula: 'AF (AX false)', reading: 'every run eventually deadlocks (MCS p.160/162)' },
  ],
  pitfalls: [
    'This tool counts finite maximal paths: a run that ends in a deadlock must still pass a φ-state for AF φ to hold — the Inspector warns when deadlock semantics matter.',
    '`AF AG φ` is *stronger* than LTL’s `F G φ`: the CTL formula demands invariance across all branches from the stabilization point (book Remark 5.5.1).',
  ],
  bookRef: 'MCS §5.5', tutorialId: 'tut-ctl-AF',
};

export const REF_CTL_AG: ReferenceDoc = {
  id: 'ctl-AG', logic: 'ctl', symbol: 'AG φ', name: 'All-Globally (invariance)',
  informal: 'AG φ holds at a state when φ holds at every state of every path from it — an invariant over everything reachable. The book reads it as "on all paths, in all future states" (MCS §5.5.1).',
  formal: 'M,s ⊨ AG φ  iff  every path s = s₀ → s₁ → … has M,sᵢ ⊨ φ for all i ≥ 0.',
  equivalences: ['AG φ ≡ ¬EF ¬φ'],
  patterns: [
    { formula: 'AG (!(c1 & c2))', reading: 'safety invariant: the bad combination never occurs anywhere reachable' },
    { formula: 'AG (EF restart)', reading: 'reset always possible — CTL-only, not expressible in LTL (MCS §5.5.2)' },
  ],
  pitfalls: [
    'AG quantifies over *reachable* states only — states no path visits can violate φ without harming AG φ.',
  ],
  bookRef: 'MCS §5.5', tutorialId: 'tut-ctl-AG',
};

export const REF_CTL_EG: ReferenceDoc = {
  id: 'ctl-EG', logic: 'ctl', symbol: 'EG φ', name: 'Exists-Globally (persistence)',
  informal: 'EG φ holds at a state when some path from it keeps φ true at every state forever — φ *can* persist, whatever the other branches do. The book reads it as "on some path, in all future states" (MCS §5.5.1).',
  formal: 'M,s ⊨ EG φ  iff  some maximal path s = s₀ → s₁ → … has M,sᵢ ⊨ φ for all i.',
  equivalences: ['EG φ ≡ ¬AF ¬φ'],
  patterns: [
    { formula: 'EG p & AG (EX (! p))', reading: 'p can persist forever although it could die at any moment — the book’s opening branching-time example (MCS Example 5.2.1), inexpressible in LTL' },
  ],
  pitfalls: [
    'The witness for EG is a lasso — a path that loops through φ-states forever — or, in this tool’s deadlock semantics, a finite maximal path that stays in φ-states until it gets stuck.',
  ],
  bookRef: 'MCS §5.5', tutorialId: 'tut-ctl-EG',
};

export const REF_CTL_AU: ReferenceDoc = {
  id: 'ctl-AU', logic: 'ctl', symbol: 'A[φ U ψ]', name: 'All-Until',
  informal: 'A[φ U ψ] holds at a state when on every path from it, φ holds until ψ holds — and ψ must actually arrive on each of them. Until’s obligation, imposed branch by branch.',
  formal: 'M,s ⊨ A[φ U ψ]  iff  every maximal path s = s₀ → s₁ → … has some i ≥ 0 with M,sᵢ ⊨ ψ and M,sⱼ ⊨ φ for all j < i.',
  equivalences: ['A[φ U ψ] ≡ ¬(E[¬ψ U (¬φ ∧ ¬ψ)] ∨ EG ¬ψ) (MCS p.162)'],
  patterns: [
    { formula: 'A[q U r]', reading: 'on every run, q carries until r takes over' },
  ],
  pitfalls: [
    'The obligation lands on *every* path: one branch where ψ never comes sinks the whole formula, even if φ holds forever there. There is no weak variant in this tool (MCS §5.2.4).',
  ],
  bookRef: 'MCS §5.5', tutorialId: 'tut-ctl-AU',
};

export const REF_CTL_EU: ReferenceDoc = {
  id: 'ctl-EU', logic: 'ctl', symbol: 'E[φ U ψ]', name: 'Exists-Until',
  informal: 'E[φ U ψ] holds at a state when some path from it carries φ until ψ holds. One successful run is enough — and because Until is satisfied at the position where ψ hits, a *finite* prefix decides it (the book’s Prop 10.1.1).',
  formal: 'M,s ⊨ E[φ U ψ]  iff  there is a finite path s = s₀ → … → sₙ with M,sₙ ⊨ ψ and M,sᵢ ⊨ φ for all i < n.',
  equivalences: ['EF φ ≡ E[true U φ]'],
  patterns: [
    { formula: 'E[(p & q) U r]', reading: 'some run keeps both p and q alive until r arrives (MCS p.160)' },
  ],
  pitfalls: [
    'The checker computes EU by backward reachability from the ψ-states (MCS §10.1) — watch the iteration records in the Inspector to see the sat set grow frontier by frontier.',
  ],
  bookRef: 'MCS §5.5', tutorialId: 'tut-ctl-EU',
};

export const TUT_CTL_AX: Tutorial = {
  id: 'tut-ctl-AX', title: 'AX — every next state', logic: 'ctl',
  intro: 'AX inspects all successors at once — and quantifying over successors has a famous edge case: none at all.',
  steps: [
    { text: 'On the book’s running example (MCS p.147), `AX r` is ✓: both successors of s0 — `s1` and `s2` — carry `r`, so *every* next state satisfies it.',
      setup: { model: M_BOOK, formulas: [{ text: 'AX r', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now add `AX q`. The verdict is ✗ — `s2` is a successor of s0 and it lacks `q`. One bad branch is all AX needs.',
      checkpoint: hasFormula('ctl', 'AX q'),
      solution: { formulas: [{ text: 'AX r', logic: 'ctl' }, { text: 'AX q', logic: 'ctl' }] } },
    { text: 'Switch of scenery: `d0` steps to `d1`, and `d1` has **no outgoing transitions** — a deadlock. At a deadlock, "every successor satisfies φ" quantifies over the empty set, so `AX false` is *vacuously true* exactly at stuck states. That makes `AF (AX false)` — ✓ here — the deadlock detector: "every run eventually reaches a state with no way out".',
      setup: { model: M_DEAD, formulas: [{ text: 'AF (AX false)', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Select the `AX false` subformula in the inspector tree. Its sat set is exactly {d1} — the deadlock, and nothing else.',
      checkpoint: selectedIs('AX false'), solution: { selectSubformulaPretty: 'AX false' }, highlight: 'inspector-tree' },
    { text: 'Duality: `AX φ ≡ ¬EX ¬φ` — and the vacuity flips sides: EX is *false* at deadlocks for every φ. Counting vacuous truths this way is a deliberate semantic choice, documented in the Inspector wherever it matters.' },
  ],
};

export const TUT_CTL_EX: Tutorial = {
  id: 'tut-ctl-EX', title: 'EX — some next state', logic: 'ctl',
  intro: 'EX asks for one good step. The smallest possible possibility.',
  steps: [
    { text: 'On the running example, `EX (q & r)` is ✓ (book Exercise 5.5.1): s0 has a successor — `s1` — carrying both `q` and `r`. One such successor is all EX asks for.',
      setup: { model: M_BOOK, formulas: [{ text: 'EX (q & r)', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Select the `EX (q ∧ r)` root in the inspector tree — the sat-set rings show which states have such a step available.',
      checkpoint: selectedIs('EX (q ∧ r)'), solution: { selectSubformulaPretty: 'EX (q ∧ r)' }, highlight: 'inspector-tree' },
    { text: 'Now add `EX (p & q)`. It is ✗ — s0’s successors are s1 {q,r} and s2 {r}; neither carries both `p` and `q`, so no single step works.',
      checkpoint: hasFormula('ctl', 'EX (p & q)'),
      solution: { formulas: [{ text: 'EX (q & r)', logic: 'ctl' }, { text: 'EX (p & q)', logic: 'ctl' }] } },
    { text: 'The workhorse pattern: `AG (n1 -> EX t1)` — "whenever process 1 is non-critical, it *can* request" — the non-blocking property from the book’s mutual-exclusion chapter (MCS §5.2.5/5.5.2). A possibility at every reachable state: exactly what LTL cannot say.' },
    { text: 'Duality: `EX φ ≡ ¬AX ¬φ`. And the deadlock edge case runs the other way from AX: at a state with no successors, `EX φ` is false for every φ — even `EX true`.' },
  ],
};

export const TUT_CTL_AF: Tutorial = {
  id: 'tut-ctl-AF', title: 'AF — inevitability', logic: 'ctl',
  intro: 'AF says φ cannot be dodged: every run gets there. Watch one stubborn loop hold out — then cut it.',
  steps: [
    { text: 'The book’s Example 5.2.1 structure: `a` carries `p` and can loop on itself or fall to `b`, where `p` is gone. **AF (¬p)** — "on every run, p eventually dies" — is ✗: the run that circles `a` forever keeps `p` alive. Evidence shows exactly that loop.',
      setup: { model: M_ESCAPE, formulas: [{ text: 'AF (! p)', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Turn on **Evidence** to see the counterexample on the canvas: the a → a self-loop, a whole run on which `¬p` never happens.',
      checkpoint: evidenceShown(), solution: { showEvidence: true }, highlight: 'inspector-evidence' },
    { text: 'Now destroy the holdout: **delete the transition a → a** (click it, press Delete). With the loop gone, every run must fall to `b` — and the verdict flips to ✓: `¬p` has become inevitable.',
      checkpoint: and(lacksTransition('a', 'a'), verdictIs(0, true)), solution: { model: M_ESCAPE_CUT } },
    { text: 'What you just did, in duality terms: `AF φ ≡ ¬EG ¬φ`. The a-loop was the witness for `EG p` — a path where p holds forever. Cutting it destroyed that witness, and AF (¬p) is precisely the statement that no such witness exists.' },
    { text: 'AF is the shape of liveness: `AG (t1 -> AF c1)` — "every request is eventually served" (MCS §5.2.5). One caveat in this tool: finite maximal paths count, so a run ending in a deadlock must still pass a φ-state — the Inspector warns when that deadlock semantics is in play.' },
  ],
};

export const TUT_CTL_AG: Tutorial = {
  id: 'tut-ctl-AG', title: 'AG — invariance', logic: 'ctl',
  intro: 'AG is the invariant quantifier: φ at every reachable state, on every branch.',
  steps: [
    { text: 'On the running example, `AG (p | q | r)` is ✓: every reachable state carries at least one of the three propositions — an invariant over the whole reachable structure.',
      setup: { model: M_BOOK, formulas: [{ text: 'AG (p | q | r)', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now add `AG q`. It is ✗ — `q` holds at s0 and s1, but `s2` is reachable and q-less.',
      checkpoint: hasFormula('ctl', 'AG q'),
      solution: { formulas: [{ text: 'AG (p | q | r)', logic: 'ctl' }, { text: 'AG q', logic: 'ctl' }], activeFormulaIndex: 1 } },
    { text: 'Turn on **Evidence** for the ✗ formula: the canvas draws a counterexample path from s0 into `s2` — the concrete route to the violation.',
      checkpoint: evidenceShown(), solution: { showEvidence: true }, highlight: 'inspector-evidence' },
    { text: 'The formula AG was born for: back on MCS Fig 5.12, `AG (EF p)` — "wherever you end up, p stays *reachable*". This is the book’s ψ1, the classic property CTL can state and LTL provably cannot (Theorem 5.5.1): possibility under invariance.',
      setup: { model: M_REACH, formulas: [{ text: 'AG (EF p)', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Duality: `AG φ ≡ ¬EF ¬φ` — invariance is unreachability of a violation. And remember the scope: AG only quarrels with *reachable* states; unreachable ones can do as they please.' },
  ],
};

export const TUT_CTL_EG: Tutorial = {
  id: 'tut-ctl-EG', title: 'EG — persistence', logic: 'ctl',
  intro: 'EG says φ can hold forever — one path suffices, however precarious.',
  steps: [
    { text: 'The Example 5.2.1 structure again: `a` {p} can loop or fall to `b` {}. **EG p** is ✓ — the witness is the run that stays on the a-loop forever, keeping `p` alive at every step.',
      setup: { model: M_ESCAPE, formulas: [{ text: 'EG p', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Select the `EG p` root in the inspector tree — the sat set is {a}: only from `a` can a run keep p forever; from `b` it is already too late.',
      checkpoint: selectedIs('EG p'), solution: { selectSubformulaPretty: 'EG p' }, highlight: 'inspector-tree' },
    { text: 'Now **delete the transition a → a**. The only p-forever path is gone, and `EG p` flips to ✗ — every remaining run falls to `b`.',
      checkpoint: and(lacksTransition('a', 'a'), verdictIs(0, false)), solution: { model: M_ESCAPE_CUT } },
    { text: 'Loop restored — now the book’s full Example 5.2.1 formula: `EG p ∧ AG (EX ¬p)` is ✓. Read it slowly: p *can* stay true forever (the loop), although at every reachable moment it *could* become false in one step (the exit to b). Two futures from every instant — branching time in a single formula, inexpressible in LTL.',
      setup: { model: M_ESCAPE, formulas: [{ text: 'EG p & AG (EX (! p))', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Duality: `EG φ ≡ ¬AF ¬φ` — persistence is the failure of inevitability. The witness EG produces is a lasso: a stem into a loop of φ-states (or, with this tool’s deadlock semantics, a finite maximal path that never leaves φ).' },
  ],
};

export const TUT_CTL_AU: Tutorial = {
  id: 'tut-ctl-AU', title: 'A[U] — until, on every path', logic: 'ctl',
  intro: 'Until with the obligation imposed on every branch: the right side must arrive, whichever way the run goes.',
  steps: [
    { text: 'On the running example, `A[q U r]` is ✓: `q` holds at s0, and every path reaches an `r`-state (s1 or s2) at step 1 — on each branch, q carries until r takes over.',
      setup: { model: M_BOOK, formulas: [{ text: 'A[q U r]', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now add `A[q U (p & r)]`. It is ✗ — no reachable state carries both `p` and `r`, so the goal never occurs. **U fails when the goal never comes**, even though q dutifully holds along the way.',
      checkpoint: hasFormula('ctl', 'A[q U (p & r)]'),
      solution: { formulas: [{ text: 'A[q U r]', logic: 'ctl' }, { text: 'A[q U (p & r)]', logic: 'ctl' }], activeFormulaIndex: 1 } },
    { text: 'Select the failing formula’s root, `A[q U p ∧ r]`, in the inspector tree — its sat set is empty: the obligation is unmeetable from everywhere.',
      checkpoint: selectedIs('A[q U p ∧ r]'), solution: { selectSubformulaPretty: 'A[q U p ∧ r]' }, highlight: 'inspector-tree' },
    { text: 'This is the U-obligation from the LTL chapter again, now on every branch at once. A weak until — "q forever also counts" — would accept this formula, but W is not in this tool (MCS §5.2.4).' },
    { text: 'AU has no simple one-operator dual; the book’s p.162 chain does it in three: `A[φ U ψ] ≡ ¬(E[¬ψ U (¬φ ∧ ¬ψ)] ∨ EG ¬ψ)` — either you can reach a point where φ dies before ψ arrived, or you can dodge ψ forever. If neither escape exists, the until is forced.' },
  ],
};

export const TUT_CTL_EU: Tutorial = {
  id: 'tut-ctl-EU', title: 'E[U] — until, on some path', logic: 'ctl',
  intro: 'One run carrying φ up to ψ is enough — and a finite one at that.',
  steps: [
    { text: 'On the running example, `E[q U r]` is ✓: the step s0 → s1 is already a complete witness — q at s0, r at s1. E[U] needs only one such run.',
      setup: { model: M_BOOK, formulas: [{ text: 'E[q U r]', logic: 'ctl' }], activeFormulaIndex: 0, trace: null } },
    { text: 'Now the book’s own example (MCS p.160): add `E[(p & q) U r]`. It is ✓ — s0 itself carries both `p` and `q`, and one step reaches `r`.',
      checkpoint: hasFormula('ctl', 'E[(p & q) U r]'),
      solution: { formulas: [{ text: 'E[q U r]', logic: 'ctl' }, { text: 'E[(p & q) U r]', logic: 'ctl' }] } },
    { text: 'One more: add `E[true U r]` and compare it with what you know of `EF r` — same sat set, necessarily. `EF φ ≡ E[true U φ]`: EF *is* sugar for Until with nothing to carry.',
      checkpoint: hasFormula('ctl', 'E[true U r]'),
      solution: { formulas: [{ text: 'E[q U r]', logic: 'ctl' }, { text: 'E[(p & q) U r]', logic: 'ctl' }, { text: 'E[true U r]', logic: 'ctl' }] } },
    { text: 'How the checker actually computes E[φ U ψ]: **backwards** (MCS §10.1). Start from the ψ-states; repeatedly add any φ-state with a transition into the set; stop when nothing changes. Open the iteration records in the Inspector to watch the sat set grow frontier by frontier — Prop 10.1.1 guarantees a finite witness always suffices.' },
    { text: 'E[U] is the engine of the whole clan: EF is E[true U ·], and AU is expressed from EU and EG by the p.162 duality chain. Master this one and the rest are derived forms.' },
  ],
};

export const CTL_REFS: ReferenceDoc[] = [
  REF_CTL_EF, REF_CTL_AX, REF_CTL_EX, REF_CTL_AF, REF_CTL_AG, REF_CTL_EG, REF_CTL_AU, REF_CTL_EU,
];
export const CTL_TUTS: Tutorial[] = [
  TUT_CTL_EF, TUT_CTL_AX, TUT_CTL_EX, TUT_CTL_AF, TUT_CTL_AG, TUT_CTL_EG, TUT_CTL_AU, TUT_CTL_EU,
];
