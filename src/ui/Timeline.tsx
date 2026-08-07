import { useState } from 'react';
import { KripkeStructure, allPropositions, stateById, successors } from '../core/kripke';
import { LTLNode, pretty as prettyLTL } from '../core/ltl-parser';
import { Lasso, nextPosition } from '../core/trace';
import { Analysis, PendingLasso } from './types';
import { colorForNode } from './colors';

interface TimelineProps {
  model: KripkeStructure;
  trace: PendingLasso | null;
  onTraceChange: (t: PendingLasso | null) => void;
  recording: boolean;
  onRecordingChange: (b: boolean) => void;
  /** The active analysis, when it is a successfully parsed LTL formula. */
  analysis: Analysis | null;
  selectedNodeId: number | null;
  onSelectNode: (id: number | null) => void;
  onHoverState: (id: string | null) => void;
  notice: string | null;
  onDismissNotice: () => void;
}

function postOrder(n: LTLNode): LTLNode[] {
  const out: LTLNode[] = [];
  (function walk(m: LTLNode) {
    if ('child' in m) walk(m.child);
    if ('left' in m) { walk(m.left); walk(m.right); }
    out.push(m);
  })(n);
  return out;
}

/** For a true F/U/X cell, the position that justifies it (or null). */
function witnessFor(
  node: LTLNode, rows: Map<number, boolean[]>, lasso: Lasso, i: number,
): number | null {
  const len = lasso.stateIds.length;
  switch (node.kind) {
    case 'X':
      return nextPosition(lasso, i);
    case 'F': {
      const c = rows.get(node.child.id)!;
      let j = i;
      for (let steps = 0; steps <= 2 * len; steps++) {
        if (c[j]) return j;
        j = nextPosition(lasso, j);
      }
      return null;
    }
    case 'U': {
      const l = rows.get(node.left.id)!;
      const r = rows.get(node.right.id)!;
      let j = i;
      for (let steps = 0; steps <= 2 * len; steps++) {
        if (r[j]) return j;
        if (!l[j]) return null;
        j = nextPosition(lasso, j);
      }
      return null;
    }
    default:
      return null;
  }
}

