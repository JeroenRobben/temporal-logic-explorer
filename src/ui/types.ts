import { CTLNode, ParseError } from '../core/ctl-parser';
import { EvaluationRecord } from '../core/ctl-checker';

export interface FormulaEntry {
  id: string;
  text: string;
}

export interface Analysis {
  entry: FormulaEntry;
  ast?: CTLNode;
  error?: ParseError;
  record?: EvaluationRecord;
}

export type Selection =
  | { kind: 'state'; id: string }
  | { kind: 'formula'; id: string }
  | null;
