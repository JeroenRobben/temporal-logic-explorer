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
});
