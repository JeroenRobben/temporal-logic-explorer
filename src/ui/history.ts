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
