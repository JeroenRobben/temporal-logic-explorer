import { useState } from 'react';
import { KripkeStructure, allPropositions, stateById } from '../core/kripke';
import { CTLNode, pretty } from '../core/ctl-parser';
import { Analysis, Selection } from './types';
import { colorForNode } from './colors';
import { Evidence } from '../core/evidence';

export interface InspectorProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selection: Selection;
  analysis: Analysis | null;
  selectedNodeId: number | null;
  onSelectNode: (id: number | null) => void;
  stepIndex: number | null;
  onStepIndex: (i: number | null) => void;
  showEvidence: boolean;
  onShowEvidence: (b: boolean) => void;
  evidence: Evidence | null;
}

const RESERVED_NAMES = ['true', 'false', 'A', 'E', 'U', 'AX', 'EX', 'AF', 'EF', 'AG', 'EG', 'AU', 'EU'];

const GLOSS: Record<string, string> = {
  AG: 'on every path, at every step',
  EG: 'on some path, at every step',
  AF: 'on every path, eventually',
  EF: 'on some path, eventually',
  AX: 'in every next state',
  EX: 'in some next state',
  AU: 'on every path, the left holds until the right does',
  EU: 'on some path, the left holds until the right does',
  and: 'both hold', or: 'at least one holds', not: 'does not hold',
  implies: 'if the left holds, so does the right', iff: 'both or neither',
  prop: 'atomic proposition', true: 'holds everywhere', false: 'holds nowhere',
};

function childrenOf(n: CTLNode): CTLNode[] {
  if ('child' in n) return [n.child];
  if ('left' in n) return [n.left, n.right];
  return [];
}

function labelOf(n: CTLNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': return '¬';
    case 'and': return '∧';
    case 'or': return '∨';
    case 'implies': return '→';
    case 'iff': return '↔';
    case 'EU': return 'E[· U ·]';
    case 'AU': return 'A[· U ·]';
    default: return n.kind;
  }
}

function NodeTree(props: {
  node: CTLNode; depth: number;
  selectedNodeId: number | null; onSelectNode: (id: number) => void;
}) {
  const { node, depth, selectedNodeId, onSelectNode } = props;
  return (
    <div>
      <div
        className={`node-row ${node.id === selectedNodeId ? 'selected' : ''}`}
        style={{ marginLeft: depth * 14 }}
        onClick={() => onSelectNode(node.id)}
        title={GLOSS[node.kind]}
      >
        <span className="swatch" style={{ background: colorForNode(node.id) }} />
        <span>{labelOf(node)}</span>
        <span className="muted">{pretty(node)}</span>
      </div>
      {childrenOf(node).map((c) => (
        <NodeTree key={c.id} node={c} depth={depth + 1}
          selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
      ))}
    </div>
  );
}

