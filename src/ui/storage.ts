import { KripkeStructure } from '../core/kripke';
import { FormulaEntry, PendingLasso } from './types';

const KEY = 'temporal-logic-explorer-v1';

export interface SavedState {
  model: KripkeStructure;
  formulas: FormulaEntry[];
  trace?: PendingLasso | null;
}

export function loadSaved(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!validateSavedState(parsed)) return null;
    return normalizeSavedState(parsed);
  } catch {
    return null;
  }
}

export function save(state: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full/unavailable — persistence is best-effort
  }
}

/** Input to normalizeSavedState: formulas may be v1 data with no `logic` tag yet. */
type SavedStateInput = SavedState & { formulas: (FormulaEntry & { logic?: FormulaEntry['logic'] })[] };

/**
 * Drop duplicate transitions (same from/to); keeps first occurrence.
 * Also defaults missing `logic` (v1 saves/imports) to 'ctl' — the single
 * place both loadSaved and Header's import flow route through.
 */
export function normalizeSavedState(s: SavedStateInput): SavedState {
  const seen = new Set<string>();
  const transitions = s.model.transitions.filter((t) => {
    const key = `${t.from}->${t.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const formulas = s.formulas.map((f) => ({ ...f, logic: f.logic ?? 'ctl' as const }));
  return { ...s, model: { ...s.model, transitions }, formulas };
}

export function validateSavedState(x: unknown): x is SavedState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const m = o.model as Record<string, unknown> | undefined;
  if (!m || !Array.isArray(m.states) || !Array.isArray(m.transitions)) return false;
  if (!m.states.every((s: unknown) => {
    if (typeof s !== 'object' || s === null) return false;
    const st = s as Record<string, unknown>;
    return typeof st.id === 'string' && typeof st.name === 'string'
      && Array.isArray(st.propositions) && st.propositions.every((p: unknown) => typeof p === 'string')
      && typeof st.isInitial === 'boolean'
      && typeof st.x === 'number' && typeof st.y === 'number';
  })) return false;
  const stateIds = new Set((m.states as { id: string }[]).map((s) => s.id));
  if (!m.transitions.every((t: unknown) => {
    if (typeof t !== 'object' || t === null) return false;
    const tr = t as Record<string, unknown>;
    return typeof tr.from === 'string' && typeof tr.to === 'string'
      && stateIds.has(tr.from) && stateIds.has(tr.to);
  })) return false;
  if (!Array.isArray(o.formulas)) return false;
  if (!(o.formulas as unknown[]).every((f) => {
    if (typeof f !== 'object' || f === null) return false;
    const fe = f as Record<string, unknown>;
    return typeof fe.id === 'string' && typeof fe.text === 'string'
      && (fe.logic === undefined || fe.logic === 'ctl' || fe.logic === 'ltl' || fe.logic === 'ctlstar');
  })) return false;
  if (o.trace !== undefined && o.trace !== null) {
    const tr = o.trace as Record<string, unknown>;
    if (!Array.isArray(tr.stateIds) || !tr.stateIds.every((s: unknown) => typeof s === 'string')) return false;
    if (tr.loopIndex !== null && (typeof tr.loopIndex !== 'number'
      || !Number.isInteger(tr.loopIndex) || tr.loopIndex < 0
      || tr.loopIndex >= tr.stateIds.length)) return false;
  }
  return true;
}
