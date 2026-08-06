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
