import type { Logic } from '../ui/types';
import type { HNode, OpId, Path } from './htree';

/** What the palette offers at one hole position. */
export interface PaletteOptions {
  ops: OpId[];
  props: boolean;
  consts: boolean;
}

const BOOLEANS: OpId[] = ['not', 'and', 'or', 'implies', 'iff'];
const TEMPORALS: OpId[] = ['X', 'F', 'G', 'U'];
const CTL_PAIRS: OpId[] = ['AX', 'EX', 'AF', 'EF', 'AG', 'EG', 'AU', 'EU'];
const QUANTIFIERS: OpId[] = ['A', 'E'];

/**
 * Ops legal at a position, given whether that position is path-level.
 * CTL/LTL ignore the level; CTL* mirrors `ctlstar-parser`'s classification:
 * state level (root, and inside pure-boolean context outside quantifiers)
 * excludes bare temporals — they would make the root path-level, which
 * `parseCTLStar` rejects. This is the single encoding of the level rule;
 * the round-trip generator reuses it.
 */
export function legalOps(logic: Logic, pathLevel: boolean): OpId[] {
  if (logic === 'ctl') return [...BOOLEANS, ...CTL_PAIRS];
  if (logic === 'ltl') return [...BOOLEANS, ...TEMPORALS];
  return pathLevel
    ? [...BOOLEANS, ...TEMPORALS, ...QUANTIFIERS]
    : [...BOOLEANS, ...QUANTIFIERS];
}

/**
 * A position is path-level iff it sits strictly inside an `A`/`E` subtree
 * (any depth: temporals and booleans below a quantifier stay path-level,
 * and a nested quantifier's child is path-level again). Booleans above any
 * quantifier preserve state level.
 */
export function isPathLevel(tree: HNode, path: Path): boolean {
  let cur: HNode = tree;
  for (const i of path) {
    if (cur.kind !== 'op' || i < 0 || i >= cur.children.length) return false;
    if (cur.op === 'A' || cur.op === 'E') return true;
    cur = cur.children[i];
  }
  return false;
}

/** Palette for the hole at `path` in `tree`. Props and consts are always legal. */
export function optionsFor(logic: Logic, tree: HNode, path: Path): PaletteOptions {
  const pathLevel = logic === 'ctlstar' && isPathLevel(tree, path);
  return { ops: legalOps(logic, pathLevel), props: true, consts: true };
}
