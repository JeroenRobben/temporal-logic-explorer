import { ReferenceDoc, Tutorial } from '../types';
import { BOOL_REFS, TUT_BOOLEANS } from './booleans';
import { CTL_REFS, CTL_TUTS } from './ctl';
import { LTL_REFS, LTL_TUTS } from './ltl';
import { STAR_REFS, STAR_TUTS } from './ctlstar';

export const REFERENCES: ReferenceDoc[] = [...BOOL_REFS, ...CTL_REFS, ...LTL_REFS, ...STAR_REFS];
export const TUTORIALS: Tutorial[] = [TUT_BOOLEANS, ...CTL_TUTS, ...LTL_TUTS, ...STAR_TUTS];

export function referenceById(id: string): ReferenceDoc | undefined {
  return REFERENCES.find((r) => r.id === id);
}

/** Composer palette label → reference id (extended by Tasks 8–10 as content lands). */
export const REF_BY_PALETTE: Record<string, string> = {
  '∧': 'bool-and', '∨': 'bool-or', '¬': 'bool-not', '→': 'bool-implies', '↔': 'bool-iff',
  'EF': 'ctl-EF', 'AG': 'ctl-AG', 'AF': 'ctl-AF', 'EG': 'ctl-EG', 'AX': 'ctl-AX', 'EX': 'ctl-EX',
  'A[▢U▢]': 'ctl-AU', 'E[▢U▢]': 'ctl-EU',
  'G': 'ltl-G', 'F': 'ltl-F', 'X': 'ltl-X', '▢U▢': 'ltl-U',
  'A': 'star-A', 'E': 'star-E',
};

/** Inspector node kind → reference id, per logic (extended by Tasks 8–10). */
export function refIdForNode(logic: string, kind: string): string | null {
  const shared: Record<string, string> = { and: 'bool-and', or: 'bool-or', not: 'bool-not', implies: 'bool-implies', iff: 'bool-iff' };
  if (shared[kind]) return shared[kind];
  if (logic === 'ctl' && ['EF', 'AX', 'EX', 'AF', 'AG', 'EG', 'AU', 'EU'].includes(kind)) return `ctl-${kind}`;
  if (logic === 'ltl' && (kind === 'X' || kind === 'F' || kind === 'G' || kind === 'U')) return `ltl-${kind}`;
  if (logic === 'ctlstar') {
    if (kind === 'A' || kind === 'E') return `star-${kind}`;
    // CTL* temporal path operators share LTL path semantics — reuse the ltl-* docs.
    if (kind === 'X' || kind === 'F' || kind === 'G' || kind === 'U') return `ltl-${kind}`;
  }
  return null;
}
