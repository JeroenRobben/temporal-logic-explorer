import { useEffect, useMemo, useState } from 'react';
import { deadlockStates, KripkeStructure } from '../core/kripke';
import { parseCTL, ParseError } from '../core/ctl-parser';
import { checkCTL } from '../core/ctl-checker';
import { findEvidence } from '../core/evidence';
import { Analysis, FormulaEntry, Selection } from './types';
import { colorForNode } from './colors';
import { loadSaved, save, SavedState } from './storage';
import { EXAMPLES } from './examples';
import Header from './Header';
import FormulaPanel from './FormulaPanel';
import Canvas, { Highlight } from './Canvas';
import Inspector from './Inspector';

let idCounter = 0;
function freshId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${idCounter++}`;
}

export default function App() {
  const [initial] = useState<SavedState>(() => loadSaved() ?? {
    model: structuredClone(EXAMPLES[0].model),
    formulas: structuredClone(EXAMPLES[0].formulas),
  });
  const [model, setModel] = useState<KripkeStructure>(initial.model);
  const [formulas, setFormulas] = useState<FormulaEntry[]>(initial.formulas);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

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

  const highlight: Highlight | null = useMemo(() => {
    if (!selectedAnalysis?.record || selectedNodeId === null) return null;
    const nr = selectedAnalysis.record.results.get(selectedNodeId);
    if (!nr) return null;
    const last = nr.iterations.length - 1;
    const idx = stepIndex === null ? last : Math.min(stepIndex, last);
    const cur = nr.iterations[idx];
    const prev = idx > 0 ? nr.iterations[idx - 1] : new Set<string>();
    const fresh = stepIndex === null ? new Set<string>() : new Set([...cur].filter((s) => !prev.has(s)));
    return { sat: cur, fresh, color: colorForNode(selectedNodeId) };
  }, [selectedAnalysis, selectedNodeId, stepIndex]);

  const evidence = useMemo(() => {
    if (!showEvidence || !selectedAnalysis?.record || !selectedAnalysis.ast) return null;
    const { record, ast } = selectedAnalysis;
    const rootSat = record.results.get(ast.id)!.sat;
    const initials = model.states.filter((s) => s.isInitial);
    const from = initials.find((s) => !rootSat.has(s.id)) ?? initials[0];
    return from ? findEvidence(model, record, ast, from.id) : null;
  }, [showEvidence, selectedAnalysis, model]);

  const deadlocks = useMemo(() => new Set(deadlockStates(model)), [model]);

  // Selecting a different formula or editing resets node/step sub-selection.
  function selectFormula(id: string) {
    setSelection({ kind: 'formula', id });
    setSelectedNodeId(null);
    setStepIndex(null);
  }

  function selectState(id: string | null) {
    setSelection(id === null ? null : { kind: 'state', id });
  }

  function loadState(s: SavedState) {
    setModel(s.model);
    setFormulas(s.formulas);
    setSelection(null);
    setSelectedNodeId(null);
    setStepIndex(null);
    setShowEvidence(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName)) return;
      if (e.key === 'Escape') setSelection(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'state') {
        const id = selection.id;
        setModel((m) => ({
          states: m.states.filter((s) => s.id !== id),
          transitions: m.transitions.filter((t) => t.from !== id && t.to !== id),
        }));
        setSelection(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  return (
    <>
      <Header
        onLoadExample={(i) => loadState({
          model: structuredClone(EXAMPLES[i].model),
          formulas: structuredClone(EXAMPLES[i].formulas),
        })}
        onImport={loadState}
        exportState={() => ({ model, formulas })}
      />
      <div className="main">
        <div className="pane left">
          <FormulaPanel
            analyses={analyses}
            selectedFormulaId={selectedFormulaId}
            onSelect={selectFormula}
            onAdd={(text) => setFormulas((f) => [...f, { id: freshId('f'), text }])}
            onRemove={(id) => {
              setFormulas((f) => f.filter((x) => x.id !== id));
              if (selectedFormulaId === id) setSelection(null);
            }}
          />
        </div>
        <div className="pane center">
          <Canvas
            model={model}
            onChange={setModel}
            selectedStateId={selection?.kind === 'state' ? selection.id : null}
            onSelectState={selectState}
            highlight={highlight}
            evidence={evidence}
            deadlocks={deadlocks}
          />
        </div>
        <div className="pane right">
          <Inspector
            model={model}
            onChange={setModel}
            selection={selection}
            analysis={selectedAnalysis ?? (selection?.kind === 'state' ? analyses.find((a) => a.record) ?? null : null)}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => { setSelectedNodeId(id); setStepIndex(null); }}
            stepIndex={stepIndex}
            onStepIndex={setStepIndex}
            showEvidence={showEvidence}
            onShowEvidence={setShowEvidence}
          />
        </div>
      </div>
    </>
  );
}
