import { KripkeStructure, stateById } from './kripke';

/** A lasso trace: positions 0..n-1; the successor of position n-1 is loopIndex. */
export interface Lasso {
  stateIds: string[];
  loopIndex: number;
}

function hasTransition(k: KripkeStructure, from: string, to: string): boolean {
  return k.transitions.some((t) => t.from === from && t.to === to);
}

/** Null if valid, otherwise a human-readable problem description. */
export function validateLasso(k: KripkeStructure, lasso: Lasso): string | null {
  if (lasso.stateIds.length === 0) return 'trace is empty';
  if (!Number.isInteger(lasso.loopIndex)
    || lasso.loopIndex < 0 || lasso.loopIndex >= lasso.stateIds.length) {
    return 'loop index out of range';
  }
  const prefixError = validatePrefix(k, lasso.stateIds);
  if (prefixError) return prefixError;
  const last = lasso.stateIds[lasso.stateIds.length - 1];
  const loopTarget = lasso.stateIds[lasso.loopIndex];
  if (!hasTransition(k, last, loopTarget)) {
    return `no loop-back transition ${last} → ${loopTarget}`;
  }
  return null;
}

/** Validates a (possibly incomplete) walk: states exist, consecutive pairs are transitions. */
export function validatePrefix(k: KripkeStructure, stateIds: string[]): string | null {
  for (const id of stateIds) {
    if (!stateById(k, id)) return `state ${id} is not in the model`;
  }
  for (let i = 0; i + 1 < stateIds.length; i++) {
    if (!hasTransition(k, stateIds[i], stateIds[i + 1])) {
      return `no transition ${stateIds[i]} → ${stateIds[i + 1]}`;
    }
  }
  return null;
}

export function nextPosition(lasso: Lasso, i: number): number {
  return i + 1 < lasso.stateIds.length ? i + 1 : lasso.loopIndex;
}

export function propsAt(k: KripkeStructure, lasso: Lasso, i: number): string[] {
  return stateById(k, lasso.stateIds[i])?.propositions ?? [];
}
