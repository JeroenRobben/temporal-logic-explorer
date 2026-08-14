import { Logic } from '../ui/types';
import { Checkpoint } from './types';
import { parseForLogic, prettyForLogic } from './engine';

const norm = (logic: Logic, text: string): string | null => {
  const ast = parseForLogic(logic, text);
  return ast === null ? null : prettyForLogic(logic, ast);
};

export const tabIs = (t: string): Checkpoint => (v) => v.viewTab === t;
export const verdictIs = (i: number, val: boolean): Checkpoint => (v) => v.formulas[i]?.verdict === val;
export const activeFormulaIs = (i: number): Checkpoint => (v) => v.activeFormulaIndex === i;
export const selectedIs = (target: string): Checkpoint => (v) => v.selectedSubformulaPretty === target;
export const evidenceShown = (): Checkpoint => (v) => v.showEvidence;
export const hasTrace = (): Checkpoint => (v) => v.hasTrace;
export const hasTransition = (from: string, to: string): Checkpoint => (v) =>
  v.model.transitions.some((t) => t.from === from && t.to === to);
export const lacksTransition = (from: string, to: string): Checkpoint => (v) =>
  !v.model.transitions.some((t) => t.from === from && t.to === to);
export const hasFormula = (logic: Logic, text: string): Checkpoint => {
  return (v) => {
    const want = norm(logic, text);
    if (want === null) return false;
    return v.formulas.some((f) => f.logic === logic && norm(f.logic, f.text) === want);
  };
};
export const and = (...cs: Checkpoint[]): Checkpoint => (v) => cs.every((c) => c(v));
