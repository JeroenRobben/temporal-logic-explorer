import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHistory } from './useHistory';

describe('useHistory', () => {
  it('keeps callbacks referentially stable across renders', () => {
    const { result, rerender } = renderHook(() => useHistory<number>(1));
    const first = { commit: result.current.commit, replace: result.current.replace,
      checkpoint: result.current.checkpoint, undo: result.current.undo, redo: result.current.redo };
    act(() => result.current.commit(2));
    rerender();
    expect(result.current.present).toBe(2);
    expect(result.current.commit).toBe(first.commit);
    expect(result.current.replace).toBe(first.replace);
    expect(result.current.checkpoint).toBe(first.checkpoint);
    expect(result.current.undo).toBe(first.undo);
    expect(result.current.redo).toBe(first.redo);
  });
});
