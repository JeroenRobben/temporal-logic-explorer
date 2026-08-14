import { ReferenceDoc, Tutorial } from '../types';
import { and, evidenceShown, lacksTransition, selectedIs, verdictIs } from '../helpers';
import { M_REACH, M_REACH_CUT } from './models';

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

export const CTL_REFS: ReferenceDoc[] = [REF_CTL_EF];
export const CTL_TUTS: Tutorial[] = [TUT_CTL_EF];
