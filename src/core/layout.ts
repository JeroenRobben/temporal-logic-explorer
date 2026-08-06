import { KripkeStructure } from './kripke';

export interface Point { x: number; y: number; }

const GRAVITY = 0.15;

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
    const gx = [...pos.values()].reduce((a, p) => a + p.x, 0) / n;
    const gy = [...pos.values()].reduce((a, p) => a + p.y, 0) / n;
    for (const s of states) {
      const p = pos.get(s.id)!;
      const dp = disp.get(s.id)!;
      dp.x += (gx - p.x) * GRAVITY;
      dp.y += (gy - p.y) * GRAVITY;
    }
    for (const s of states) {
      const dp = disp.get(s.id)!;
      const d = Math.hypot(dp.x, dp.y) || 0.01;
      const step = Math.min(d, temp);
      const p = pos.get(s.id)!;
      pos.set(s.id, { x: p.x + (dp.x / d) * step, y: p.y + (dp.y / d) * step });
    }
    const R_MAX = k * (1 + Math.sqrt(n)); // repulsion-independent hard bound on spread
    const ccx = [...pos.values()].reduce((a, p) => a + p.x, 0) / n;
    const ccy = [...pos.values()].reduce((a, p) => a + p.y, 0) / n;
    for (const [id, p] of pos) {
      const dx = p.x - ccx, dy = p.y - ccy;
      const d = Math.hypot(dx, dy);
      if (d > R_MAX) pos.set(id, { x: ccx + (dx / d) * R_MAX, y: ccy + (dy / d) * R_MAX });
    }
    temp = Math.max(1, temp * 0.95);
  }

  const cx1 = [...pos.values()].reduce((a, p) => a + p.x, 0) / n;
  const cy1 = [...pos.values()].reduce((a, p) => a + p.y, 0) / n;
  for (const [id, p] of pos) pos.set(id, { x: p.x + (cx0 - cx1), y: p.y + (cy0 - cy1) });
  return pos;
}
