# Computation-Tree Unfolding View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Tree" canvas tab that unrolls the Kripke structure from its initial state(s) into a depth-bounded execution tree with subformula coloring, trace/evidence branch overlays, and quantifier glosses.

**Architecture:** One pure core module (`unfold.ts`: bounded tree with revisit marking), one pure layout helper (`treeLayout.ts`: deterministic tidy tree), one read-only `TreeView` component (pan/zoom per GraphView idioms, depth slider with an 800-node clamp), and App wiring (tab, overlay derivations, hover gloss into the existing inspector panel).

**Tech Stack:** Existing React 18 + TS + Vite + Vitest. No new dependencies. Tests run ONLY via `npm test`.

**Spec:** `docs/superpowers/specs/2026-08-11-tree-unfolding-design.md`
**Baseline:** branch `feature/tree-unfolding`, 210 tests passing.

---

## File map

```
src/core/unfold.ts        — NEW: unfoldTree + countNodes (pure)
src/core/unfold.test.ts   — NEW
src/ui/treeLayout.ts      — NEW: tidy-tree positions (pure)
src/ui/treeLayout.test.ts — NEW
src/ui/TreeView.tsx       — NEW: read-only tree renderer + toolbar
src/ui/App.tsx            — MODIFY: 'tree' viewTab, overlay derivations, hover gloss
src/ui/Inspector.tsx      — MODIFY: hovered-node section also in the CTL branch
src/styles.css            — MODIFY: tree styles
src/ui/App.test.tsx       — MODIFY: integration tests (Task 4)
README.md                 — MODIFY (Task 4)
```

---

### Task 1: Unfold module

**Files:**
- Create: `src/core/unfold.ts`
- Test: `src/core/unfold.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/unfold.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { unfoldTree, countNodes, TreeNode } from './unfold';

// reset example: w (self-loop) -> e -> r -> w
const k: KripkeStructure = {
  states: [
    { id: 'w', name: 'work', propositions: ['w'], isInitial: true, x: 0, y: 0 },
    { id: 'e', name: 'error', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'r', name: 'reset', propositions: ['r'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'w', to: 'w' }, { from: 'w', to: 'e' },
    { from: 'e', to: 'r' }, { from: 'r', to: 'w' },
  ],
};

function shape(n: TreeNode): string {
  const c = n.children.map(shape).join(',');
  return `${n.stateId}${n.revisit ? '⟳' : ''}${c ? `(${c})` : ''}`;
}

describe('unfoldTree', () => {
  it('depth 0 yields the root only', () => {
    const t = unfoldTree(k, 'w', 0);
    expect(t.children).toEqual([]);
    expect(t.key).toBe('0');
    expect(t.depth).toBe(0);
    expect(t.revisit).toBe(false);
  });
  it('unrolls in transition order with revisit marking', () => {
    const t = unfoldTree(k, 'w', 2);
    expect(shape(t)).toBe('w(w⟳(w⟳,e),e(r))');
  });
  it('revisit is per root-path, not global', () => {
    // at depth 3 the branch w→e→r→w revisits w (w is on that root-path)
    const t = unfoldTree(k, 'w', 3);
    const r = t.children[1].children[0]; // w→e→r
    expect(r.stateId).toBe('r');
    expect(r.revisit).toBe(false);
    expect(r.children[0].stateId).toBe('w');
    expect(r.children[0].revisit).toBe(true);
  });
  it('keys are path-based and unique', () => {
    const t = unfoldTree(k, 'w', 3);
    const keys: string[] = [];
    (function walk(n: TreeNode) { keys.push(n.key); n.children.forEach(walk); })(t);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('0.1.0.0'); // w→e→r→w
  });
  it('countNodes matches the hand-computed unfolding', () => {
    // depth 3 from w: 1 + 2 + 3 + 4 = 10
    expect(countNodes(unfoldTree(k, 'w', 3))).toBe(10);
  });
  it('deadlock states simply have no children', () => {
    const kd: KripkeStructure = {
      states: [
        { id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 },
        { id: 'd', name: 'd', propositions: [], isInitial: false, x: 0, y: 0 },
      ],
      transitions: [{ from: 'a', to: 'd' }],
    };
    const t = unfoldTree(kd, 'a', 3);
    expect(shape(t)).toBe('a(d)');
  });
  it('is deterministic', () => {
    expect(JSON.stringify(unfoldTree(k, 'w', 4))).toBe(JSON.stringify(unfoldTree(k, 'w', 4)));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./unfold`. 210 existing pass.

