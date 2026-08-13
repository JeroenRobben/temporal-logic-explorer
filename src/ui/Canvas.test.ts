import { describe, it, expect } from 'vitest';
import { edgePath, R, EdgeEndpoint } from './Canvas';

// Deterministic seeded PRNG (mulberry32) so the property test is reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomEndpoints(rand: () => number): [EdgeEndpoint, EdgeEndpoint] {
  let a: EdgeEndpoint, b: EdgeEndpoint;
  do {
    a = { id: 'a', x: rand() * 500, y: rand() * 500 };
    b = { id: 'b', x: rand() * 500, y: rand() * 500 };
  } while (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
  return [a, b];
}

function parseLine(d: string): { sx: number; sy: number; ex: number; ey: number } {
  const m = d.match(/^M ([-\d.]+) ([-\d.]+) L ([-\d.]+) ([-\d.]+)$/);
  if (!m) throw new Error(`unexpected path: ${d}`);
  const [, sx, sy, ex, ey] = m;
  return { sx: Number(sx), sy: Number(sy), ex: Number(ex), ey: Number(ey) };
}

function parseQuad(d: string): { sx: number; sy: number; mx: number; my: number; ex: number; ey: number } {
  const m = d.match(/^M ([-\d.]+) ([-\d.]+) Q ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)$/);
  if (!m) throw new Error(`unexpected path: ${d}`);
  const [, sx, sy, mx, my, ex, ey] = m;
  return { sx: Number(sx), sy: Number(sy), mx: Number(mx), my: Number(my), ex: Number(ex), ey: Number(ey) };
}

describe('edgePath', () => {
  const rand = mulberry32(42);
  const pairs: [EdgeEndpoint, EdgeEndpoint][] = Array.from({ length: 100 }, () => randomEndpoints(rand));

  it('straight case: endpoints sit exactly R from each node rim, in the a→b direction', () => {
    for (const [a, b] of pairs) {
      const { sx, sy, ex, ey } = parseLine(edgePath(a, b, false));
      expect(Math.hypot(sx - a.x, sy - a.y)).toBeCloseTo(R, 6);
      expect(Math.hypot(ex - b.x, ey - b.y)).toBeCloseTo(R, 6);

      // colinear with a->b, and in the same direction (not reversed)
      const abx = b.x - a.x, aby = b.y - a.y;
      const asx = sx - a.x, asy = sy - a.y;
      const cross = abx * asy - aby * asx;
      expect(cross).toBeCloseTo(0, 6);
      expect(abx * asx + aby * asy).toBeGreaterThan(0);

      const bex = ex - b.x, bey = ey - b.y;
      const cross2 = abx * bey - aby * bex;
      expect(cross2).toBeCloseTo(0, 6);
      // the end point is R back *toward* a, i.e. opposite direction from b
      expect(abx * bex + aby * bey).toBeLessThan(0);
    }
  });

  it('curved case: same rim distances, and the Q control point is offset perpendicular to a→b', () => {
    for (const [a, b] of pairs) {
      const { sx, sy, mx, my, ex, ey } = parseQuad(edgePath(a, b, true));
      expect(Math.hypot(sx - a.x, sy - a.y)).toBeCloseTo(R, 6);
      expect(Math.hypot(ex - b.x, ey - b.y)).toBeCloseTo(R, 6);

      const midx = (sx + ex) / 2, midy = (sy + ey) / 2;
      const abx = b.x - a.x, aby = b.y - a.y;
      const dot = (mx - midx) * abx + (my - midy) * aby;
      expect(dot).toBeCloseTo(0, 6);
    }
  });

  it('self-loop: both ends stay near the node rim and the path curves via C', () => {
    for (let i = 0; i < 20; i++) {
      const a: EdgeEndpoint = { id: 'a', x: (i * 37) % 500, y: (i * 53) % 500 };
      const d = edgePath(a, a, false);
      expect(d).toContain('C');
      const m = d.match(/^M ([-\d.]+) ([-\d.]+) C ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+), ([-\d.]+) ([-\d.]+)$/);
      expect(m).not.toBeNull();
      const [, sx, sy, , , , , ex, ey] = m!;
      expect(Math.hypot(Number(sx) - a.x, Number(sy) - a.y)).toBeLessThanOrEqual(R + 2);
      expect(Math.hypot(Number(ex) - a.x, Number(ey) - a.y)).toBeLessThanOrEqual(R + 2);
    }
  });
});
