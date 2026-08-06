# Kripke Editor Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nine editor improvements — transition selection/deletion, undo/redo, connect-handle transition drawing, hover affordances, inline rename, right-click proposition menu, auto-layout, grid snapping, keyboard shortcuts.

**Architecture:** Two new pure modules (`src/core/layout.ts` force layout, `src/ui/history.ts` snapshot history + `useHistory` hook), a full interactive rewrite of `Canvas.tsx` (new prop contract: `onChange` committed / `onPreview` transient / `onBeginEdit` checkpoint), and App/Header/Inspector wiring. Core checker/parser/evidence untouched.

**Tech Stack:** Existing React 18 + TS + Vite + Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-06-kripke-editor-improvements-design.md`
**Baseline:** branch `feature/editor-v2`, 52 tests passing.

---

## File map

```
src/core/layout.ts        — NEW: deterministic Fruchterman–Reingold layout (pure)
src/core/layout.test.ts   — NEW
src/ui/history.ts         — NEW: pure snapshot-history functions
src/ui/history.test.ts    — NEW
src/ui/useHistory.ts      — NEW: React hook over history.ts
src/ui/types.ts           — MODIFY: Selection gains transition variant
src/ui/Canvas.tsx         — REWRITE: new interaction model
src/ui/Inspector.tsx      — MODIFY: transition pane, export RESERVED_NAMES
src/ui/App.tsx            — MODIFY (Task 3 wiring) then REPLACE (Task 4 history)
src/ui/Header.tsx         — MODIFY: Undo/Redo/Auto-layout buttons
src/styles.css            — MODIFY: ctx-menu, rename-input styles
src/ui/App.test.tsx       — MODIFY: integration tests (Task 5)
README.md                 — MODIFY: new editor features
```

---

### Task 1: Force layout module

**Files:**
- Create: `src/core/layout.ts`
- Test: `src/core/layout.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { forceLayout } from './layout';

function mk(states: [string, number, number][], transitions: [string, string][]): KripkeStructure {
  return {
    states: states.map(([id, x, y]) => ({ id, name: id, propositions: [], isInitial: false, x, y })),
    transitions: transitions.map(([from, to]) => ({ from, to })),
  };
}

