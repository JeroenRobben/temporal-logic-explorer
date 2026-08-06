import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
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

type Drag =
  | { type: 'move'; stateId: string; offX: number; offY: number; moved: boolean }
  | { type: 'edge'; from: string }
  | { type: 'pan'; startX: number; startY: number; origTx: number; origTy: number; moved: boolean };

export default function Canvas(props: CanvasProps) {
  const { model, onChange, selectedStateId, onSelectState, highlight, evidence, deadlocks } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const [tempEdge, setTempEdge] = useState<{ from: string; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  function toWorld(e: { clientX: number; clientY: number }) {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.tx) / view.scale,
      y: (e.clientY - r.top - view.ty) / view.scale,
    };
  }

  function stateAt(x: number, y: number): KripkeState | undefined {
    return model.states.find((s) => Math.hypot(s.x - x, s.y - y) <= R);
  }

  function addStateAt(x: number, y: number) {
    let n = 0;
    while (model.states.some((s) => s.id === `s${n}`)) n++;
    const st: KripkeState = {
      id: `s${n}`, name: `s${n}`, propositions: [],
      isInitial: model.states.length === 0, x, y,
    };
    onChange({ ...model, states: [...model.states, st] });
    onSelectState(st.id);
  }

  function onStatePointerDown(e: PointerEvent, s: KripkeState) {
    e.stopPropagation();
    const p = toWorld(e);
    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    if (dist > R - 9) {
      drag.current = { type: 'edge', from: s.id };
      setTempEdge({ from: s.id, x: p.x, y: p.y });
    } else {
      drag.current = { type: 'move', stateId: s.id, offX: p.x - s.x, offY: p.y - s.y, moved: false };
    }
  }

  function onBackgroundPointerDown(e: PointerEvent) {
    drag.current = {
      type: 'pan', startX: e.clientX, startY: e.clientY,
      origTx: view.tx, origTy: view.ty, moved: false,
    };
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.type === 'move') {
      const p = toWorld(e);
      d.moved = true;
      onChange({
        ...model,
        states: model.states.map((s) =>
          s.id === d.stateId ? { ...s, x: p.x - d.offX, y: p.y - d.offY } : s),
      });
    } else if (d.type === 'edge') {
      const p = toWorld(e);
      setTempEdge({ from: d.from, x: p.x, y: p.y });
    } else {
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      setView((v) => ({ ...v, tx: d.origTx + dx, ty: d.origTy + dy }));
    }
  }

  function onPointerUp(e: PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setTempEdge(null);
    if (!d) return;
    if (d.type === 'edge') {
      const p = toWorld(e);
      const target = stateAt(p.x, p.y);
      if (target && !model.transitions.some((t) => t.from === d.from && t.to === target.id)) {
        onChange({ ...model, transitions: [...model.transitions, { from: d.from, to: target.id }] });
      }
    } else if (d.type === 'move' && !d.moved) {
      onSelectState(d.stateId);
    } else if (d.type === 'pan' && !d.moved) {
      const p = toWorld(e);
      addStateAt(p.x, p.y);
    }
  }

  function onWheel(e: WheelEvent) {
    const factor = Math.exp(-e.deltaY * 0.001);
    setView((v) => {
      const scale = Math.min(3, Math.max(0.3, v.scale * factor));
      const r = svgRef.current!.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      // keep the point under the cursor fixed while zooming
      const wx = (cx - v.tx) / v.scale, wy = (cy - v.ty) / v.scale;
      return { scale, tx: cx - wx * scale, ty: cy - wy * scale };
    });
  }

  function rename(s: KripkeState) {
    const name = window.prompt('State name', s.name);
    if (name !== null && name.trim() !== '') {
      onChange({
        ...model,
        states: model.states.map((x) => (x.id === s.id ? { ...x, name: name.trim() } : x)),
      });
    }
  }

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

  const tempFrom = tempEdge ? stateById(model, tempEdge.from) : undefined;

  return (
    <>
      <svg
        ref={svgRef} className="canvas-svg"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
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
          {tempFrom && tempEdge && (
            <line x1={tempFrom.x} y1={tempFrom.y} x2={tempEdge.x} y2={tempEdge.y}
              stroke="#2b6cb0" strokeWidth={2} strokeDasharray="6 4" />
          )}
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
              <g key={s.id}
                onPointerDown={(e) => onStatePointerDown(e, s)}
                onDoubleClick={(e) => { e.stopPropagation(); rename(s); }}
                style={{ cursor: 'pointer' }}
              >
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
        click empty: add state · drag center: move · drag rim: transition · double-click: rename · Del: delete · wheel: zoom
      </div>
    </>
  );
}
