import { useEffect, useMemo, useRef, useState } from 'react';
import { deadlockStates, KripkeStructure, stateById } from '../core/kripke';
import { parseCTL, ParseError } from '../core/ctl-parser';
import { checkCTL } from '../core/ctl-checker';
import { parseLTL, pretty as prettyLTL } from '../core/ltl-parser';
import { checkLTL } from '../core/ltl-checker';
import { Lasso, validateLasso, validatePrefix } from '../core/trace';
import { AllPathsResult, checkLTLAllPaths } from '../core/ltl-allpaths';
import { findEvidence } from '../core/evidence';
import { forceLayout } from '../core/layout';
import { buildProduct } from '../core/product';
import { parseCTLStar, classify, StarNode } from '../core/ctlstar-parser';
import { checkCTLStar, findStarEvidence, CTLStarResult } from '../core/ctlstar-checker';
import { AutomatonTooLarge } from '../core/buchi';
import { CTLNode } from '../core/ctl-parser';
import { Analysis, FormulaEntry, Logic, PendingLasso, Selection } from './types';
import { TUTORIALS } from '../learn/content';
import { findNodeByPretty, prettyOfNode } from '../learn/engine';
import { StepSetup, LearnView } from '../learn/types';
import { colorForNode } from './colors';
import { wrapNode, swapQuantifier } from './formulaEdits';
import { loadSaved, save, SavedState } from './storage';
import { EXAMPLES } from './examples';
import { useHistory } from './useHistory';
import Header from './Header';
import FormulaPanel from './FormulaPanel';
import { WORKBENCH_SLOT_ID } from './Composer';
import { WorkbenchMode } from './Workbench';
import Canvas, { Highlight } from './Canvas';
import GraphView, { RenderGraph } from './GraphView';
import Inspector from './Inspector';
import LearnPanel from './LearnPanel';
import Timeline from './Timeline';
import TreeView, { TreeEvidence } from './TreeView';
import { applyTheme, detachThemeListener, loadPref } from './theme';

