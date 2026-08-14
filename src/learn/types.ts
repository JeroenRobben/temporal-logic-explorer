import { KripkeStructure } from '../core/kripke';
import { Logic, PendingLasso } from '../ui/types';

export interface ReferenceDoc {
  id: string;                 // 'ltl-U', 'ctl-EG', 'bool-and', 'star-A', 'pat-response', …
  logic: Logic | 'shared' | 'pattern';
  symbol: string;             // 'E[φ U ψ]'
  name: string;               // 'Exists-Until'
  informal: string;
  formal: string;
  equivalences: string[];     // display-only strings (may contain φ/ψ metavariables)
  patterns: { formula: string; reading: string }[];  // formula MUST parse in doc's logic
  pitfalls: string[];
  bookRef: string;            // e.g. 'MCS §5.5.1'
  tutorialId?: string;
}

export interface StepSetup {
  model?: KripkeStructure;
  formulas?: { text: string; logic: Logic }[];
  activeFormulaIndex?: number;
  selectSubformulaPretty?: string;
  viewTab?: 'model' | 'tree' | 'automaton' | 'product';
  trace?: PendingLasso | null;
  showEvidence?: boolean;
}

export interface LearnView {
  model: KripkeStructure;
  formulas: { text: string; logic: Logic; verdict: boolean | null }[];
  activeFormulaIndex: number;          // -1 when none
  selectedSubformulaPretty: string | null;
  viewTab: string;
  hasTrace: boolean;
  showEvidence: boolean;
}

export type Checkpoint = (v: LearnView) => boolean;

export interface TutorialStep {
  text: string;               // markdown-lite: **bold**, `code`
  setup?: StepSetup;          // applied on entering the step
  checkpoint?: Checkpoint;    // presence ⇒ task step (auto-advance when true)
  solution?: StepSetup;       // "Show me"; REQUIRED when checkpoint is set
  highlight?: string;         // data-learn anchor id
}

export interface Tutorial {
  id: string;
  title: string;
  logic: Logic | 'shared';
  intro: string;
  steps: TutorialStep[];      // last step MUST be info (no checkpoint)
}
