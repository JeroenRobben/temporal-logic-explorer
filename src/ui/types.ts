import { CTLNode, ParseError } from '../core/ctl-parser';
import { LTLNode } from '../core/ltl-parser';
import { EvaluationRecord } from '../core/ctl-checker';
import { AllPathsResult } from '../core/ltl-allpaths';

export type Logic = 'ctl' | 'ltl';

export interface FormulaEntry {
  id: string;
  text: string;
  logic: Logic;
}

/** A trace being built: loopIndex null until the loop is closed. */
export interface PendingLasso {
  stateIds: string[];
  loopIndex: number | null;
}

export interface Analysis {
  entry: FormulaEntry;
  ast?: CTLNode;                     // CTL only
  ltlAst?: LTLNode;                  // LTL only
  error?: ParseError;
  record?: EvaluationRecord;         // CTL only
  ltlRows?: Map<number, boolean[]>;  // LTL only; absent without a complete trace
  allPaths?: AllPathsResult;         // LTL only
  /** Unified row verdict: CTL = over initial states; LTL = position 0; null = unknown. */
  verdict: boolean | null;
}

export type Selection =
  | { kind: 'state'; id: string }
  | { kind: 'formula'; id: string }
  | { kind: 'transition'; from: string; to: string }
  | null;