export default function Timeline(props: TimelineProps) {
  const {
    model, trace, onTraceChange, recording, onRecordingChange,
    analysis, selectedNodeId, onSelectNode, onHoverState, notice, onDismissNotice,
  } = props;
  const [hoverCell, setHoverCell] = useState<{ nodeId: number; pos: number } | null>(null);

  const complete: Lasso | null = trace && trace.loopIndex !== null
    ? { stateIds: trace.stateIds, loopIndex: trace.loopIndex } : null;
  const rows = analysis?.ltlRows;
  const ltlAst = analysis?.ltlAst;
  const nodes = ltlAst ? postOrder(ltlAst) : [];
  const props_ = allPropositions(model);
  const nameAt = (i: number) => stateById(model, trace!.stateIds[i])?.name ?? trace!.stateIds[i];

  function trim(i: number) {
    if (!trace) return;
    const stateIds = trace.stateIds.slice(0, i);
    onTraceChange(stateIds.length === 0 ? null : { stateIds, loopIndex: null });
  }

  function extend(id: string) {
    if (!trace || trace.loopIndex !== null) return;
    onTraceChange({ stateIds: [...trace.stateIds, id], loopIndex: null });
  }

  function closeLoop(index: number) {
    if (!trace || trace.loopIndex !== null) return;
    onTraceChange({ ...trace, loopIndex: index });
  }

  const last = trace && trace.stateIds.length > 0
    ? trace.stateIds[trace.stateIds.length - 1] : null;
  const canExtend = trace !== null && trace.loopIndex === null && last !== null;
  const succ = canExtend ? successors(model, last!) : [];
  const loopCandidates = canExtend
    ? trace!.stateIds
        .map((id, idx) => ({ id, idx }))
        .filter(({ id }) => model.transitions.some((t) => t.from === last && t.to === id))
    : [];

  const witnessPos = hoverCell && rows && complete && ltlAst
    ? (() => {
        const node = nodes.find((m) => m.id === hoverCell.nodeId);
        return node && rows.get(node.id)![hoverCell.pos]
          ? witnessFor(node, rows, complete, hoverCell.pos) : null;
      })()
    : null;

  return (
    <div className="timeline">
      {notice && (
        <div className="notice">
          <span>⚠ {notice}</span>
          <button onClick={onDismissNotice}>✕</button>
        </div>
      )}
      <div className="strip">
        <button className={`record-btn ${recording ? 'on' : ''}`} style={{ position: 'static' }}
          onClick={() => onRecordingChange(!recording)}>
          {recording ? '■ stop' : '⏺ record'}
        </button>
        {trace && trace.stateIds.map((id, i) => (
          <span key={i} className={`chip ${trace.loopIndex === i ? 'loop-entry' : ''}`}>
            {trace.loopIndex === i && '⟲ '}
            {stateById(model, id)?.name ?? id}
            <button className="trim" title="Trim from here" onClick={() => trim(i)}>✕</button>
          </span>
        ))}
        {trace && trace.loopIndex === null && trace.stateIds.length > 0 && (
          <span className="muted">no loop yet —</span>
        )}
        {succ.map((id) => (
          <button key={`x-${id}`} onClick={() => extend(id)}>
            → {stateById(model, id)?.name ?? id}
          </button>
        ))}
        {loopCandidates.map(({ id, idx }) => (
          <button key={`l-${idx}`} onClick={() => closeLoop(idx)}>
            ⟲ {stateById(model, id)?.name ?? id}
          </button>
        ))}
        {trace && (
          <button onClick={() => { onTraceChange(null); onRecordingChange(false); }}>clear trace</button>
        )}
        {!trace && !recording && (
          <span className="muted">No trace — press ⏺ record, then click states on the canvas.</span>
        )}
      </div>
      {trace && trace.stateIds.length > 0 && (
        <table onMouseLeave={() => { onHoverState(null); setHoverCell(null); }}>
          <thead>
            <tr>
              <th />
              {trace.stateIds.map((_, i) => (
                <th key={i}
                  className={complete && i >= complete.loopIndex ? 'loop-col' : ''}
                  onMouseEnter={() => onHoverState(trace.stateIds[i])}>
                  {complete && i === complete.loopIndex ? '⟲' : ''}{nameAt(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props_.map((p) => (
              <tr key={`p-${p}`}>
                <td className="row-label muted">{p}</td>
                {trace.stateIds.map((id, i) => (
                  <td key={i} className={complete && i >= complete.loopIndex ? 'loop-col' : ''}>
                    {(stateById(model, id)?.propositions ?? []).includes(p) ? '·' : ''}
                  </td>
                ))}
              </tr>
            ))}
            {ltlAst && nodes.map((node) => (
              <tr key={node.id} className={node.id === selectedNodeId ? 'row-selected' : ''}>
                <td className="row-label" style={{ cursor: 'pointer' }}
                  onClick={() => onSelectNode(node.id === selectedNodeId ? null : node.id)}>
                  <span className="swatch" style={{ background: colorForNode(node.id) }} />
                  {prettyLTL(node)}
                </td>
                {trace.stateIds.map((_, i) => {
                  const v = rows?.get(node.id)?.[i];
                  const isWitness = hoverCell?.nodeId === node.id && witnessPos === i
                    && hoverCell.pos !== i;
                  return (
                    <td key={i}
                      className={[
                        complete && i >= complete.loopIndex ? 'loop-col' : '',
                        v === true ? 'cell-true' : v === false ? 'cell-false' : '',
                        isWitness ? 'witness' : '',
                      ].join(' ')}
                      onMouseEnter={() => setHoverCell({ nodeId: node.id, pos: i })}>
                      {v === undefined ? '–' : v ? '●' : '○'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