- [ ] **Step 3: Implement**

`src/core/unfold.ts`:

```ts
import { KripkeStructure, successors } from './kripke';

export interface TreeNode {
  /** Path key: root "0", children "0.0", "0.1", … — unique within one unfolding. */
  key: string;
  stateId: string;
  depth: number;
  /** True when stateId already occurred on this node's root-path (the branch
   *  has entered a cycle — where the infinite regress lives). */
  revisit: boolean;
  children: TreeNode[];
}

/** Bounded unfolding of the model from rootStateId. Children are generated in
 *  the model's transition order (deterministic); nodes at maxDepth get none. */
export function unfoldTree(model: KripkeStructure, rootStateId: string, maxDepth: number): TreeNode {
  function build(stateId: string, key: string, depth: number, onPath: Set<string>): TreeNode {
    const node: TreeNode = {
      key, stateId, depth,
      revisit: onPath.has(stateId),
      children: [],
    };
    if (depth < maxDepth) {
      const nextPath = new Set(onPath);
      nextPath.add(stateId);
      successors(model, stateId).forEach((succ, i) => {
        node.children.push(build(succ, `${key}.${i}`, depth + 1, nextPath));
      });
    }
    return node;
  }
  return build(rootStateId, '0', 0, new Set());
}

export function countNodes(root: TreeNode): number {
  return 1 + root.children.reduce((acc, c) => acc + countNodes(c), 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (210 + 7 = 217).

- [ ] **Step 5: Commit**

```bash
git add src/core/unfold.ts src/core/unfold.test.ts
git commit -m "feat: bounded computation-tree unfolding with revisit marking"
```

---

### Task 2: Tidy-tree layout

**Files:**
- Create: `src/ui/treeLayout.ts`
- Test: `src/ui/treeLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/ui/treeLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from '../core/kripke';
import { unfoldTree, TreeNode } from '../core/unfold';
import { layoutTree, X_SLOT, Y_STEP } from './treeLayout';

const k: KripkeStructure = {
  states: [
    { id: 'w', name: 'w', propositions: [], isInitial: true, x: 0, y: 0 },
    { id: 'e', name: 'e', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'r', name: 'r', propositions: [], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'w', to: 'w' }, { from: 'w', to: 'e' },
    { from: 'e', to: 'r' }, { from: 'r', to: 'w' },
  ],
};

