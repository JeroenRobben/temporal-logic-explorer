import { describe, it, expect } from 'vitest';
import { ProductGraph } from './product';
import { findAcceptingLasso } from './emptiness';

function g(states: [string, boolean, boolean][], edges: [string, string][]): ProductGraph {
  return {
    states: states.map(([id, accepting, initial]) => ({
      id, modelStateId: id, buchiStateId: 0, accepting, initial,
    })),
    edges: edges.map(([from, to]) => ({ from, to })),
  };
}

describe('findAcceptingLasso', () => {
  it('finds an accepting self-loop', () => {
    const r = findAcceptingLasso(g(
      [['i', false, true], ['x', true, false]],
      [['i', 'x'], ['x', 'x']],
    ))!;
    expect(r.path).toEqual(['i', 'x']);
    expect(r.loopIndex).toBe(1);
  });
  it('finds a multi-state accepting cycle', () => {
    const r = findAcceptingLasso(g(
      [['i', false, true], ['x', true, false], ['y', false, false]],
      [['i', 'x'], ['x', 'y'], ['y', 'x']],
    ))!;
    expect(r.loopIndex).toBe(1);
    expect(r.path[r.loopIndex]).toBe('x');
    expect(r.path).toEqual(['i', 'x', 'y']);
  });
  it('returns null when no accepting state lies on a cycle', () => {
    expect(findAcceptingLasso(g(
      [['i', false, true], ['x', true, false], ['y', false, false]],
      [['i', 'x'], ['x', 'y'], ['y', 'y']], // cycle exists but only through non-accepting y
    ))).toBe(null);
  });
  it('returns null for an accepting state without a self-loop or cycle', () => {
    expect(findAcceptingLasso(g(
      [['i', true, true], ['x', false, false]],
      [['i', 'x']],
    ))).toBe(null);
  });
  it('ignores accepting cycles unreachable from the initial states', () => {
    expect(findAcceptingLasso(g(
      [['i', false, true], ['x', true, false]],
      [['x', 'x']], // accepting loop, but i cannot reach it
    ))).toBe(null);
  });
  it('handles an empty product', () => {
    expect(findAcceptingLasso({ states: [], edges: [] })).toBe(null);
  });
  it('does not overflow the stack on a 10000-state linear chain (iterative Tarjan)', () => {
    const n = 10000;
    const states: [string, boolean, boolean][] = Array.from({ length: n }, (_, i) => [
      `s${i}`, i === n - 1, i === 0,
    ]);
    const edges: [string, string][] = Array.from({ length: n }, (_, i) => [`s${i}`, `s${(i + 1) % n}`]);
    const r = findAcceptingLasso(g(states, edges));
    expect(r).not.toBeNull();
  });
});
