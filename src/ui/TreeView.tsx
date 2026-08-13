import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { KripkeStructure, stateById } from '../core/kripke';
import { TreeNode, unfoldTree, countNodes } from '../core/unfold';
import { layoutTree, TreePos } from './treeLayout';
import { PendingLasso } from './types';
import { EVIDENCE_COLOR } from './colors';

const TRACE_COLOR = '#7c3aed';
const NODE_R = 16;
const MAX_NODES = 800;

/** Evidence lasso normalized for tree overlay use. */
export interface TreeEvidence { stateIds: string[]; loopIndex: number | null }

interface TreeViewProps {
  model: KripkeStructure;
  highlight: { sat: Set<string>; color: string } | null;
  trace: PendingLasso | null;
  evidence: TreeEvidence | null;
  onHoverNode: (stateId: string | null) => void;
}

/** Unroll a (possibly looping) state sequence to at most maxLen positions. */
function unrollLasso(
  stateIds: string[], loopIndex: number | null, maxLen: number,
): { seq: string[]; continues: boolean } {
  const seq: string[] = [];
  let pos = 0;
  while (seq.length < maxLen) {
    if (pos >= stateIds.length) {
      if (loopIndex === null) return { seq, continues: false };
      pos = loopIndex;
    }
    seq.push(stateIds[pos]);
    pos++;
  }
  return { seq, continues: true };
}

/** Map a state sequence onto the tree as a root-downward branch. cutKey marks
 *  the last matched node when the sequence continues beyond the visible tree. */
function branchMatch(
  root: TreeNode, seq: string[], continues: boolean,
): { keys: Set<string>; cutKey: string | null } {
  if (seq.length === 0 || root.stateId !== seq[0]) return { keys: new Set(), cutKey: null };
  const keys = new Set([root.key]);
  let node = root;
  let cut = continues;
  for (let i = 1; i < seq.length; i++) {
    const next = node.children.find((c) => c.stateId === seq[i]);
    if (!next) { cut = true; break; }
    keys.add(next.key);
    node = next;
  }
  return { keys, cutKey: cut ? node.key : null };
}

export default function TreeView({ model, highlight, trace, evidence, onHoverNode }: TreeViewProps) {
  const [depth, setDepth] = useState(3);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const drag = useRef<{ startX: number; startY: number; origTx: number; origTy: number } | null>(null);

  const roots = useMemo(() => model.states.filter((s) => s.isInitial), [model]);

  const { trees, effDepth, clamped } = useMemo(() => {
    for (let d = depth; d >= 1; d--) {
      const ts = roots.map((r) => unfoldTree(model, r.id, d));
      const total = ts.reduce((acc, t) => acc + countNodes(t), 0);
      if (total <= MAX_NODES || d === 1) {
        return { trees: ts, effDepth: d, clamped: d < depth };
      }
    }
    return { trees: [] as TreeNode[], effDepth: depth, clamped: false };
  }, [model, roots, depth]);

  const layouts = useMemo(() => {
    let slot = 0;
    return trees.map((t) => {
      const { positions, slots } = layoutTree(t, slot);
      slot += slots + 1;
      return positions;
    });
  }, [trees]);

  const totalNodes = trees.reduce((acc, t) => acc + countNodes(t), 0);

  const traceSeq = useMemo(() => {
    if (!trace || trace.stateIds.length === 0) return null;
    return unrollLasso(trace.stateIds, trace.loopIndex, effDepth + 1);
  }, [trace, effDepth]);

  const evSeq = useMemo(() => {
    if (!evidence || evidence.stateIds.length === 0) return null;
    return unrollLasso(evidence.stateIds, evidence.loopIndex, effDepth + 1);
  }, [evidence, effDepth]);

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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="tree-toolbar">
        depth
        <input type="range" min={1} max={6} value={depth}
          onChange={(e) => setDepth(Number(e.target.value))} />
        {effDepth}
        <span className="muted">· {totalNodes} node{totalNodes === 1 ? '' : 's'}</span>
        {clamped && <span className="hint">depth clamped to keep ≤ {MAX_NODES} nodes</span>}
      </div>
      <svg
        ref={svgRef} className="canvas-svg" style={{ flex: 1 }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onMouseLeave={() => onHoverNode(null)}
      >
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {trees.map((t, ti) => {
            const positions = layouts[ti];
            const p = (k: string): TreePos => positions.get(k)!;
            const tb = traceSeq ? branchMatch(t, traceSeq.seq, traceSeq.continues) : null;
            const eb = evSeq ? branchMatch(t, evSeq.seq, evSeq.continues) : null;
            const edges: JSX.Element[] = [];
            const nodes: JSX.Element[] = [];
            (function render(n: TreeNode) {
              const np = p(n.key);
              for (const c of n.children) {
                const cp = p(c.key);
                const onTrace = !!tb && tb.keys.has(n.key) && tb.keys.has(c.key);
                const onEv = !!eb && eb.keys.has(n.key) && eb.keys.has(c.key);
                edges.push(
                  <line key={`e-${c.key}`}
                    className={onTrace ? 'tree-branch' : onEv ? 'tree-branch-ev' : undefined}
                    x1={np.x} y1={np.y + NODE_R} x2={cp.x} y2={cp.y - NODE_R}
                    stroke={onTrace ? TRACE_COLOR : onEv ? EVIDENCE_COLOR : '#888'}
                    strokeWidth={onTrace || onEv ? 3.5 : 1.2} />,
                );
                render(c);
              }
              const st = stateById(model, n.stateId);
              nodes.push(
                <g key={`n-${n.key}`} className="tree-node"
                  onMouseEnter={() => onHoverNode(n.stateId)}>
                  {highlight?.sat.has(n.stateId) && (
                    <circle className="tree-ring" cx={np.x} cy={np.y} r={NODE_R + 4}
                      fill="none" stroke={highlight.color} strokeWidth={3} />
                  )}
                  <circle cx={np.x} cy={np.y} r={NODE_R} fill="#fff" stroke="#333" strokeWidth={1.2} />
                  <text x={np.x} y={np.y + 3} textAnchor="middle" fontSize={10}
                    style={{ userSelect: 'none' }}>
                    {st?.name ?? n.stateId}{n.revisit ? ' ⟳' : ''}
                  </text>
                </g>,
              );
            })(t);
            const cuts: JSX.Element[] = [];
            if (tb?.cutKey) {
              const cp = p(tb.cutKey);
              cuts.push(<text key="tcut" x={cp.x - 8} y={cp.y + NODE_R + 14} fontSize={12}
                fill={TRACE_COLOR} style={{ userSelect: 'none' }}>↓⟳</text>);
            }
            if (eb?.cutKey) {
              const cp = p(eb.cutKey);
              cuts.push(<text key="ecut" x={cp.x + 8} y={cp.y + NODE_R + 14} fontSize={12}
                fill={EVIDENCE_COLOR} style={{ userSelect: 'none' }}>↓⟳</text>);
            }
            return <g key={t.key + '-' + ti}>{edges}{nodes}{cuts}</g>;
          })}
        </g>
      </svg>
    </div>
  );
}