export default function Inspector(props: InspectorProps) {
  const {
    model, onChange, selection, analysis,
    selectedNodeId, onSelectNode, stepIndex, onStepIndex,
    showEvidence, onShowEvidence, evidence,
  } = props;
  const [newProp, setNewProp] = useState('');

  if (selection?.kind === 'state') {
    const s = stateById(model, selection.id);
    if (!s) return <div className="muted">State no longer exists.</div>;
    const props_ = allPropositions(model);
    const toggleProp = (p: string, on: boolean) => onChange({
      ...model,
      states: model.states.map((x) => x.id !== s.id ? x : {
        ...x,
        propositions: on ? [...x.propositions, p] : x.propositions.filter((q) => q !== p),
      }),
    });
    return (
      <div>
        <div className="section-title">State</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.name}</div>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input type="checkbox" checked={s.isInitial}
            onChange={(e) => onChange({
              ...model,
              states: model.states.map((x) => x.id === s.id ? { ...x, isInitial: e.target.checked } : x),
            })} /> initial state
        </label>
        <div className="section-title">Propositions</div>
        {props_.map((p) => (
          <label key={p} style={{ display: 'block' }}>
            <input type="checkbox" checked={s.propositions.includes(p)}
              onChange={(e) => toggleProp(p, e.target.checked)} /> {p}
          </label>
        ))}
        <input
          className="formula-input" placeholder="new proposition + Enter" value={newProp}
          style={{ marginTop: 6 }}
          onChange={(e) => setNewProp(e.target.value)}
          onKeyDown={(e) => {
            const name = newProp.trim();
            if (e.key === 'Enter' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
              && !RESERVED_NAMES.includes(name)) {
              toggleProp(name, true);
              setNewProp('');
            }
          }}
        />
        {analysis?.record && analysis.ast && (
          <>
            <div className="section-title">Holds here (current formula)</div>
            {(function list(n: CTLNode): JSX.Element[] {
              const here = analysis.record!.results.get(n.id)!.sat.has(s.id);
              return [
                <div key={n.id} className="muted">
                  {here ? '✓' : '✗'} {pretty(n)}
                </div>,
                ...childrenOf(n).flatMap(list),
              ];
            })(analysis.ast)}
          </>
        )}
      </div>
    );
  }

  if (selection?.kind === 'formula' && analysis) {
    if (analysis.error) {
      return (
        <div>
          <div className="section-title">Parse error</div>
          <div className="parse-error">
            {analysis.error.message} (at position {analysis.error.pos})
          </div>
          {analysis.error.hint && <div className="hint">💡 {analysis.error.hint}</div>}
        </div>
      );
    }
    const { ast, record } = analysis;
    if (!ast || !record) return null;
    const selectedResult = selectedNodeId !== null ? record.results.get(selectedNodeId) : undefined;
    const selectedNode = selectedNodeId !== null
      ? (function find(n: CTLNode): CTLNode | undefined {
          if (n.id === selectedNodeId) return n;
          for (const c of childrenOf(n)) { const r = find(c); if (r) return r; }
        })(ast)
      : undefined;
    const iterCount = selectedResult?.iterations.length ?? 0;
    const shownStep = stepIndex === null ? iterCount - 1 : Math.min(stepIndex, iterCount - 1);
    const initials = model.states.filter((st) => st.isInitial);
    const rootSat = record.results.get(ast.id)!.sat;
    return (
      <div>
        <div className="section-title">Subformulas — click to color states</div>
        <NodeTree node={ast} depth={0} selectedNodeId={selectedNodeId}
          onSelectNode={(id) => onSelectNode(id === selectedNodeId ? null : id)} />
        {selectedNode && <div className="gloss">{GLOSS[selectedNode.kind]}</div>}
        {selectedResult && iterCount > 1 && (
          <>
            <div className="section-title">Fixpoint iterations</div>
            <div className="stepper">
              <button onClick={() => onStepIndex(0)} disabled={shownStep === 0}>⏮</button>
              <button onClick={() => onStepIndex(Math.max(0, shownStep - 1))} disabled={shownStep === 0}>◀</button>
              <span>step {shownStep + 1} / {iterCount}</span>
              <button onClick={() => onStepIndex(Math.min(iterCount - 1, shownStep + 1))}
                disabled={shownStep === iterCount - 1}>▶</button>
              <button onClick={() => onStepIndex(null)} disabled={stepIndex === null}>⏭</button>
            </div>
            <div className="muted">
              {selectedResult.iterations[shownStep].size} state(s) in this approximation
            </div>
          </>
        )}
        <div className="section-title">Verdict per initial state</div>
        {initials.length === 0 && (
          <div className="muted">No initial states — mark one to get a verdict.</div>
        )}
        {initials.map((st) => (
          <div key={st.id} className="muted">
            {rootSat.has(st.id) ? '✓' : '✗'} {st.name}
          </div>
        ))}
        <div className="section-title">Evidence</div>
        <label>
          <input type="checkbox" checked={showEvidence}
            onChange={(e) => onShowEvidence(e.target.checked)} /> show witness / counterexample
        </label>
        {showEvidence && (
          evidence ? (
            <div className="muted">
              {evidence.kind === 'witness' ? 'Witness' : 'Counterexample'} path: {
                evidence.path.map((id) => stateById(model, id)?.name ?? id).join(' → ')
              }{evidence.loopIndex !== undefined ? ' (loops back)' : ''}
            </div>
          ) : (
            <div className="muted">
              No evidence to show — v1 covers top-level EF, AG, EG, AF and E[· U ·] (a holding
              A-formula or failing E-formula has no single-path evidence).
            </div>
          )
        )}
        {record.deadlocks.length > 0 && (
          <>
            <div className="section-title">Warnings</div>
            <div className="hint">
              ⚠ Deadlock state(s): {record.deadlocks.map((d) => stateById(model, d)?.name ?? d).join(', ')}.
              CTL semantics assume every state has a successor; A-quantified formulas hold
              vacuously in deadlocks.
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="muted">
      Select a formula to explore its subformulas, or a state to edit its propositions.
    </div>
  );
}
