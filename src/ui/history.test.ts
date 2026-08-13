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
  it('replace clears the redo future (undo → replace → redo is a no-op)', () => {
    let h = init(1);
    h = commit(h, 2);
    h = undo(h);
    h = replace(h, 7);
    expect(h.present).toBe(7);
    expect(redo(h).present).toBe(7); // stale future was discarded
  });

  it('matches a naive array-based reference over 1000 random ops (seeded)', () => {
    // mulberry32 PRNG for deterministic, reproducible runs.
    function mulberry32(seed: number) {
      let a = seed;
      return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rand = mulberry32(42);
    const CAP = 5;

    // Naive reference implementing the doc-comment semantics with plain arrays.
    interface Naive { past: number[]; present: number; future: number[] }
    function naiveInit(present: number): Naive { return { past: [], present, future: [] }; }
    function naiveCommit(h: Naive, next: number): Naive {
      const past = [...h.past, h.present];
      while (past.length > CAP) past.shift();
      return { past, present: next, future: [] };
    }
    function naiveReplace(h: Naive, next: number): Naive {
      return { past: h.past, present: next, future: [] };
    }
    function naiveCheckpoint(h: Naive): Naive {
      const past = [...h.past, h.present];
      while (past.length > CAP) past.shift();
      return { past, present: h.present, future: [] };
    }
    function naiveUndo(h: Naive): Naive {
      if (h.past.length === 0) return h;
      const past = h.past.slice();
      const present = past.pop() as number;
      return { past, present, future: [h.present, ...h.future] };
    }
    function naiveRedo(h: Naive): Naive {
      if (h.future.length === 0) return h;
      const future = h.future.slice();
      const present = future.shift() as number;
      return { past: [...h.past, h.present], present, future };
    }

    let real: History<number> = init(0);
    let naive: Naive = naiveInit(0);

    for (let i = 0; i < 1000; i++) {
      const op = Math.floor(rand() * 5);
      const value = Math.floor(rand() * 100);
      switch (op) {
        case 0:
          real = commit(real, value, CAP);
          naive = naiveCommit(naive, value);
          break;
        case 1:
          real = replace(real, value);
          naive = naiveReplace(naive, value);
          break;
        case 2:
          real = checkpoint(real, CAP);
          naive = naiveCheckpoint(naive);
          break;
        case 3:
          real = undo(real);
          naive = naiveUndo(naive);
          break;
        default:
          real = redo(real);
          naive = naiveRedo(naive);
          break;
      }
      expect(real.present).toBe(naive.present);
      expect(real.past).toEqual(naive.past);
      expect(real.future).toEqual(naive.future);
    }
  });
});
