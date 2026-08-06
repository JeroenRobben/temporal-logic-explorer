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
