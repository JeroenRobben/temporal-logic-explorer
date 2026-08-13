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
  it('keeps isolated states within the layout radius bound', () => {
    const m = mk(
      [['a', 0, 0], ['b', 120, 0], ['c', 60, 100], ['lone', 30, 30]],
      [['a', 'b'], ['b', 'c'], ['c', 'a']],
    );
    const r = forceLayout(m);
    const cx = ([...r.values()].reduce((s, p) => s + p.x, 0)) / 4;
    const cy = ([...r.values()].reduce((s, p) => s + p.y, 0)) / 4;
    const bound = 120 * (1 + Math.sqrt(4)) + 1;
    for (const p of r.values()) expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThan(bound);
  });
  it('bounds spread even with many isolated states', () => {
    const m = mk(
      [['a', 0, 0], ['b', 120, 0], ['c', 60, 100],
       ['l1', 10, 10], ['l2', 20, 20], ['l3', 30, 30], ['l4', 40, 40], ['l5', 50, 50]],
      [['a', 'b'], ['b', 'c'], ['c', 'a']],
    );
    const r = forceLayout(m);
    const cx = ([...r.values()].reduce((s, p) => s + p.x, 0)) / 8;
    const cy = ([...r.values()].reduce((s, p) => s + p.y, 0)) / 8;
    const bound = 120 * (1 + Math.sqrt(8)) + 1;
    for (const p of r.values()) expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThan(bound);
  });

  describe('property: seeded random graphs', () => {
    // Deterministic seeded PRNG (mulberry32) for reproducible fuzzing.
    function mulberry32(seed: number): () => number {
      let a = seed;
      return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function randomModel(rand: () => number): KripkeStructure {
      const n = 5 + Math.floor(rand() * 5); // 5..9
      const ids = Array.from({ length: n }, (_, i) => `s${i}`);
      const states: [string, number, number][] = ids.map((id) => [id, rand() * 300, rand() * 300]);
      const transitions: [string, string][] = [];
      for (const from of ids) {
        // leave roughly a third of states isolated
        if (rand() < 0.3) continue;
        const edgeCount = 1 + Math.floor(rand() * 3);
        for (let e = 0; e < edgeCount; e++) {
          const toIsSelf = rand() < 0.25;
          const to = toIsSelf ? from : ids[Math.floor(rand() * n)];
          transitions.push([from, to]);
        }
      }
      return mk(states, transitions);
    }

    const rand = mulberry32(1234);
    const models = Array.from({ length: 20 }, () => randomModel(rand));

    it('is deterministic across repeated runs', () => {
      for (const m of models) {
        const r1 = forceLayout(m);
        const r2 = forceLayout(m);
        expect([...r1.entries()]).toEqual([...r2.entries()]);
      }
    });

    it('bounds every state within k*(1+sqrt(n))+1 of the centroid', () => {
      for (const m of models) {
        const n = m.states.length;
        const r = forceLayout(m);
        const cx = [...r.values()].reduce((a, p) => a + p.x, 0) / n;
        const cy = [...r.values()].reduce((a, p) => a + p.y, 0) / n;
        const bound = 120 * (1 + Math.sqrt(n)) + 1;
        for (const p of r.values()) {
          expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThanOrEqual(bound);
        }
      }
    });
  });
});
