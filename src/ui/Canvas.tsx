import { useEffect, useRef, useState, type PointerEvent, type MouseEvent } from 'react';
import { KripkeStructure, KripkeState, stateById, allPropositions } from '../core/kripke';
import { Evidence } from '../core/evidence';
import { EVIDENCE_COLOR } from './colors';
import { RESERVED_NAMES } from './Inspector';

export interface Highlight {
  sat: Set<string>;
  fresh: Set<string>;
  color: string;
}

export interface TransitionRef { from: string; to: string; }

export interface CanvasProps {
  model: KripkeStructure;
  /** Committed edit — creates one undo entry. */
  onChange: (m: KripkeStructure) => void;
  /** Transient drag frame — no undo entry. */
  onPreview: (m: KripkeStructure) => void;
  /** Called once before a drag sequence of onPreview calls. */
  onBeginEdit: () => void;
  selectedStateId: string | null;
  selectedTransition: TransitionRef | null;
  onSelectState: (id: string | null) => void;
  onSelectTransition: (t: TransitionRef | null) => void;
  highlight: Highlight | null;
  evidence: Evidence | null;
  deadlocks: Set<string>;
}

export const R = 28;
export const GRID = 20;
const HANDLE_R = 9;

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

function snapCoord(v: number, disabled: boolean): number {
  return disabled ? v : Math.round(v / GRID) * GRID;
}

type Drag =
  | { type: 'move'; stateId: string; offX: number; offY: number; moved: boolean }
  | { type: 'edge'; from: string }
  | { type: 'pan'; startX: number; startY: number; origTx: number; origTy: number; moved: boolean };

