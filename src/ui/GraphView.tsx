import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { KripkeStructure } from '../core/kripke';
import { forceLayout } from '../core/layout';
import { edgePath } from './Canvas';

export interface GraphNode {
  id: string;
  label: string;
  accepting?: boolean;
  initial?: boolean;
}
export interface GraphEdge { from: string; to: string; label?: string }
export interface RenderGraph { nodes: GraphNode[]; edges: GraphEdge[] }

interface GraphViewProps {
  graph: RenderGraph;
  onHoverNode: (id: string | null) => void;
}

const GR = 26;

export default function GraphView({ graph, onHoverNode }: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null);

  const positions = useMemo(() => {
    const pseudo: KripkeStructure = {
      states: graph.nodes.map((n, i) => ({
        id: n.id, name: n.label, propositions: [], isInitial: !!n.initial,
        x: 110 + (i % 5) * 150, y: 90 + Math.floor(i / 5) * 150,
      })),
      transitions: graph.edges.map((e) => ({ from: e.from, to: e.to })),
    };
    return forceLayout(pseudo, 200, 130);
  }, [graph]);

  const pos = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
  const hasReverse = (from: string, to: string) =>
    graph.edges.some((e) => e.from === to && e.to === from);

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    svgRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origTx: view.tx, origTy: view.ty };
  }
  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, tx: d.origTx + e.clientX - d.startX, ty: d.origTy + e.clientY - d.startY }));
  }
  function onPointerUp(e: PointerEvent) {
    if (svgRef.current?.hasPointerCapture?.(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
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

  function midpoint(a: { x: number; y: number }, b: { x: number; y: number }, curved: boolean) {
    if (a === b) return { x: a.x, y: a.y - GR - 46 };
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (!curved) return { x: mx, y: my - 5 };
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: mx - (dy / d) * 16, y: my + (dx / d) * 16 - 5 };
  }

  return (
    <svg
      ref={svgRef} className="canvas-svg"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onMouseLeave={() => onHoverNode(null)}
    >
      <defs>
        <marker id="garrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-dim)" />
        </marker>
      </defs>
      <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
        {graph.edges.map((e, i) => {
          const a = { id: e.from, ...pos(e.from) };
          const b = { id: e.to, ...pos(e.to) };
          const curved = e.from !== e.to && hasReverse(e.from, e.to);
          const m = midpoint(pos(e.from), e.from === e.to ? pos(e.from) : pos(e.to), curved);
          return (
            <g key={i}>
              <path d={edgePath(a, b, curved)} fill="none" stroke="var(--text-dim)"
                strokeWidth={1.3} markerEnd="url(#garrow)" />
              {e.label && (
                <text className="edge-label" x={m.x} y={m.y} textAnchor="middle">{e.label}</text>
              )}
            </g>
          );
        })}
        {graph.nodes.map((n) => {
          const p = pos(n.id);
          return (
            <g key={n.id}
              onMouseEnter={() => onHoverNode(n.id)}
              style={{ cursor: 'default' }}>
              {n.initial && (
                <path d={`M ${p.x - GR - 24} ${p.y - GR - 10} L ${p.x - GR + 3} ${p.y - GR + 13}`}
                  stroke="var(--text)" strokeWidth={2} markerEnd="url(#garrow)" fill="none" />
              )}
              <circle cx={p.x} cy={p.y} r={GR} fill="var(--panel)" stroke="var(--text)" strokeWidth={1.5} />
              {n.accepting && (
                <circle cx={p.x} cy={p.y} r={GR - 4} fill="none" stroke="var(--text)" strokeWidth={1.2} />
              )}
              <text className="graph-label" x={p.x} y={p.y + 4} textAnchor="middle"
                style={{ userSelect: 'none' }}>{n.label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