describe('forceLayout', () => {
  it('returns empty map for empty model', () => {
    expect(forceLayout(mk([], [])).size).toBe(0);
  });
  it('single state keeps its position', () => {
    const r = forceLayout(mk([['a', 100, 50]], []));
    expect(r.get('a')).toEqual({ x: 100, y: 50 });
  });
  it('is deterministic', () => {
    const m = mk([['a', 0, 0], ['b', 10, 0], ['c', 0, 10]], [['a', 'b'], ['b', 'c']]);
    const r1 = forceLayout(m);
    const r2 = forceLayout(m);
    expect([...r1.entries()]).toEqual([...r2.entries()]);
  });
  it('a connected pair settles near the ideal distance', () => {
    const r = forceLayout(mk([['a', 0, 0], ['b', 30, 0]], [['a', 'b']]), 300, 120);
    const a = r.get('a')!, b = r.get('b')!;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(240);
  });
  it('coincident states separate without NaN', () => {
    const r = forceLayout(mk([['a', 50, 50], ['b', 50, 50], ['c', 50, 50]], []));
    for (const p of r.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    const [a, b] = [r.get('a')!, r.get('b')!];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(10);
  });
  it('preserves the centroid', () => {
    const m = mk([['a', 0, 0], ['b', 200, 0], ['c', 100, 300]], [['a', 'b']]);
    const r = forceLayout(m);
    const cx = ([...r.values()].reduce((s, p) => s + p.x, 0)) / 3;
    const cy = ([...r.values()].reduce((s, p) => s + p.y, 0)) / 3;
    expect(cx).toBeCloseTo(100, 0);
    expect(cy).toBeCloseTo(100, 0);
  });
  it('ignores self-loops (no attraction to self, no NaN)', () => {
    const r = forceLayout(mk([['a', 0, 0], ['b', 40, 0]], [['a', 'a'], ['a', 'b']]));
    for (const p of r.values()) expect(Number.isFinite(p.x)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./layout`.

- [ ] **Step 3: Implement**

`src/core/layout.ts`:

```ts
import { KripkeStructure } from './kripke';

export interface Point { x: number; y: number; }

/**
 * Deterministic Fruchterman–Reingold force layout.
 * Seeds from current positions (coincident states get a deterministic nudge),
 * ignores self-loops, and preserves the original centroid. No randomness, so
 * identical input always yields identical output.
 */
export function forceLayout(model: KripkeStructure, iterations = 150, k = 120): Map<string, Point> {
  const states = model.states;
  const n = states.length;
  const pos = new Map<string, Point>();
  if (n === 0) return pos;

  const taken = new Set<string>();
  for (const s of states) {
    let x = s.x, y = s.y;
    while (taken.has(`${Math.round(x)},${Math.round(y)}`)) { x += 31; y += 17; }
    taken.add(`${Math.round(x)},${Math.round(y)}`);
    pos.set(s.id, { x, y });
  }
  if (n === 1) return pos;

  const edges = model.transitions.filter((t) => t.from !== t.to);
  const cx0 = states.reduce((a, s) => a + s.x, 0) / n;
  const cy0 = states.reduce((a, s) => a + s.y, 0) / n;

  let temp = k;
  for (let it = 0; it < iterations; it++) {
    const disp = new Map<string, Point>(states.map((s) => [s.id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pos.get(states[i].id)!, b = pos.get(states[j].id)!;
        let dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const f = (k * k) / d;
        dx /= d; dy /= d;
        const da = disp.get(states[i].id)!, db = disp.get(states[j].id)!;
        da.x += dx * f; da.y += dy * f;
        db.x -= dx * f; db.y -= dy * f;
      }
    }
    for (const t of edges) {
      const a = pos.get(t.from), b = pos.get(t.to);
      if (!a || !b) continue;
      let dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const f = (d * d) / k;
      dx /= d; dy /= d;
      const da = disp.get(t.from)!, db = disp.get(t.to)!;
      da.x -= dx * f; da.y -= dy * f;
      db.x += dx * f; db.y += dy * f;
    }
    for (const s of states) {
      const dp = disp.get(s.id)!;
      const d = Math.hypot(dp.x, dp.y) || 0.01;
      const step = Math.min(d, temp);
      const p = pos.get(s.id)!;
      pos.set(s.id, { x: p.x + (dp.x / d) * step, y: p.y + (dp.y / d) * step });
    }
    temp = Math.max(1, temp * 0.95);
  }

  const cx1 = [...pos.values()].reduce((a, p) => a + p.x, 0) / n;
  const cy1 = [...pos.values()].reduce((a, p) => a + p.y, 0) / n;
  for (const [id, p] of pos) pos.set(id, { x: p.x + (cx0 - cx1), y: p.y + (cy0 - cy1) });
  return pos;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (52 + 7 = 59). If the connected-pair distance test fails, tune only the test's tolerance is NOT allowed — instead check the force math against the code above (it is known-good).

- [ ] **Step 5: Commit**

```bash
git add src/core/layout.ts src/core/layout.test.ts
git commit -m "feat: deterministic force layout for auto-arranging Kripke graphs"
```

---

### Task 2: Snapshot history + useHistory hook

**Files:**
- Create: `src/ui/history.ts`, `src/ui/useHistory.ts`
- Test: `src/ui/history.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/ui/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { History, init, commit, replace, checkpoint, undo, redo } from './history';

describe('history', () => {
  it('commit pushes an entry; undo/redo walk the stack', () => {
    let h: History<number> = init(1);
    h = commit(h, 2);
    h = commit(h, 3);
    expect(h.present).toBe(3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h); // no-op at bottom
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = redo(h); // no-op at top
    expect(h.present).toBe(3);
  });
  it('commit clears the redo future', () => {
    let h = init(1);
    h = commit(h, 2);
    h = undo(h);
    h = commit(h, 9);
    expect(redo(h).present).toBe(9); // no future to redo into
    expect(h.future).toEqual([]);
  });
  it('replace mutates present without creating an entry', () => {
    let h = init(1);
    h = replace(h, 5);
    expect(h.present).toBe(5);
    expect(undo(h).present).toBe(5); // nothing to undo
  });
  it('checkpoint + replaces = one undo entry (drag coalescing)', () => {
    let h = init(1);
    h = checkpoint(h);
    h = replace(h, 2);
    h = replace(h, 3);
    h = replace(h, 4);
    expect(h.present).toBe(4);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(4);
  });
  it('caps the undo stack', () => {
    let h = init(0);
    for (let i = 1; i <= 150; i++) h = commit(h, i, 100);
    expect(h.past.length).toBe(100);
    expect(h.past[0]).toBe(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./history`.

- [ ] **Step 3: Implement**

`src/ui/history.ts`:

```ts
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export function init<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Record `next` as a new undoable step. */
export function commit<T>(h: History<T>, next: T, cap = 100): History<T> {
  return { past: [...h.past, h.present].slice(-cap), present: next, future: [] };
}

/** Update present WITHOUT creating an undo entry (transient drag frames). */
export function replace<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next };
}

/** Push the current present as an undo point; subsequent replace() calls all
 *  undo back to here in one step (drag coalescing). */
export function checkpoint<T>(h: History<T>, cap = 100): History<T> {
  return { past: [...h.past, h.present].slice(-cap), present: h.present, future: [] };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}
```

`src/ui/useHistory.ts`:

```ts
import { useCallback, useState } from 'react';
import { History, init, commit as commitH, replace as replaceH, checkpoint as checkpointH, undo as undoH, redo as redoH } from './history';

export function useHistory<T>(initial: T, cap = 100) {
  const [h, setH] = useState<History<T>>(() => init(initial));
  const commit = useCallback((v: T) => setH((s) => commitH(s, v, cap)), [cap]);
  const replace = useCallback((v: T) => setH((s) => replaceH(s, v)), []);
  const checkpoint = useCallback(() => setH((s) => checkpointH(s, cap)), [cap]);
  const undo = useCallback(() => setH((s) => undoH(s)), []);
  const redo = useCallback(() => setH((s) => redoH(s)), []);
  const reset = useCallback((v: T) => setH(init(v)), []);
  return {
    present: h.present,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    commit, replace, checkpoint, undo, redo, reset,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (59 + 5 = 64). Also `npx tsc --noEmit` clean (useHistory is not imported anywhere yet — that's fine).

- [ ] **Step 5: Commit**

```bash
git add src/ui/history.ts src/ui/history.test.ts src/ui/useHistory.ts
git commit -m "feat: snapshot history with drag coalescing + useHistory hook"
```

---

### Task 3: Canvas rewrite + transition selection wiring

**Files:**
- Modify: `src/ui/types.ts` (Selection variant)
- Rewrite: `src/ui/Canvas.tsx`
- Modify: `src/ui/Inspector.tsx` (transition pane, export RESERVED_NAMES, new prop)
- Modify: `src/ui/App.tsx` (wire new Canvas/Inspector props — still plain setModel; history lands in Task 4)
- Modify: `src/styles.css` (append styles)

- [ ] **Step 1: Extend Selection type**

In `src/ui/types.ts` replace the `Selection` type with:

```ts
export type Selection =
  | { kind: 'state'; id: string }
  | { kind: 'formula'; id: string }
  | { kind: 'transition'; from: string; to: string }
  | null;
```

- [ ] **Step 2: Append styles**

Append to `src/styles.css`:

```css
.ctx-menu { position: absolute; z-index: 10; background: #fff; border: 1px solid #ccc;
  border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 8px 10px; min-width: 150px; }
.ctx-menu label { display: block; padding: 2px 0; cursor: pointer; }
.ctx-menu input { width: 100%; margin-top: 6px; padding: 4px; font-family: ui-monospace, monospace; }
.rename-input { width: 100%; height: 100%; font-size: 13px; font-weight: 600; text-align: center;
  border: 1px solid #2b6cb0; border-radius: 4px; padding: 2px; box-sizing: border-box; }
```

- [ ] **Step 3: Export RESERVED_NAMES and add the transition pane in Inspector**

In `src/ui/Inspector.tsx`:
1. Change the existing `const RESERVED_NAMES = [...]` declaration to `export const RESERVED_NAMES = [...]` (keep its contents: `['true', 'false', 'A', 'E', 'U', 'AX', 'EX', 'AF', 'EF', 'AG', 'EG', 'AU', 'EU']`).
2. Add to `InspectorProps`:

```ts
  onDeleteTransition: (from: string, to: string) => void;
```

3. Destructure `onDeleteTransition` in the component and insert this branch BEFORE the `if (selection?.kind === 'state')` branch:

```tsx
  if (selection?.kind === 'transition') {
    const a = stateById(model, selection.from);
    const b = stateById(model, selection.to);
    return (
      <div>
        <div className="section-title">Transition</div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>
          {a?.name ?? selection.from} → {b?.name ?? selection.to}
        </div>
        <button onClick={() => onDeleteTransition(selection.from, selection.to)}>
          Delete transition
        </button>
        <div className="muted" style={{ marginTop: 6 }}>…or press Delete.</div>
      </div>
    );
  }
```

- [ ] **Step 4: Rewrite Canvas**

Replace `src/ui/Canvas.tsx` ENTIRELY with:

```tsx
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
```

- [ ] **Step 5: Wire App (temporary, pre-history)**

In `src/ui/App.tsx` (history arrives in Task 4 — this step only wires the new props with `setModel`):

1. Add a `selectTransition` helper next to `selectState`:

```tsx
  function selectTransition(t: { from: string; to: string } | null) {
    setSelection(t ? { kind: 'transition', from: t.from, to: t.to } : null);
  }

  function deleteTransition(from: string, to: string) {
    setModel((m) => ({
      ...m,
      transitions: m.transitions.filter((t) => !(t.from === from && t.to === to)),
    }));
    setSelection((sel) =>
      sel?.kind === 'transition' && sel.from === from && sel.to === to ? null : sel);
  }
```

2. In the keyboard effect, extend the Delete branch with a transition case (after the existing state case):

```tsx
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'transition') {
        deleteTransition(selection.from, selection.to);
      }
```

3. Update the `<Canvas … />` element to pass the new props:

```tsx
          <Canvas
            model={model}
            onChange={setModel}
            onPreview={setModel}
            onBeginEdit={() => {}}
            selectedStateId={selection?.kind === 'state' ? selection.id : null}
            selectedTransition={selection?.kind === 'transition'
              ? { from: selection.from, to: selection.to } : null}
            onSelectState={selectState}
            onSelectTransition={selectTransition}
            highlight={highlight}
            evidence={evidence}
            deadlocks={deadlocks}
          />
```

(`setModel` accepts a value OR an updater — Canvas passes values, deleteTransition uses the updater form; both compile.)

4. Pass `onDeleteTransition={deleteTransition}` to `<Inspector … />`.

- [ ] **Step 6: Verify**

Run: `npm test` (all pass — canvas has no unit tests; App smoke tests must still pass), `npx tsc --noEmit`, `npm run build`. Then `npm run dev` and manually verify: hover handle appears and draws transitions; center drag moves with 20px snapping (Alt disables); click edge selects it (blue) and Delete removes it; double-click renames inline; right-click opens the prop menu; N adds a state at the cursor; arrows nudge.

- [ ] **Step 7: Commit**

```bash
git add src/ui/types.ts src/ui/Canvas.tsx src/ui/Inspector.tsx src/ui/App.tsx src/styles.css
git commit -m "feat: connect-handle editing, transition selection, inline rename, prop menu, grid snap, keys"
```

---

### Task 4: History integration + auto-layout

**Files:**
- Replace: `src/ui/App.tsx`
- Modify: `src/ui/Header.tsx`

- [ ] **Step 1: Replace App.tsx entirely**

`src/ui/App.tsx` (full replacement — this swaps `useState(model)` for `useHistory`, adds undo/redo shortcuts and the auto-layout animation; everything else matches the Task 3 state of the file):

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { KripkeStructure, deadlockStates } from '../core/kripke';
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
  const [initial] = useState(() => loadSaved() ?? {
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

  const deadlocks = useMemo(() => new Set(deadlockStates(model)), [model]);

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

  function loadState(s: SavedState) {
    if (layoutAnim.current !== null) cancelAnimationFrame(layoutAnim.current);
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
    if (layoutAnim.current !== null) cancelAnimationFrame(layoutAnim.current);
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
        if (e.shiftKey) history.redo(); else history.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
        return;
      }
      if (e.key === 'Escape') setSelection(null);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection?.kind === 'state') {
          const id = selection.id;
          history.commit({
            states: model.states.filter((s) => s.id !== id),
            transitions: model.transitions.filter((tr) => tr.from !== id && tr.to !== id),
          });
          setSelection(null);
        } else if (selection?.kind === 'transition') {
          deleteTransition(selection.from, selection.to);
        }
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
        onUndo={history.undo}
        onRedo={history.redo}
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
```

NOTE: this replacement must preserve whatever prop names Inspector currently expects (`evidence` was added in the v1 final-fix round). Diff the current file first (`git diff HEAD -- src/ui/App.tsx` after writing) and reconcile: the ONLY intended changes vs Task 3's version are (a) useHistory replacing useState for model, (b) undo/redo keyboard + Header props, (c) autoLayout, (d) deleteTransition/delete-state now committing via history. If the current App has anything else (e.g. different memo deps), keep the current version's behavior.

- [ ] **Step 2: Update Header**

In `src/ui/Header.tsx`, extend `HeaderProps`:

```ts
interface HeaderProps {
  onLoadExample: (index: number) => void;
  onImport: (s: SavedState) => void;
  exportState: () => SavedState;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAutoLayout: () => void;
}
```

Destructure the new props and insert these buttons right after `<div className="spacer" />`:

```tsx
      <button onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">↩ Undo</button>
      <button onClick={onRedo} disabled={!canRedo} title="Ctrl+Shift+Z / Ctrl+Y">↪ Redo</button>
      <button onClick={onAutoLayout} title="Force-directed layout">Auto-layout</button>
```

- [ ] **Step 3: Verify**

Run: `npm test`, `npx tsc --noEmit`, `npm run build` — all clean. `npm run dev`: drag a state → ONE Ctrl+Z restores its pre-drag position; add/delete/rename/prop-toggle each undo singly; Undo/Redo buttons enable/disable correctly; Auto-layout animates and one undo restores previous positions; loading an example clears history (Undo disabled).

- [ ] **Step 4: Commit**

```bash
git add src/ui/App.tsx src/ui/Header.tsx
git commit -m "feat: undo/redo with drag coalescing, animated auto-layout"
```

---

### Task 5: Integration tests, README, final review

**Files:**
- Modify: `src/ui/App.test.tsx`, `README.md`

- [ ] **Step 1: Add integration tests**

Append to the describe block in `src/ui/App.test.tsx`:

```tsx
  it('deleting a selected state is undoable via Ctrl+Z', () => {
    render(<App />);
    // select state 'work' (at 160,140 in the default example): pointerdown on its
    // group + pointerup on the svg without movement = click-select
    const svg = document.querySelector('svg')!;
    fireEvent.pointerDown(screen.getByText('work'), { clientX: 160, clientY: 140, button: 0 });
    fireEvent.pointerUp(svg, { clientX: 160, clientY: 140 });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.queryByText('work')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(screen.getByText('work')).toBeTruthy();
  });

  it('clicking a transition selects it and Delete removes it', () => {
    render(<App />);
    const before = document.querySelectorAll('.edge-hit').length;
    expect(before).toBe(4); // reset example has 4 transitions
    fireEvent.pointerDown(document.querySelectorAll('.edge-hit')[1], { button: 0 });
    expect(screen.getByText('Transition')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(document.querySelectorAll('.edge-hit').length).toBe(3);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(document.querySelectorAll('.edge-hit').length).toBe(4);
  });

  it('N adds a state (undoable)', () => {
    render(<App />);
    const before = document.querySelectorAll('g[style] circle[r="28"]').length;
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(document.querySelectorAll('g[style] circle[r="28"]').length).toBe(before + 1);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(document.querySelectorAll('g[style] circle[r="28"]').length).toBe(before);
  });
```

If the `circle[r="28"]` selector proves brittle, count states via `screen.getAllByText(/^s\d+$|work|error|reset/)` or add `data-state-id={s.id}` back onto the state `<g>` and count `[data-state-id]` — report whichever adjustment you make. jsdom note: pointer-capture calls are optional-chained (`setPointerCapture?.`) so absence in jsdom is fine.

- [ ] **Step 2: Run tests**

Run: `npm test` — Expected: all pass (64 + 3 = 67, plus the 7 pre-existing App tests still green). `npx tsc --noEmit`, `npm run build` clean.

- [ ] **Step 3: Update README**

In `README.md`, replace the Canvas bullet under `## Use` with:

```markdown
- **Canvas:** click empty space (or press `N`) to add a state, drag a state to move it
  (20px grid snap — hold Alt to disable), drag the blue rim handle to another state
  (or itself) to add a transition, click a transition to select it, double-click a
  state to rename inline, right-click for propositions, Delete removes the selection,
  arrows nudge, mouse wheel zooms. Ctrl+Z / Ctrl+Shift+Z undo and redo; the
  Auto-layout button untangles the graph.
```

- [ ] **Step 4: Manual walkthrough**

`npm run dev` and verify each spec feature end-to-end (handle drawing incl. self-loop, drop-target glow, snap + Alt, inline rename commit/cancel, right-click menu incl. new prop validation, transition select/delete both via key and inspector button, undo/redo across all edit kinds + drag coalescing, auto-layout animation + single-undo, N/arrows, existing formula checking unaffected). Fix anything broken with small individual commits.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.test.tsx README.md
git commit -m "test: editor integration tests; docs: updated canvas usage"
```
