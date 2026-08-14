// src/learn/replay.ts — pure simulation of the app state a tutorial drives.
// Used by the content battery (content.test.ts) to replay every tutorial
// without rendering the UI.
import { KripkeStructure } from '../core/kripke';
import { parseCTL, ParseError } from '../core/ctl-parser';
import { checkCTL } from '../core/ctl-checker';
import { parseLTL } from '../core/ltl-parser';
import { checkLTL } from '../core/ltl-checker';
import { validateLasso } from '../core/trace';
import { parseCTLStar } from '../core/ctlstar-parser';
import { checkCTLStar } from '../core/ctlstar-checker';
import { AutomatonTooLarge } from '../core/buchi';
import { Logic, PendingLasso } from '../ui/types';
import { LearnView, StepSetup } from './types';
import { prettyOfNode, findNodeByPretty } from './engine';

export interface SimState {
  model: KripkeStructure;
  formulas: { text: string; logic: Logic }[];
  activeFormulaIndex: number;
  selectedNodeId: number | null;
  viewTab: string;
  trace: PendingLasso | null;
  showEvidence: boolean;
}

export function initialSim(): SimState {
  return {
    model: { states: [], transitions: [] },
    formulas: [],
    activeFormulaIndex: -1,
    selectedNodeId: null,
    viewTab: 'model',
    trace: null,
    showEvidence: false,
  };
}

export function applySim(s: SimState, setup: StepSetup): SimState {
  const next = { ...s };
  if (setup.model) next.model = structuredClone(setup.model);
  if (setup.formulas) { next.formulas = setup.formulas.map((f) => ({ ...f })); next.activeFormulaIndex = -1; next.selectedNodeId = null; }
  if (setup.activeFormulaIndex !== undefined) { next.activeFormulaIndex = setup.activeFormulaIndex; next.selectedNodeId = null; }
  if (setup.selectSubformulaPretty !== undefined) {
    const f = next.formulas[next.activeFormulaIndex];
    next.selectedNodeId = f ? findNodeByPretty(f.logic, f.text, setup.selectSubformulaPretty) : null;
  }
  if (setup.viewTab) next.viewTab = setup.viewTab;
  if (setup.trace !== undefined) next.trace = setup.trace;
  if (setup.showEvidence !== undefined) next.showEvidence = setup.showEvidence;
  return next;
}

/**
 * Per-formula verdict, mirroring App.tsx's `analyses` useMemo (App.tsx lines
 * 160–188) plus its `completeLasso` memo (lines 115–119):
 * - ctl:     verdict = checkCTL(model, parseCTL(text)).verdict — the record's
 *            conjunction over initial states (App line 182–183).
 * - ltl:     App's unified row verdict is the *trace* verdict: when the
 *            current trace is a complete lasso that validates against the
 *            model, verdict = checkLTL(model, lasso, ast) row of the root at
 *            position 0 (App lines 165, 169); otherwise null. (The ∀-verdict
 *            from checkLTLAllPaths is shown as a separate badge in the UI and
 *            is NOT Analysis.verdict, so it is not the LearnView verdict.)
 * - ctlstar: verdict = checkCTLStar(model, parseCTLStar(text)).verdict — the
 *            conjunction over initial states; null when the automaton is
 *            too large (App lines 172–179).
 * - Parse errors yield verdict null for every logic (App line 185).
 */
function verdictOf(model: KripkeStructure, f: { text: string; logic: Logic }, trace: PendingLasso | null): boolean | null {
  try {
    if (f.logic === 'ltl') {
      const ast = parseLTL(f.text);
      if (trace === null || trace.loopIndex === null) return null;
      const lasso = { stateIds: trace.stateIds, loopIndex: trace.loopIndex };
      if (validateLasso(model, lasso) !== null) return null;
      const rows = checkLTL(model, lasso, ast);
      return rows.get(ast.id)![0];
    }
    if (f.logic === 'ctlstar') {
      const ast = parseCTLStar(f.text);
      try {
        return checkCTLStar(model, ast).verdict;
      } catch (e) {
        if (e instanceof AutomatonTooLarge) return null;
        throw e;
      }
    }
    return checkCTL(model, parseCTL(f.text)).verdict;
  } catch (e) {
    if (e instanceof ParseError) return null;
    throw e;
  }
}

export function viewOf(s: SimState): LearnView {
  const active = s.activeFormulaIndex >= 0 ? s.formulas[s.activeFormulaIndex] ?? null : null;
  return {
    model: s.model,
    formulas: s.formulas.map((f) => ({ text: f.text, logic: f.logic, verdict: verdictOf(s.model, f, s.trace) })),
    activeFormulaIndex: s.activeFormulaIndex,
    selectedSubformulaPretty: active && s.selectedNodeId !== null
      ? prettyOfNode(active.logic, active.text, s.selectedNodeId)
      : null,
    viewTab: s.viewTab,
    hasTrace: s.trace !== null && s.trace.stateIds.length > 0,
    showEvidence: s.showEvidence,
  };
}