describe('layoutTree', () => {
  const tree = unfoldTree(k, 'w', 3);
  const { positions, slots } = layoutTree(tree);

  it('positions every node', () => {
    let count = 0;
    (function walk(n: TreeNode) { count++; n.children.forEach(walk); })(tree);
    expect(positions.size).toBe(count);
  });
  it('y grows with depth', () => {
    expect(positions.get('0')!.y + Y_STEP).toBe(positions.get('0.0')!.y);
  });
  it('no two nodes at the same depth share an x position', () => {
    const byDepth = new Map<number, number[]>();
    (function walk(n: TreeNode) {
      const arr = byDepth.get(n.depth) ?? [];
      arr.push(positions.get(n.key)!.x);
      byDepth.set(n.depth, arr);
      n.children.forEach(walk);
    })(tree);
    for (const xs of byDepth.values()) {
      expect(new Set(xs).size).toBe(xs.length);
    }
  });
  it('parents are centered over their children', () => {
    const root = positions.get('0')!;
    const c0 = positions.get('0.0')!;
    const c1 = positions.get('0.1')!;
    expect(root.x).toBeCloseTo((c0.x + c1.x) / 2);
  });
  it('slots equals the leaf count and startSlot offsets a second tree', () => {
    let leaves = 0;
    (function walk(n: TreeNode) {
      if (n.children.length === 0) leaves++;
      n.children.forEach(walk);
    })(tree);
    expect(slots).toBe(leaves);
    const second = layoutTree(tree, slots + 1);
    const minX = Math.min(...[...second.positions.values()].map((p) => p.x));
    const maxX = Math.max(...[...positions.values()].map((p) => p.x));
    expect(minX).toBeGreaterThan(maxX + X_SLOT - 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./treeLayout`.

- [ ] **Step 3: Implement**

`src/ui/treeLayout.ts`:

```ts
import { TreeNode } from '../core/unfold';

export interface TreePos { x: number; y: number }

export const X_SLOT = 70;
export const Y_STEP = 90;
const X_MARGIN = 60;
const Y_MARGIN = 48;

/** Deterministic tidy layout: leaves take sequential x-slots starting at
 *  startSlot; parents center over their first and last child; y = depth step.
 *  Returns positions keyed by TreeNode.key plus the number of slots consumed
 *  (so a forest can lay trees side by side). */
export function layoutTree(root: TreeNode, startSlot = 0): { positions: Map<string, TreePos>; slots: number } {
  const positions = new Map<string, TreePos>();
  let nextSlot = startSlot;

  function assign(n: TreeNode): number {
    const y = Y_MARGIN + n.depth * Y_STEP;
    if (n.children.length === 0) {
      const x = X_MARGIN + nextSlot * X_SLOT;
      nextSlot++;
      positions.set(n.key, { x, y });
      return x;
    }
    const xs = n.children.map(assign);
    const x = (xs[0] + xs[xs.length - 1]) / 2;
    positions.set(n.key, { x, y });
    return x;
  }

  assign(root);
  return { positions, slots: nextSlot - startSlot };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (217 + 5 = 222).

- [ ] **Step 5: Commit**

```bash
git add src/ui/treeLayout.ts src/ui/treeLayout.test.ts
git commit -m "feat: deterministic tidy-tree layout for the unfolding view"
```

---

### Task 3: TreeView component + App wiring

**Files:**
- Create: `src/ui/TreeView.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/Inspector.tsx`, `src/styles.css`

- [ ] **Step 1: styles**

Append to `src/styles.css`:

```css
.tree-toolbar { display: flex; align-items: center; gap: 8px; padding: 4px 10px;
  font-size: 12px; background: #fdfdfd; border-bottom: 1px solid #eee; }
.tree-toolbar input[type="range"] { width: 120px; }
```

- [ ] **Step 2: TreeView component**

`src/ui/TreeView.tsx`:

```tsx
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
```

Note: `JSX.Element` follows the codebase's existing usage (Inspector uses it); if the compiler complains, use `ReactElement` with an import — report the adjustment.

- [ ] **Step 3: App wiring**

In `src/ui/App.tsx`:

1. Imports:

```tsx
import TreeView, { TreeEvidence } from './TreeView';
import { CTLNode } from '../core/ctl-parser';
```

(`StarNode` from '../core/ctlstar-parser' is likely already imported via parse/classify — extend that import with `StarNode` if not.)

2. Widen the tab state type:

```tsx
  const [viewTab, setViewTab] = useState<'model' | 'tree' | 'automaton' | 'product'>('model');
```

3. New state + derivations (near graphHover):

```tsx
  const [treeHover, setTreeHover] = useState<string | null>(null);
  const treeAvailable = model.states.some((s) => s.isInitial);
```

4. Evidence normalization memo (after `starEvidence`):

```tsx
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
```

5. Hover gloss memo (near graphDetail) + tiny finders:

```tsx
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
```

6. Tab row and render — the tab strip now shows when `graphable || treeAvailable`; insert the Tree button between Model and the contextual pair, and add the TreeView render branch:

```tsx
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
                    {/* existing Automaton + Product buttons unchanged */}
                  </>
                )}
              </div>
            )}
```

and in the view body:

```tsx
              {viewTab === 'tree' ? (
                treeAvailable ? (
                  <TreeView
                    model={model}
                    highlight={highlight}
                    trace={trace}
                    evidence={treeEvidence}
                    onHoverNode={setTreeHover}
                  />
                ) : (
                  <Canvas … existing props unchanged … />
                )
              ) : (!graphable || viewTab === 'model') ? (
                <Canvas … existing props unchanged … />
              ) : viewTab === 'automaton' ? (
                /* existing GraphView automaton branch unchanged */
              ) : (
                /* existing GraphView product branch unchanged */
              )}
```

(The `'tree'` case is handled FIRST with an explicit Canvas fallback — otherwise a stale tree tab combined with a CTL* quantifier selection and no initial states would fall through to the product branch. To avoid duplicating the large Canvas element in JSX, extract it once above the return as `const canvasEl = <Canvas … existing props … />;` and use `{canvasEl}` in both fallback positions.)
```

(Reconcile with the current JSX structure — the `center-stack`/`view-body` wrappers from the Büchi iteration stay; only the conditions change. The existing `viewTab === 'model'` fallbacks must treat `'tree'` correctly: when `treeAvailable` turns false while on the tree tab, the `viewTab === 'tree' && treeAvailable` guard falls through to the Canvas branch — verify that chain.)

7. Pass the merged hover detail to Inspector: change `graphDetail={graphDetail}` to `graphDetail={graphDetail ?? treeDetail}`.

- [ ] **Step 4: Inspector — hovered-node section in the CTL branch**

The LTL and CTL* branches already render the `graphDetail` block. Add the same block at the bottom of the CTL formula branch (before its closing `</div>`), so tree hovers show for CTL formulas too:

```tsx
          {graphDetail && (
            <>
              <div className="section-title">Hovered node</div>
              <div style={{ fontWeight: 600 }}>{graphDetail.title}</div>
              {graphDetail.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}
            </>
          )}
```

- [ ] **Step 5: Verify**

`npm test` (222 pass — no existing test asserts the tab row's absence when only a model exists; if one does, report it), `npx tsc --noEmit`, `npm run build`. Manual (`npm run dev`): Tree tab appears; slider unrolls the reset example (10 nodes at depth 3); revisit ⟳ markers on loop re-entries; selecting a CTL/CTL* state-subformula colors tree nodes; recording/loading a trace draws the violet branch with ↓⟳ cutoff; a failing `∀`/CTL*-A formula's counterexample draws orange; hovering a tree node fills the inspector panel, with quantifier glosses when an A/E-style node is selected.

- [ ] **Step 6: Commit**

```bash
git add src/ui/TreeView.tsx src/ui/App.tsx src/ui/Inspector.tsx src/styles.css
git commit -m "feat: computation-tree tab — depth slider, coloring, trace/evidence branches, glosses"
```

---

### Task 4: Integration tests, README, final review

**Files:**
- Modify: `src/ui/App.test.tsx`, `README.md`

- [ ] **Step 1: Integration tests**

Append to the describe block in `src/ui/App.test.tsx` (existing helpers: `firePointer`, `within`; default reset example: work(160,140), error(380,140), reset(270,320)):

```tsx
  it('Tree tab renders the depth-3 unfolding of the default example', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Tree'));
    expect(document.querySelectorAll('.tree-node').length).toBe(10); // 1+2+3+4
    expect(screen.getByText(/10 nodes/)).toBeTruthy();
  });

  it('selecting a CTL subformula colors tree nodes', () => {
    render(<App />);
    fireEvent.click(screen.getByText('AG EF r'));
    fireEvent.click(screen.getByText('Tree'));
    // click the EF r node row in the inspector tree (row index 1: AG, EF, r)
    fireEvent.click(document.querySelectorAll('.node-row')[1]);
    // EF r holds everywhere → every tree node gets a ring
    expect(document.querySelectorAll('.tree-ring').length).toBe(10);
  });

  it('a recorded trace draws as a violet branch on the tree', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    for (const [x, y, name] of [[160, 140, 'work'], [380, 140, 'error'], [270, 320, 'reset'], [160, 140, 'work']] as const) {
      firePointer('pointerDown', within(svg as unknown as HTMLElement).getByText(name), { clientX: x, clientY: y, button: 0 });
      firePointer('pointerUp', svg, { clientX: x, clientY: y, button: 0 });
    }
    fireEvent.click(screen.getByText('Tree'));
    expect(document.querySelectorAll('.tree-branch').length).toBeGreaterThan(0);
  });
```

Mechanics notes: after switching to the Tree tab the model canvas unmounts, so all canvas queries must happen before the tab click. If `screen.getByText('Tree')` is ambiguous (e.g. a state named Tree — not the case in the default example), scope with `within(document.querySelector('.view-tabs')!)`. Adjust mechanics only, never assertions.

- [ ] **Step 2: Run tests**

`npm test` — expect 225 (222 + 3). `npx tsc --noEmit`, `npm run build` clean.

- [ ] **Step 3: README**

Add a bullet under `## Use`:

```markdown
- **Tree (canvas tab):** unfolds the computation tree from the initial state(s)
  — depth slider 1–6, ⟳ marks where a branch re-enters a visited state. The
  selected state-subformula colors tree nodes; the active trace and the active
  counterexample/witness each light up as a root-downward branch (↓⟳ where they
  continue beyond the shown depth) — a trace is one branch of this tree, which
  is exactly the LTL-vs-branching story.
```

- [ ] **Step 4: Manual walkthrough**

`npm run dev`: full spec pass — slider incl. clamping (build a dense model to trigger it), multi-initial forest, coloring for CTL and CTL* state nodes (and confirm LTL selection colors nothing), trace + evidence branches coexisting, hover glosses for universal vs existential selections, tab interplay (Tree ↔ Automaton/Product ↔ Model, recording jumps to Model as before). Fix anything broken with small individual commits.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.test.tsx README.md
git commit -m "test: tree view integration tests; docs: tree tab usage"
```