export default function Canvas(props: CanvasProps) {
  const {
    model, onChange, onPreview, onBeginEdit,
    selectedStateId, selectedTransition, onSelectState, onSelectTransition,
    highlight, evidence, deadlocks,
  } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const [tempEdge, setTempEdge] = useState<{ from: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ stateId: string; angle: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ stateId: string; text: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ stateId: string; cx: number; cy: number } | null>(null);
  const [newProp, setNewProp] = useState('');
  const drag = useRef<Drag | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

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
    if (e.button !== 0) return;
    e.stopPropagation();
    setCtxMenu(null);
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const p = toWorld(e);
    drag.current = { type: 'move', stateId: s.id, offX: p.x - s.x, offY: p.y - s.y, moved: false };
  }

  function onHandlePointerDown(e: PointerEvent, s: KripkeState) {
    if (e.button !== 0) return;
    e.stopPropagation();
    setCtxMenu(null);
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const p = toWorld(e);
    drag.current = { type: 'edge', from: s.id };
    setTempEdge({ from: s.id, x: p.x, y: p.y });
  }

  function onBackgroundPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    setCtxMenu(null);
    svgRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = {
      type: 'pan', startX: e.clientX, startY: e.clientY,
      origTx: view.tx, origTy: view.ty, moved: false,
    };
  }

  function onPointerMove(e: PointerEvent) {
    const p = toWorld(e);
    lastPointer.current = p;
    const d = drag.current;
    if (!d) {
      const cur = hover ? stateById(model, hover.stateId) : undefined;
      if (cur && Math.hypot(p.x - cur.x, p.y - cur.y) <= R + HANDLE_R + 6) {
        setHover({ stateId: cur.id, angle: Math.atan2(p.y - cur.y, p.x - cur.x) });
      } else {
        const s = stateAt(p.x, p.y);
        setHover(s ? { stateId: s.id, angle: Math.atan2(p.y - s.y, p.x - s.x) } : null);
      }
      return;
    }
    if (d.type === 'move') {
      if (!d.moved) { d.moved = true; onBeginEdit(); }
      const nx = snapCoord(p.x - d.offX, e.altKey);
      const ny = snapCoord(p.y - d.offY, e.altKey);
      onPreview({
        ...model,
        states: model.states.map((s) => (s.id === d.stateId ? { ...s, x: nx, y: ny } : s)),
      });
    } else if (d.type === 'edge') {
      setTempEdge({ from: d.from, x: p.x, y: p.y });
      setDropTargetId(stateAt(p.x, p.y)?.id ?? null);
    } else {
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      setView((v) => ({ ...v, tx: d.origTx + dx, ty: d.origTy + dy }));
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    const d = drag.current;
    drag.current = null;
    setTempEdge(null);
    setDropTargetId(null);
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
      addStateAt(snapCoord(p.x, false), snapCoord(p.y, false));
    }
  }

  function onPointerCancel() {
    drag.current = null;
    setTempEdge(null);
    setDropTargetId(null);
  }

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const h = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.001);
      setView((v) => {
        const scale = Math.min(3, Math.max(0.3, v.scale * factor));
        const r = el.getBoundingClientRect();
        const cx = e.clientX - r.left, cy = e.clientY - r.top;
        const wx = (cx - v.tx) / v.scale, wy = (cy - v.ty) / v.scale;
        return { scale, tx: cx - wx * scale, ty: cy - wy * scale };
      });
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);

  // Keyboard: N adds a state at the cursor, arrows nudge the selected state.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName)) return;
      if (e.key === 'n' || e.key === 'N') {
        const rect = svgRef.current?.getBoundingClientRect();
        const p = lastPointer.current
          ?? (rect
            ? { x: (rect.width / 2 - view.tx) / view.scale, y: (rect.height / 2 - view.ty) / view.scale }
            : { x: 0, y: 0 });
        addStateAt(snapCoord(p.x, false), snapCoord(p.y, false));
      } else if (e.key === 'Escape') {
        setCtxMenu(null);
        setEditing(null);
      } else if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && selectedStateId
      ) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -GRID : e.key === 'ArrowRight' ? GRID : 0;
        const dy = e.key === 'ArrowUp' ? -GRID : e.key === 'ArrowDown' ? GRID : 0;
        onChange({
          ...model,
          states: model.states.map((s) =>
            s.id === selectedStateId ? { ...s, x: s.x + dx, y: s.y + dy } : s),
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, selectedStateId, view]);

  function commitRename() {
    if (!editing) return;
    const name = editing.text.trim();
    if (name !== '') {
      onChange({
        ...model,
        states: model.states.map((s) => (s.id === editing.stateId ? { ...s, name } : s)),
      });
    }
    setEditing(null);
  }

  function onStateContextMenu(e: MouseEvent, s: KripkeState) {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current!.getBoundingClientRect();
    setCtxMenu({ stateId: s.id, cx: e.clientX - rect.left, cy: e.clientY - rect.top });
  }

  function toggleProp(stateId: string, p: string, on: boolean) {
    onChange({
      ...model,
      states: model.states.map((x) => (x.id !== stateId ? x : {
        ...x,
        propositions: on ? [...x.propositions, p] : x.propositions.filter((q) => q !== p),
      })),
    });
  }

  const hasReverse = (from: string, to: string) =>
    model.transitions.some((t) => t.from === to && t.to === from);

  const evidencePairs: { a: KripkeState; b: KripkeState; inLoop: boolean }[] = [];
  let loopEntryState: KripkeState | undefined;
  if (evidence) {
    for (let i = 0; i + 1 < evidence.path.length; i++) {
      const a = stateById(model, evidence.path[i]);
      const b = stateById(model, evidence.path[i + 1]);
      if (a && b) {
        evidencePairs.push({
          a, b,
          inLoop: evidence.loopIndex !== undefined && i >= evidence.loopIndex,
        });
      }
    }
    if (evidence.loopIndex !== undefined) {
      loopEntryState = stateById(model, evidence.path[evidence.loopIndex]);
    }
  }

  const tempFrom = tempEdge ? stateById(model, tempEdge.from) : undefined;
  const ctxState = ctxMenu ? stateById(model, ctxMenu.stateId) : undefined;
  const hoverState = hover && !drag.current && !editing ? stateById(model, hover.stateId) : undefined;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef} className="canvas-svg"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
          </marker>
          <marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2b6cb0" />
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
            const isSel = selectedTransition?.from === t.from && selectedTransition?.to === t.to;
            const d = edgePath(a, b, t.from !== t.to && hasReverse(t.from, t.to));
            return (
              <g key={`${t.from}->${t.to}`}>
                <path d={d} fill="none"
                  stroke={isSel ? '#2b6cb0' : '#555'} strokeWidth={isSel ? 3 : 1.5}
                  markerEnd={isSel ? 'url(#arrow-sel)' : 'url(#arrow)'} />
                <path className="edge-hit" d={d} fill="none" stroke="transparent" strokeWidth={14}
                  style={{ cursor: 'pointer' }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    setCtxMenu(null);
                    onSelectTransition({ from: t.from, to: t.to });
                  }} />
              </g>
            );
          })}
          {tempFrom && tempEdge && (
            <line x1={tempFrom.x} y1={tempFrom.y} x2={tempEdge.x} y2={tempEdge.y}
              stroke="#2b6cb0" strokeWidth={2} strokeDasharray="6 4" />
          )}
          {evidencePairs.map(({ a, b, inLoop }, i) => (
            <path key={`ev-${i}`} className="evidence-path"
              d={edgePath(a, b, a.id !== b.id && hasReverse(a.id, b.id))}
              fill="none" stroke={EVIDENCE_COLOR}
              strokeWidth={inLoop ? 5 : 4} opacity={inLoop ? 1 : 0.85}
              markerEnd="url(#arrow-ev)" />
          ))}
          {loopEntryState && (
            <text x={loopEntryState.x - R - 14} y={loopEntryState.y - R - 2} fontSize={16}
              fill={EVIDENCE_COLOR} style={{ userSelect: 'none' }}>⟲</text>
          )}
          {model.states.map((s) => {
            const inSat = highlight?.sat.has(s.id);
            const isFresh = highlight?.fresh.has(s.id);
            return (
              <g key={s.id}
                onPointerDown={(e) => onStatePointerDown(e, s)}
                onDoubleClick={(e) => { e.stopPropagation(); setEditing({ stateId: s.id, text: s.name }); }}
                onContextMenu={(e) => onStateContextMenu(e, s)}
                style={{ cursor: 'pointer' }}
              >
                {inSat && (
                  <circle cx={s.x} cy={s.y} r={R + 6} fill={isFresh ? highlight!.color : 'none'}
                    fillOpacity={isFresh ? 0.25 : 0} stroke={highlight!.color}
                    strokeWidth={isFresh ? 5 : 3.5} />
                )}
                {dropTargetId === s.id && (
                  <circle cx={s.x} cy={s.y} r={R + 5} fill="none" stroke="#2b6cb0"
                    strokeWidth={3} strokeDasharray="4 3" />
                )}
                {s.isInitial && (
                  <path d={`M ${s.x - R - 26} ${s.y - R - 12} L ${s.x - R + 3} ${s.y - R + 15}`}
                    stroke="#333" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
                )}
                <circle cx={s.x} cy={s.y} r={R} fill="#fff"
                  stroke={s.id === selectedStateId ? '#2b6cb0' : '#333'}
                  strokeWidth={s.id === selectedStateId ? 3 : s.isInitial ? 2.5 : 1.5} />
                {editing?.stateId !== s.id && (
                  <text x={s.x} y={s.y - 2} textAnchor="middle" fontSize={13} fontWeight={600}
                    style={{ userSelect: 'none' }}>{s.name}</text>
                )}
                <text x={s.x} y={s.y + 13} textAnchor="middle" fontSize={11} fill="#2b6cb0"
                  style={{ userSelect: 'none' }}>{s.propositions.join(',')}</text>
                {deadlocks.has(s.id) && (
                  <text x={s.x + R - 4} y={s.y - R + 4} fontSize={14} fill="#dd6b20"
                    style={{ userSelect: 'none' }}>⚠</text>
                )}
              </g>
            );
          })}
          {hoverState && (() => {
            const hx = hoverState.x + Math.cos(hover!.angle) * R;
            const hy = hoverState.y + Math.sin(hover!.angle) * R;
            return (
              <g onPointerDown={(e) => onHandlePointerDown(e, hoverState)}
                style={{ cursor: 'crosshair' }}>
                <circle cx={hx} cy={hy} r={HANDLE_R} fill="#2b6cb0" opacity={0.9} />
                <path d={`M ${hx - 4} ${hy} L ${hx + 4} ${hy} M ${hx + 1} ${hy - 3} L ${hx + 4} ${hy} L ${hx + 1} ${hy + 3}`}
                  stroke="#fff" strokeWidth={1.6} fill="none" />
              </g>
            );
          })()}
          {editing && (() => {
            const s = stateById(model, editing.stateId);
            if (!s) return null;
            return (
              <foreignObject x={s.x - 52} y={s.y - 16} width={104} height={30}>
                <input className="rename-input" autoFocus value={editing.text}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditing(null);
                  }} />
              </foreignObject>
            );
          })()}
        </g>
      </svg>
      {ctxMenu && ctxState && (
        <div className="ctx-menu" style={{ left: ctxMenu.cx, top: ctxMenu.cy }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}>
          {allPropositions(model).map((p) => (
            <label key={p}>
              <input type="checkbox" checked={ctxState.propositions.includes(p)}
                onChange={(e) => toggleProp(ctxState.id, p, e.target.checked)} /> {p}
            </label>
          ))}
          {allPropositions(model).length === 0 && <div className="muted">no propositions yet</div>}
          <input placeholder="new proposition + Enter" value={newProp}
            onChange={(e) => setNewProp(e.target.value)}
            onKeyDown={(e) => {
              const name = newProp.trim();
              if (e.key === 'Enter' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
                && !RESERVED_NAMES.includes(name)) {
                toggleProp(ctxState.id, name, true);
                setNewProp('');
              }
            }} />
        </div>
      )}
      <div className="canvas-help">
        click empty or N: add state · drag: move · drag rim handle: transition · double-click: rename ·
        right-click: propositions · Del: delete · Ctrl+Z: undo · wheel: zoom · Alt while dragging: no snap
      </div>
    </div>
  );
}