let idCounter = 0;
function freshId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${idCounter++}`;
}

const LAYOUT_MS = 300;

export default function App() {
  const [initial] = useState<SavedState>(() => loadSaved() ?? {
    model: structuredClone(EXAMPLES[0].model),
    formulas: structuredClone(EXAMPLES[0].formulas),
    trace: null,
  });
  const history = useHistory<KripkeStructure>(initial.model);
  const model = history.present;
  const [formulas, setFormulas] = useState<FormulaEntry[]>(initial.formulas);
  const [selection, setSelection] = useState<Selection>(null);
  const [activeFormulaId, setActiveFormulaId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [entryLogic, setEntryLogic] = useState<Logic>('ctl');
  const [trace, setTrace] = useState<PendingLasso | null>(initial.trace ?? null);
  const [recording, setRecording] = useState(false);
  const [traceNotice, setTraceNotice] = useState<string | null>(null);
  const [hoverStateId, setHoverStateId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'model' | 'tree' | 'automaton' | 'product'>('model');
  const [graphHover, setGraphHover] = useState<string | null>(null);
  const [treeHover, setTreeHover] = useState<string | null>(null);
  const [gestureNotice, setGestureNotice] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'inspect' | 'learn'>('inspect');
  // Workbench drawer (builder/patterns): state lives here because the
  // launcher buttons sit in the left-pane composer while the drawer itself
  // is portaled into the center pane's slot below.
  const [workbench, setWorkbench] = useState<WorkbenchMode | null>(null);
  const [learnRefId, setLearnRefId] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState<{ id: string; step: number } | null>(null);
  const learnStash = useRef<(SavedState & { activeFormulaId: string | null }) | null>(null);
  // A tutorial step setup that changes the active formula AND the view tab
  // would be clobbered by the tab-reset effect below; the setup parks the tab
  // here and the effect consumes it instead of hard-resetting to 'model'.
  const pendingTab = useRef<'model' | 'tree' | 'automaton' | 'product' | null>(null);
  const treeAvailable = model.states.some((s) => s.isInitial);
  const layoutAnim = useRef<number | null>(null);

  // Theme: apply stored pref (default auto) at mount; detach the system
  // matchMedia listener on unmount.
  useEffect(() => {
    applyTheme(loadPref());
    return detachThemeListener;
  }, []);

  useEffect(() => {
    setViewTab(pendingTab.current ?? 'model');
    pendingTab.current = null;
    setGraphHover(null);
  }, [activeFormulaId]);

  // Persistence pauses during a tutorial: the sandbox must never overwrite the
  // stored pre-tutorial workspace (the stash lives only in a ref, so a refresh
  // mid-tutorial reloads the last saved pre-tutorial state).
  useEffect(() => {
    if (tutorial === null) save({ model, formulas, trace });
  }, [model, formulas, trace, tutorial]);

  function handleTraceClick(id: string) {
    setTraceNotice(null);
    if (!trace || trace.stateIds.length === 0) {
      setTrace({ stateIds: [id], loopIndex: null });
      return;
    }
    if (trace.loopIndex !== null) return; // complete — ignore further clicks
    const last = trace.stateIds[trace.stateIds.length - 1];
    if (!model.transitions.some((t) => t.from === last && t.to === id)) return;
    const existing = trace.stateIds.lastIndexOf(id);
    if (existing !== -1) {
      setTrace({ ...trace, loopIndex: existing });
      setRecording(false);
    } else {
      setTrace({ stateIds: [...trace.stateIds, id], loopIndex: null });
    }
  }

  function loadCounterexample(l: Lasso) {
    setTraceNotice(null);
    setRecording(false);
    setTrace({ stateIds: l.stateIds, loopIndex: l.loopIndex });
    setViewTab('model');
  }

  function startRecording(on: boolean) {
    setTraceNotice(null);
    if (on && (trace === null || trace.loopIndex !== null)) {
      setTrace({ stateIds: [], loopIndex: null });
    }
    if (on) setViewTab('model');
    setRecording(on);
  }

  // Trace revalidation on model edits: if the current trace prefix/lasso is no
  // longer consistent with the (possibly edited) model, drop it and surface why.
  useEffect(() => {
    if (!trace) return;
    const err = trace.loopIndex === null
      ? validatePrefix(model, trace.stateIds)
      : validateLasso(model, { stateIds: trace.stateIds, loopIndex: trace.loopIndex });
    if (err) {
      setTrace(null);
      setTraceNotice(`Trace cleared — ${err}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  const completeLasso = useMemo(() => {
    if (!trace || trace.loopIndex === null) return null;
    const lasso = { stateIds: trace.stateIds, loopIndex: trace.loopIndex };
    return validateLasso(model, lasso) === null ? lasso : null;
  }, [trace, model]);

  // Structural key: the Büchi pipeline (translation + product + emptiness) only
  // depends on the model's states/propositions/transitions, not on layout
  // (x/y). Keying allPathsMap on this instead of `model` means drags and
  // auto-layout animation frames no longer re-run the whole pipeline every
  // frame — only structural edits (add/remove/rename state, toggle prop,
  // add/remove transition) do.
  const structKey = useMemo(() => JSON.stringify({
    s: model.states.map((s) => [s.id, [...s.propositions].sort(), s.isInitial]),
    t: model.transitions.map((t) => [t.from, t.to]),
  }), [model]);
  const allPathsMap = useMemo(() => {
    const m = new Map<string, AllPathsResult>();
    for (const f of formulas) {
      if (f.logic !== 'ltl') continue;
      try {
        m.set(f.id, checkLTLAllPaths(model, parseLTL(f.text)));
      } catch (e) {
        if (!(e instanceof ParseError)) throw e; // parse errors handled in analyses
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulas, structKey]);

  const starMap = useMemo(() => {
    const m = new Map<string, CTLStarResult | 'too-large'>();
    for (const f of formulas) {
      if (f.logic !== 'ctlstar') continue;
      try {
        m.set(f.id, checkCTLStar(model, parseCTLStar(f.text)));
      } catch (e) {
        if (e instanceof AutomatonTooLarge) m.set(f.id, 'too-large');
        else if (!(e instanceof ParseError)) throw e;
      }
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formulas, structKey]);

  const analyses: Analysis[] = useMemo(() =>
    formulas.map((entry) => {
      try {
        if (entry.logic === 'ltl') {
          const ltlAst = parseLTL(entry.text);
          const ltlRows = completeLasso ? checkLTL(model, completeLasso, ltlAst) : undefined;
          const allPaths = allPathsMap.get(entry.id);
          return {
            entry, ltlAst, ltlRows, allPaths,
            verdict: ltlRows ? ltlRows.get(ltlAst.id)![0] : null,
          };
        }
        if (entry.logic === 'ctlstar') {
          const starAst = parseCTLStar(entry.text);
          const starCls = classify(starAst);
          const cached = starMap.get(entry.id);
          if (cached === 'too-large') {
            return { entry, starAst, starCls, starTooLarge: true, verdict: null };
          }
          return { entry, starAst, starCls, starResult: cached, verdict: cached ? cached.verdict : null };
        }
        const ast = parseCTL(entry.text);
        const record = checkCTL(model, ast);
        return { entry, ast, record, verdict: record.verdict };
      } catch (e) {
        if (e instanceof ParseError) return { entry, error: e, verdict: null };
        throw e;
      }
    }), [formulas, model, completeLasso, allPathsMap, starMap]);

  const selectedFormulaId = selection?.kind === 'formula' ? selection.id : null;
  const selectedAnalysis = analyses.find((a) => a.entry.id === selectedFormulaId) ?? null;
  const activeAnalysis = analyses.find((a) => a.entry.id === activeFormulaId) ?? null;

  const activeLTLAnalysis = activeAnalysis && activeAnalysis.entry.logic === 'ltl' && activeAnalysis.ltlAst
    ? activeAnalysis : null;

  const graphable = useMemo(() => {
    const entry = formulas.find((f) => f.id === activeFormulaId);
    if (entry?.logic === 'ltl' && activeFormulaId !== null) {
      const ap = allPathsMap.get(activeFormulaId);
      if (ap && (ap.kind === 'holds' || ap.kind === 'fails')) {
        return {
          automaton: ap.automaton, product: ap.product,
          legend: null as Map<string, string> | null, kind: 'ltl' as const,
        };
      }
    }
    if (activeFormulaId !== null && selectedNodeId !== null) {
      const star = starMap.get(activeFormulaId);
      if (star && star !== 'too-large') {
        const q = star.quantifiers.get(selectedNodeId);
        if (q) {
          return {
            automaton: q.automaton,
            product: buildProduct(q.labeledModel, q.automaton),
            legend: q.legend,
            kind: 'star' as const,
          };
        }
      }
    }
    return null;
  }, [activeFormulaId, selectedNodeId, allPathsMap, starMap, formulas]);

  const automatonGraph: RenderGraph | null = useMemo(() => {
    if (!graphable) return null;
    const lit = (l: { prop: string; negated: boolean }) => {
      const base = l.prop.startsWith('#')
        ? `⟨${graphable.legend?.get(l.prop) ?? l.prop}⟩`
        : l.prop;
      return l.negated ? `¬${base}` : base;
    };
    return {
      nodes: graphable.automaton.states.map((q) => ({
        id: `q${q.id}`, label: q.name, accepting: q.accepting, initial: q.initial,
      })),
      edges: graphable.automaton.transitions.map((t) => ({
        from: `q${t.from}`, to: `q${t.to}`,
        label: t.guard.length === 0 ? 'true' : t.guard.map(lit).join('∧'),
      })),
    };
  }, [graphable]);

  const productGraph: RenderGraph | null = useMemo(() => {
    if (!graphable) return null;
    return {
      nodes: graphable.product.states.map((p) => ({
        id: p.id,
        label: `${stateById(model, p.modelStateId)?.name ?? p.modelStateId}×${
          graphable.automaton.states.find((q) => q.id === p.buchiStateId)?.name ?? p.buchiStateId}`,
        accepting: p.accepting, initial: p.initial,
      })),
      edges: graphable.product.edges.map((e) => ({ from: e.from, to: e.to })),
    };
  }, [graphable, model]);

  const graphDetail = useMemo(() => {
    if (!graphable || graphHover === null) return null;
    if (viewTab === 'automaton') {
      const q = graphable.automaton.states.find((s) => `q${s.id}` === graphHover);
      if (!q) return null;
      const lines = q.obligations.length > 0 ? [...q.obligations] : ['no obligations (true)'];
      if (lines.some((l) => l.includes(' R '))) {
        lines.push('R = release: the right side must hold up to and including when the left side holds.');
      }
      if (graphable.legend) {
        for (const [k, v] of graphable.legend.entries()) lines.push(`${k} = ${v}`);
      }
      return {
        title: `${q.name}${q.accepting ? ' (accepting)' : ''}${q.initial ? ' (initial)' : ''}`,
        lines,
      };
    }
    if (viewTab === 'product') {
      const p = graphable.product.states.find((s) => s.id === graphHover);
      if (!p) return null;
      const q = graphable.automaton.states.find((s) => s.id === p.buchiStateId);
      return {
        title: `${graphHover}${p.accepting ? ' (accepting)' : ''}`,
        lines: [
          `model state: ${stateById(model, p.modelStateId)?.name ?? p.modelStateId}`,
          `automaton state: ${q?.name ?? p.buchiStateId}`,
          ...(q && q.obligations.length > 0 ? [`obligations: ${q.obligations.join(', ')}`] : []),
        ],
      };
    }
    return null;
  }, [graphable, graphHover, viewTab, model]);

  function findCTLNodeById(n: CTLNode, id: number): CTLNode | undefined {
    if (n.id === id) return n;
    const kids = 'child' in n ? [n.child] : 'left' in n ? [n.left, n.right] : [];
    for (const c of kids) { const r = findCTLNodeById(c, id); if (r) return r; }
    return undefined;
  }
  function findStarNodeById(n: StarNode, id: number): StarNode | undefined {
    if (n.id === id) return n;
    const kids = 'child' in n ? [n.child] : 'left' in n ? [n.left, n.right] : [];
    for (const c of kids) { const r = findStarNodeById(c, id); if (r) return r; }
    return undefined;
  }

  const treeDetail = useMemo(() => {
    if (viewTab !== 'tree' || treeHover === null) return null;
    const st = stateById(model, treeHover);
    if (!st) return null;
    const lines: string[] = [`propositions: ${st.propositions.join(', ') || '—'}`];
    const kind = (() => {
      if (selectedNodeId === null) return null;
      if (activeAnalysis?.ast) return findCTLNodeById(activeAnalysis.ast, selectedNodeId)?.kind ?? null;
      if (activeAnalysis?.starAst) return findStarNodeById(activeAnalysis.starAst, selectedNodeId)?.kind ?? null;
      return null;
    })();
    if (kind !== null && ['AX', 'AF', 'AG', 'AU', 'A'].includes(kind)) {
      lines.push('Universal quantifier: must hold along every branch below this node.');
    }
    if (kind !== null && ['EX', 'EF', 'EG', 'EU', 'E'].includes(kind)) {
      lines.push('Existential quantifier: one branch below this node suffices.');
    }
    return { title: `${st.name} (tree node)`, lines };
  }, [viewTab, treeHover, model, selectedNodeId, activeAnalysis]);

  const highlight: Highlight | null = useMemo(() => {
    if (activeAnalysis?.starResult && selectedNodeId !== null) {
      const s = activeAnalysis.starResult.sat.get(selectedNodeId);
      return s ? { sat: s, fresh: new Set<string>(), color: colorForNode(selectedNodeId) } : null;
    }
    if (!activeAnalysis?.record || selectedNodeId === null) return null;
    const nr = activeAnalysis.record.results.get(selectedNodeId);
    if (!nr) return null;
    const last = nr.iterations.length - 1;
    const idx = stepIndex === null ? last : Math.min(stepIndex, last);
    const cur = nr.iterations[idx];
    const prev = idx > 0 ? nr.iterations[idx - 1] : new Set<string>();
    const fresh = stepIndex === null ? new Set<string>() : new Set([...cur].filter((s) => !prev.has(s)));
    return { sat: cur, fresh, color: colorForNode(selectedNodeId) };
  }, [activeAnalysis, selectedNodeId, stepIndex]);

  const evidence = useMemo(() => {
    if (!showEvidence || !activeAnalysis?.record || !activeAnalysis.ast) return null;
    const { record, ast } = activeAnalysis;
    const rootSat = record.results.get(ast.id)!.sat;
    const initials = model.states.filter((s) => s.isInitial);
    const from = initials.find((s) => !rootSat.has(s.id)) ?? initials[0];
    return from ? findEvidence(model, record, ast, from.id) : null;
  }, [showEvidence, activeAnalysis, model]);

  const starEvidence = useMemo(() => {
    if (activeFormulaId === null) return null;
    const cached = starMap.get(activeFormulaId);
    if (!cached || cached === 'too-large') return null;
    const entry = formulas.find((f) => f.id === activeFormulaId);
    if (!entry || entry.logic !== 'ctlstar') return null;
    // Re-parsing yields identical node ids (the parser is deterministic), so the
    // AST aligns with the cached result's id-keyed maps.
    return findStarEvidence(model, parseCTLStar(entry.text), cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFormulaId, starMap, formulas]);

  const treeEvidence: TreeEvidence | null = useMemo(() => {
    if (activeAnalysis?.entry.logic === 'ctlstar' && starEvidence) {
      return { stateIds: starEvidence.lasso.stateIds, loopIndex: starEvidence.lasso.loopIndex };
    }
    if (activeLTLAnalysis?.allPaths?.kind === 'fails') {
      const c = activeLTLAnalysis.allPaths.counterexample;
      return { stateIds: c.stateIds, loopIndex: c.loopIndex };
    }
    if (evidence) {
      // CTL evidence lassos repeat the loop-entry state at the end — normalize.
      return evidence.loopIndex !== undefined
        ? { stateIds: evidence.path.slice(0, -1), loopIndex: evidence.loopIndex }
        : { stateIds: evidence.path, loopIndex: null };
    }
    return null;
  }, [activeAnalysis, activeLTLAnalysis, starEvidence, evidence]);

  const deadlocks = useMemo(() => new Set(deadlockStates(model)), [model]);

  // Selecting a different formula or editing resets node/step sub-selection.
  function selectFormula(id: string) {
    setSelection({ kind: 'formula', id });
    setActiveFormulaId(id);
    setSelectedNodeId(null);
    setStepIndex(null);
    setGestureNotice(null);
  }

  function applyFormulaEdit(action: { type: 'wrap'; wrapper: string } | { type: 'swap' }) {
    setGestureNotice(null);
    if (activeFormulaId === null || selectedNodeId === null) return;
    const entry = formulas.find((f) => f.id === activeFormulaId);
    if (!entry) return;
    const result = action.type === 'wrap'
      ? wrapNode(entry.logic, entry.text, selectedNodeId, action.wrapper)
      : swapQuantifier(entry.logic, entry.text, selectedNodeId);
    if (result === null) {
      setGestureNotice(action.type === 'wrap'
        ? `That wrap is not valid here.${entry.logic === 'ctlstar' ? ' (CTL* roots need a path quantifier.)' : ''}`
        : 'Nothing to swap on this node.');
      return;
    }
    updateFormula(activeFormulaId, result);
  }

  function selectState(id: string | null) {
    setSelection(id === null ? null : { kind: 'state', id });
  }

  function selectTransition(t: { from: string; to: string } | null) {
    setSelection(t ? { kind: 'transition', from: t.from, to: t.to } : null);
  }

  function updateFormula(id: string, text: string) {
    setFormulas((fs) => fs.map((f) => (f.id === id ? { ...f, text } : f)));
    if (activeFormulaId === id) { setSelectedNodeId(null); setStepIndex(null); }
  }

  // Cancels an in-flight auto-layout animation so undo/redo never race a
  // requestAnimationFrame loop that is still writing history.replace() frames.
  function cancelLayoutAnim() {
    if (layoutAnim.current !== null) {
      cancelAnimationFrame(layoutAnim.current);
      layoutAnim.current = null;
    }
  }

  // Canvas/Inspector edit callbacks: any edit made while auto-layout is
  // animating must cancel the animation first, otherwise a subsequent rAF
  // frame's history.replace() would silently clobber the edit. ALL App-internal
  // commits (deleteTransition, Delete/Backspace handler) must also route
  // through commitModel for the same reason.
  function commitModel(m: KripkeStructure) {
    cancelLayoutAnim();
    history.commit(m);
  }

  function previewModel(m: KripkeStructure) {
    cancelLayoutAnim();
    history.replace(m);
  }

  function beginEdit() {
    cancelLayoutAnim();
    history.checkpoint();
  }

  function undo() {
    cancelLayoutAnim();
    history.undo();
  }

  function redo() {
    cancelLayoutAnim();
    history.redo();
  }

  function deleteTransition(from: string, to: string) {
    const exists = model.transitions.some((t) => t.from === from && t.to === to);
    if (exists) {
      commitModel({
        ...model,
        transitions: model.transitions.filter((t) => !(t.from === from && t.to === to)),
      });
    }
    setSelection((sel) =>
      sel?.kind === 'transition' && sel.from === from && sel.to === to ? null : sel);
  }

  function loadState(s: SavedState) {
    cancelLayoutAnim();
    history.reset(s.model);
    setFormulas(s.formulas);
    setTrace(s.trace ?? null);
    setSelection(null);
    setActiveFormulaId(null);
    setSelectedNodeId(null);
    setStepIndex(null);
    setShowEvidence(false);
  }

  // Applies a tutorial step's setup to the live app. Called from event
  // handlers, so `formulas` in scope may be stale after setFormulas — the new
  // list is threaded through `fs` locally to avoid that race.
  function applyLearnSetup(s: StepSetup) {
    cancelLayoutAnim();
    if (s.model) history.commit(structuredClone(s.model));
    let fs = formulas;
    if (s.formulas) {
      fs = s.formulas.map((f) => ({ id: freshId('lf'), text: f.text, logic: f.logic }));
      setFormulas(fs);
      setActiveFormulaId(null); setSelectedNodeId(null); setStepIndex(null);
    }
    if (s.activeFormulaIndex !== undefined) {
      const target = fs[s.activeFormulaIndex];
      if (target) {
        setSelection({ kind: 'formula', id: target.id });
        setActiveFormulaId(target.id); setSelectedNodeId(null); setStepIndex(null);
      }
    }
    if (s.selectSubformulaPretty !== undefined) {
      const idx = s.activeFormulaIndex ?? fs.findIndex((f) => f.id === activeFormulaId);
      const f = fs[idx];
      if (f) setSelectedNodeId(findNodeByPretty(f.logic, f.text, s.selectSubformulaPretty));
    }
    if (s.viewTab) {
      if (s.activeFormulaIndex !== undefined) pendingTab.current = s.viewTab; // tab-reset effect applies it
      else setViewTab(s.viewTab);
    }
    if (s.trace !== undefined) { setRecording(false); setTrace(s.trace); }
    if (s.showEvidence !== undefined) setShowEvidence(s.showEvidence);
  }

  function openLearnRef(id: string) {
    setLearnRefId(id);
    setRightTab('learn');
  }

  function startTutorial(id: string) {
    const def = TUTORIALS.find((t) => t.id === id);
    if (!def) return;
    learnStash.current = { model: structuredClone(model), formulas, trace, activeFormulaId };
    setTutorial({ id, step: 0 });
    setRightTab('learn');
    applyLearnSetup(def.steps[0].setup ?? {});
  }

  function advanceTutorial(delta: 1 | -1) {
    if (!tutorial) return;
    const def = TUTORIALS.find((t) => t.id === tutorial.id)!;
    const next = tutorial.step + delta;
    if (next >= def.steps.length) { exitTutorial(); return; }   // Finish
    if (next < 0) return;
    setTutorial({ ...tutorial, step: next });
    if (delta === 1) applyLearnSetup(def.steps[next].setup ?? {}); // Back re-explains, never re-mutates
  }

  function exitTutorial() {
    const s = learnStash.current;
    learnStash.current = null;
    setTutorial(null);
    if (s) {
      // Restore WITHOUT resetting history (unlike loadState): undo stays
      // coherent — restored state → tutorial mutations → … → pre-tutorial edits.
      commitModel(s.model);
      setFormulas(s.formulas);
      setTrace(s.trace ?? null);
      setRecording(false);
      setSelection(null);
      setActiveFormulaId(null);
      setSelectedNodeId(null);
      setStepIndex(null);
      setShowEvidence(false);
      if (s.activeFormulaId) {
        setActiveFormulaId(s.activeFormulaId);
        setSelection({ kind: 'formula', id: s.activeFormulaId });
      }
    }
  }

  function showMe() {
    if (!tutorial) return;
    const def = TUTORIALS.find((t) => t.id === tutorial.id)!;
    const sol = def.steps[tutorial.step].solution;
    if (sol) applyLearnSetup(sol); // auto-advance effect then fires
  }

  const learnView: LearnView = useMemo(() => {
    const idx = formulas.findIndex((f) => f.id === activeFormulaId);
    const active = idx >= 0 ? formulas[idx] : null;
    return {
      model,
      formulas: analyses.map((a) => ({ text: a.entry.text, logic: a.entry.logic, verdict: a.verdict })),
      activeFormulaIndex: idx,
      selectedSubformulaPretty: active && selectedNodeId !== null
        ? prettyOfNode(active.logic, active.text, selectedNodeId) : null,
      viewTab, hasTrace: trace !== null && trace.stateIds.length > 0, showEvidence,
    };
  }, [model, analyses, formulas, activeFormulaId, selectedNodeId, viewTab, trace, showEvidence]);

  // Auto-advance: when the current task step's checkpoint holds over the live
  // app state, pause for a brief ✓ beat, then move on.
  useEffect(() => {
    if (!tutorial) return;
    const def = TUTORIALS.find((t) => t.id === tutorial.id);
    const step = def?.steps[tutorial.step];
    if (step?.checkpoint && step.checkpoint(learnView)) {
      const t = window.setTimeout(() => advanceTutorial(1), 600);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnView, tutorial]);

  // Highlight ring on the current step's data-learn anchor (anchors land in Task 6).
  // rightTab is a dep because the anchors live inside the Inspector, which is
  // unmounted while the Learn tab shows — switching panes must (re)apply the ring.
  useEffect(() => {
    document.querySelectorAll('.learn-ring').forEach((el) => el.classList.remove('learn-ring'));
    if (tutorial === null) return;
    const def = TUTORIALS.find((t) => t.id === tutorial.id);
    const hl = def?.steps[tutorial.step]?.highlight;
    if (hl) document.querySelector(`[data-learn="${hl}"]`)?.classList.add('learn-ring');
  }, [tutorial, rightTab]);

  const tutorialDef = tutorial ? TUTORIALS.find((t) => t.id === tutorial.id) ?? null : null;

  function autoLayout() {
    if (model.states.length < 2) return;
    cancelLayoutAnim();
    const target = forceLayout(model);
    const start = new Map(model.states.map((s) => [s.id, { x: s.x, y: s.y }]));
    const base = model;
    history.checkpoint();
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / LAYOUT_MS);
      const ease = t * (2 - t);
      history.replace({
        ...base,
        states: base.states.map((s) => {
          const a = start.get(s.id)!;
          const b = target.get(s.id) ?? a;
          return { ...s, x: a.x + (b.x - a.x) * ease, y: a.y + (b.y - a.y) * ease };
        }),
      });
      layoutAnim.current = t < 1 ? requestAnimationFrame(frame) : null;
    };
    layoutAnim.current = requestAnimationFrame(frame);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        if (recording) { setRecording(false); return; }
        setSelection(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'state') {
        const id = selection.id;
        if (model.states.some((s) => s.id === id)) {
          commitModel({
            states: model.states.filter((s) => s.id !== id),
            transitions: model.transitions.filter((t) => t.from !== id && t.to !== id),
          });
        }
        setSelection(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'transition') {
        deleteTransition(selection.from, selection.to);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, model, history, recording]);

  return (
    <>
      <Header
        onLoadExample={(i) => loadState({
          model: structuredClone(EXAMPLES[i].model),
          formulas: structuredClone(EXAMPLES[i].formulas),
          trace: null,
        })}
        onImport={loadState}
        exportState={() => ({ model, formulas, trace })}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onAutoLayout={autoLayout}
        entryLogic={entryLogic}
        onEntryLogic={setEntryLogic}
      />
      <div className="main">
        <div className="pane left">
          <FormulaPanel
            analyses={analyses}
            selectedFormulaId={activeFormulaId}
            onSelect={selectFormula}
            onAdd={(text) => setFormulas((f) => [...f, { id: freshId('f'), text, logic: entryLogic }])}
            entryLogic={entryLogic}
            model={model}
            onUpdate={updateFormula}
            onSwitchLogic={setEntryLogic}
            onOpenLearn={openLearnRef}
            workbench={workbench}
            onOpenWorkbench={setWorkbench}
            onRemove={(id) => {
              setFormulas((f) => f.filter((x) => x.id !== id));
              if (selectedFormulaId === id) setSelection(null);
              if (activeFormulaId === id) {
                setActiveFormulaId(null);
                setSelectedNodeId(null);
                setStepIndex(null);
                setShowEvidence(false);
              }
            }}
          />
        </div>
        <div className="pane center" onMouseLeave={() => setHoverStateId(null)}>
          <div className="center-stack">
            {tutorial && tutorialDef && (
              <div className="tutorial-banner">
                Tutorial: {tutorialDef.title} — step {tutorial.step + 1}/{tutorialDef.steps.length}
                <button className="linkish" onClick={exitTutorial}>Exit</button>
              </div>
            )}
            {(graphable || treeAvailable) && (
              <div className="view-tabs">
                <button className={`tab ${viewTab === 'model' ? 'active' : ''}`}
                  onClick={() => setViewTab('model')}>Model</button>
                {treeAvailable && (
                  <button className={`tab ${viewTab === 'tree' ? 'active' : ''}`}
                    title="Unfold the computation tree from the initial state(s)"
                    onClick={() => setViewTab('tree')}>Tree</button>
                )}
                {graphable && (
                  <>
                    <button className={`tab ${viewTab === 'automaton' ? 'active' : ''}`}
                      title={graphable.kind === 'ltl' && activeLTLAnalysis?.ltlAst
                        ? `Büchi automaton for ¬(${prettyLTL(activeLTLAnalysis.ltlAst)})`
                        : 'Büchi automaton the checker ran for the selected quantifier (¬ψ for A, ψ for E)'}
                      onClick={() => setViewTab('automaton')}>
                      {graphable.kind === 'ltl' ? 'Automaton ¬φ' : 'Automaton'}
                    </button>
                    <button className={`tab ${viewTab === 'product' ? 'active' : ''}`}
                      onClick={() => setViewTab('product')}>Product</button>
                  </>
                )}
              </div>
            )}
            <div className="view-body">
              {(() => {
                const canvasEl = (
                  <Canvas
                    model={model}
                    onChange={commitModel}
                    onPreview={previewModel}
                    onBeginEdit={beginEdit}
                    selectedStateId={selection?.kind === 'state' ? selection.id : null}
                    selectedTransition={selection?.kind === 'transition'
                      ? { from: selection.from, to: selection.to } : null}
                    onSelectState={selectState}
                    onSelectTransition={selectTransition}
                    highlight={highlight}
                    evidence={evidence}
                    deadlocks={deadlocks}
                    trace={trace}
                    recording={recording}
                    onRecordingChange={startRecording}
                    onTraceClick={handleTraceClick}
                    hoverStateId={hoverStateId}
                  />
                );
                if (viewTab === 'tree') {
                  return treeAvailable ? (
                    <TreeView
                      model={model}
                      highlight={highlight}
                      trace={trace}
                      evidence={treeEvidence}
                      onHoverNode={setTreeHover}
                    />
                  ) : canvasEl;
                }
                if (!graphable || viewTab === 'model') return canvasEl;
                if (viewTab === 'automaton') {
                  return <GraphView key={viewTab} graph={automatonGraph!} onHoverNode={setGraphHover} />;
                }
                return <GraphView key={viewTab} graph={productGraph!} onHoverNode={setGraphHover} />;
              })()}
            </div>
          </div>
          {/* Portal target: the composer renders the workbench drawer here. */}
          <div className="workbench-slot" id={WORKBENCH_SLOT_ID} />
        </div>
        <div className="pane right">
          <div className="view-tabs right-tabs">
            <button className={`tab ${rightTab === 'inspect' ? 'active' : ''}`}
              onClick={() => setRightTab('inspect')}>Inspector</button>
            <button className={`tab ${rightTab === 'learn' ? 'active' : ''}`}
              onClick={() => setRightTab('learn')}>
              Learn{tutorial && <span className="learn-dot">●</span>}
            </button>
          </div>
          {rightTab === 'learn' ? (
            <LearnPanel refId={learnRefId}
              tutorial={tutorial && tutorialDef ? { def: tutorialDef, step: tutorial.step } : null}
              view={learnView}
              onOpenRef={setLearnRefId} onStartTutorial={startTutorial} onExitTutorial={exitTutorial}
              onNext={() => advanceTutorial(1)} onBack={() => advanceTutorial(-1)} onShowMe={showMe} />
          ) : (
          <Inspector
            model={model}
            onChange={commitModel}
            selection={selection}
            analysis={selection?.kind === 'formula' ? selectedAnalysis : activeAnalysis}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => { setSelectedNodeId(id); setStepIndex(null); setGestureNotice(null); }}
            stepIndex={stepIndex}
            onStepIndex={setStepIndex}
            showEvidence={showEvidence}
            onShowEvidence={setShowEvidence}
            evidence={evidence}
            onDeleteTransition={deleteTransition}
            onLoadCounterexample={loadCounterexample}
            graphDetail={graphDetail ?? treeDetail}
            starEvidence={starEvidence}
            onFormulaEdit={applyFormulaEdit}
            gestureNotice={gestureNotice}
            onOpenLearn={openLearnRef}
          />
          )}
        </div>
      </div>
      {(trace !== null || activeLTLAnalysis !== null || traceNotice !== null) && (
        <Timeline
          model={model}
          trace={trace}
          onTraceChange={setTrace}
          recording={recording}
          onRecordingChange={startRecording}
          analysis={activeLTLAnalysis}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => { setSelectedNodeId(id); setStepIndex(null); }}
          onHoverState={setHoverStateId}
          notice={traceNotice}
          onDismissNotice={() => setTraceNotice(null)}
        />
      )}
    </>
  );
}
