import { ReferenceDoc, Tutorial } from '../types';
import { BOOL_REFS, TUT_BOOLEANS } from './booleans';
import { CTL_REFS, CTL_TUTS } from './ctl';

export const REFERENCES: ReferenceDoc[] = [...BOOL_REFS, ...CTL_REFS];
export const TUTORIALS: Tutorial[] = [TUT_BOOLEANS, ...CTL_TUTS];

export function referenceById(id: string): ReferenceDoc | undefined {
  return REFERENCES.find((r) => r.id === id);
}

/** Composer palette label → reference id (extended by Tasks 8–10 as content lands). */
export const REF_BY_PALETTE: Record<string, string> = {
  '∧': 'bool-and', '∨': 'bool-or', '¬': 'bool-not', '→': 'bool-implies', '↔': 'bool-iff',
  'EF': 'ctl-EF',
};

/** Inspector node kind → reference id, per logic (extended by Tasks 8–10). */
export function refIdForNode(logic: string, kind: string): string | null {
  const shared: Record<string, string> = { and: 'bool-and', or: 'bool-or', not: 'bool-not', implies: 'bool-implies', iff: 'bool-iff' };
  if (shared[kind]) return shared[kind];
  if (logic === 'ctl' && kind === 'EF') return 'ctl-EF';
  return null;
}
