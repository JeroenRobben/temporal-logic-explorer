import { useEffect, useMemo, useRef, useState } from 'react';
import { deadlockStates, KripkeStructure } from '../core/kripke';
import { parseCTL, ParseError } from '../core/ctl-parser';
import { checkCTL } from '../core/ctl-checker';
import { findEvidence } from '../core/evidence';
import { forceLayout } from '../core/layout';
import { Analysis, FormulaEntry, Selection } from './types';
import { colorForNode } from './colors';
import { loadSaved, save, SavedState } from './storage';
import { EXAMPLES } from './examples';
import { useHistory } from './useHistory';
import Header from './Header';
import FormulaPanel from './FormulaPanel';
import Canvas, { Highlight } from './Canvas';
import Inspector from './Inspector';

let idCounter = 0;
function freshId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${idCounter++}`;
}

const LAYOUT_MS = 300;

export default function App() {
  const [initial] = useState<SavedState>(() => loadSaved() ?? {
    model: structuredClone(EXAMPLES[0].model),
    formulas: structuredClone(EXAMPLES[0].formulas),
  });
  const history = useHistory<KripkeStructure>(initial.model);
  const model = history.present;
  const [formulas, setFormulas] = useState<FormulaEntry[]>(initial.formulas);
  const [selection, setSelection] = useState<Selection>(null);
  const [activeFormulaId, setActiveFormulaId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const layoutAnim = useRef<number | null>(null);

  useEffect(() => { save({ model, formulas }); }, [model, formulas]);

  const analyses: Analysis[] = useMemo(() =>
    formulas.map((entry) => {
      try {
        const ast = parseCTL(entry.text);
        return { entry, ast, record: checkCTL(model, ast) };
      } catch (e) {
        if (e instanceof ParseError) return { entry, error: e };
        throw e;
      }
    }), [formulas, model]);

  const selectedFormulaId = selection?.kind === 'formula' ? selection.id : null;
  const selectedAnalysis = analyses.find((a) => a.entry.id === selectedFormulaId) ?? null;
  const activeAnalysis = analyses.find((a) => a.entry.id === activeFormulaId) ?? null;

  const highlight: Highlight | null = useMemo(() => {
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

  const deadlocks = useMemo(() => new Set(deadlockStates(model)), [model]);

  // Selecting a different formula or editing resets node/step sub-selection.
  function selectFormula(id: string) {
    setSelection({ kind: 'formula', id });
    setActiveFormulaId(id);
    setSelectedNodeId(null);
    setStepIndex(null);
  }

  function selectState(id: string | null) {
    setSelection(id === null ? null : { kind: 'state', id });
  }

  function selectTransition(t: { from: string; to: string } | null) {
    setSelection(t ? { kind: 'transition', from: t.from, to: t.to } : null);
  }

  function deleteTransition(from: string, to: string) {
    history.commit({
      ...model,
      transitions: model.transitions.filter((t) => !(t.from === from && t.to === to)),
    });
    setSelection((sel) =>
      sel?.kind === 'transition' && sel.from === from && sel.to === to ? null : sel);
  }

  // Cancels an in-flight auto-layout animation so undo/redo never race a
  // requestAnimationFrame loop that is still writing history.replace() frames.
  function cancelLayoutAnim() {
    if (layoutAnim.current !== null) {
      cancelAnimationFrame(layoutAnim.current);
      layoutAnim.current = null;
    }
  }

  function undo() {
    cancelLayoutAnim();
    history.undo();
  }

  function redo() {
    cancelLayoutAnim();
    history.redo();
  }

  function loadState(s: SavedState) {
    cancelLayoutAnim();
    history.reset(s.model);
    setFormulas(s.formulas);
    setSelection(null);
    setActiveFormulaId(null);
    setSelectedNodeId(null);
    setStepIndex(null);
    setShowEvidence(false);
  }

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
      if (e.key === 'Escape') setSelection(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'state') {
        const id = selection.id;
        history.commit({
          states: model.states.filter((s) => s.id !== id),
          transitions: model.transitions.filter((t) => t.from !== id && t.to !== id),
        });
        setSelection(null);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'transition') {
        deleteTransition(selection.from, selection.to);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, model, history]);

  return (
    <>
      <Header
        onLoadExample={(i) => loadState({
          model: structuredClone(EXAMPLES[i].model),
          formulas: structuredClone(EXAMPLES[i].formulas),
        })}
        onImport={loadState}
        exportState={() => ({ model, formulas })}
        onUndo={undo}
        onRedo={redo}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onAutoLayout={autoLayout}
      />
      <div className="main">
        <div className="pane left">
          <FormulaPanel
            analyses={analyses}
            selectedFormulaId={activeFormulaId}
            onSelect={selectFormula}
            onAdd={(text) => setFormulas((f) => [...f, { id: freshId('f'), text }])}
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
        <div className="pane center">
          <Canvas
            model={model}
            onChange={history.commit}
            onPreview={history.replace}
            onBeginEdit={history.checkpoint}
            selectedStateId={selection?.kind === 'state' ? selection.id : null}
            selectedTransition={selection?.kind === 'transition'
              ? { from: selection.from, to: selection.to } : null}
            onSelectState={selectState}
            onSelectTransition={selectTransition}
            highlight={highlight}
            evidence={evidence}
            deadlocks={deadlocks}
          />
        </div>
        <div className="pane right">
          <Inspector
            model={model}
            onChange={history.commit}
            selection={selection}
            analysis={selection?.kind === 'formula' ? selectedAnalysis : activeAnalysis}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => { setSelectedNodeId(id); setStepIndex(null); }}
            stepIndex={stepIndex}
            onStepIndex={setStepIndex}
            showEvidence={showEvidence}
            onShowEvidence={setShowEvidence}
            evidence={evidence}
            onDeleteTransition={deleteTransition}
          />
        </div>
      </div>
    </>
  );
}
