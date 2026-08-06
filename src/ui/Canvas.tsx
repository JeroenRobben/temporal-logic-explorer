import { useRef, useState } from 'react';
import { KripkeStructure, KripkeState, stateById } from '../core/kripke';
import { Evidence } from '../core/evidence';
import { EVIDENCE_COLOR } from './colors';

export interface Highlight {
  sat: Set<string>;
  fresh: Set<string>;
  color: string;
}

export interface CanvasProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selectedStateId: string | null;
  onSelectState: (id: string | null) => void;
  highlight: Highlight | null;
  evidence: Evidence | null;
  deadlocks: Set<string>;
}

export const R = 28;

export function edgePath(a: KripkeState, b: KripkeState, curved: boolean): string {
  if (a.id === b.id) {
    return `M ${a.x - 10} ${a.y - R + 4} C ${a.x - 45} ${a.y - R - 52}, ${a.x + 45} ${a.y - R - 52}, ${a.x + 10} ${a.y - R + 4}`;
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const sx = a.x + ux * R, sy = a.y + uy * R;
  const ex = b.x - ux * R, ey = b.y - uy * R;
  if (!curved) return `M ${sx} ${sy} L ${ex} ${ey}`;
  const mx = (sx + ex) / 2 - uy * 22, my = (sy + ey) / 2 + ux * 22;
  return `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`;
}

export default function Canvas(props: CanvasProps) {
  const { model, selectedStateId, highlight, evidence, deadlocks } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view] = useState({ tx: 0, ty: 0, scale: 1 });

  const hasReverse = (from: string, to: string) =>
    model.transitions.some((t) => t.from === to && t.to === from);

  const evidencePairs: [KripkeState, KripkeState][] = [];
  if (evidence) {
    for (let i = 0; i + 1 < evidence.path.length; i++) {
      const a = stateById(model, evidence.path[i]);
      const b = stateById(model, evidence.path[i + 1]);
      if (a && b) evidencePairs.push([a, b]);
    }
  }

  return (
    <>
      <svg ref={svgRef} className="canvas-svg">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
          </marker>
          <marker id="arrow-ev" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={EVIDENCE_COLOR} />
          </marker>
        </defs>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {model.transitions.map((t) => {
            const a = stateById(model, t.from), b = stateById(model, t.to);
            if (!a || !b) return null;
            return (
              <path key={`${t.from}->${t.to}`}
                d={edgePath(a, b, t.from !== t.to && hasReverse(t.from, t.to))}
                fill="none" stroke="#555" strokeWidth={1.5} markerEnd="url(#arrow)" />
            );
          })}
          {evidencePairs.map(([a, b], i) => (
            <path key={`ev-${i}`} className="evidence-path"
              d={edgePath(a, b, a.id !== b.id && hasReverse(a.id, b.id))}
              fill="none" stroke={EVIDENCE_COLOR} strokeWidth={4} opacity={0.85}
              markerEnd="url(#arrow-ev)" />
          ))}
          {model.states.map((s) => {
            const inSat = highlight?.sat.has(s.id);
            const isFresh = highlight?.fresh.has(s.id);
            return (
              <g key={s.id} data-state-id={s.id}>
                {inSat && (
                  <circle cx={s.x} cy={s.y} r={R + 6} fill={isFresh ? highlight!.color : 'none'}
                    fillOpacity={isFresh ? 0.25 : 0} stroke={highlight!.color}
                    strokeWidth={isFresh ? 5 : 3.5} />
                )}
                {s.isInitial && (
                  <path d={`M ${s.x - R - 26} ${s.y - R - 12} L ${s.x - R + 3} ${s.y - R + 15}`}
                    stroke="#333" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
                )}
                <circle cx={s.x} cy={s.y} r={R} fill="#fff"
                  stroke={s.id === selectedStateId ? '#2b6cb0' : '#333'}
                  strokeWidth={s.id === selectedStateId ? 3 : s.isInitial ? 2.5 : 1.5} />
                <text x={s.x} y={s.y - 2} textAnchor="middle" fontSize={13} fontWeight={600}
                  style={{ userSelect: 'none' }}>{s.name}</text>
                <text x={s.x} y={s.y + 13} textAnchor="middle" fontSize={11} fill="#2b6cb0"
                  style={{ userSelect: 'none' }}>{s.propositions.join(',')}</text>
                {deadlocks.has(s.id) && (
                  <text x={s.x + R - 4} y={s.y - R + 4} fontSize={14} fill="#dd6b20"
                    style={{ userSelect: 'none' }}>⚠</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="canvas-help">
        click empty: add state · drag center: move · drag rim: transition · double-click: rename · Del: delete
      </div>
    </>
  );
}
