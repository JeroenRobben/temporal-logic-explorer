import type { Logic } from '../ui/types';

/**
 * Hole-tolerant formula tree for the visual builder. The parsers' ASTs
 * reject holes, so the builder owns this structure; `toText` pretty-prints
 * it (with `▢` for holes) into the composer draft, and the printed form of
 * any hole-free tree must reparse under the corresponding parser.
 */
export type HNode =
  | { kind: 'hole' }
  | { kind: 'prop'; name: string }
  | { kind: 'const'; value: boolean }
  | { kind: 'op'; op: OpId; children: HNode[] };

export type OpId =
  | 'not' | 'and' | 'or' | 'implies' | 'iff'
  | 'X' | 'F' | 'G' | 'U'                                   // LTL + CTL* path level
  | 'AX' | 'EX' | 'AF' | 'EF' | 'AG' | 'EG' | 'AU' | 'EU'   // CTL
  | 'A' | 'E';                                              // CTL* quantifiers

/** Child-index list addressing a node: [] = root, [0,1] = second child of first child. */
export type Path = number[];

export const ARITY: Record<OpId, 1 | 2> = {
  not: 1, and: 2, or: 2, implies: 2, iff: 2,
  X: 1, F: 1, G: 1, U: 2,
  AX: 1, EX: 1, AF: 1, EF: 1, AG: 1, EG: 1, AU: 2, EU: 2,
  A: 1, E: 1,
};

/** Node at `path`, or null when the path does not address a node. */
export function nodeAt(tree: HNode, path: Path): HNode | null {
  let cur: HNode = tree;
  for (const i of path) {
    if (cur.kind !== 'op' || i < 0 || i >= cur.children.length) return null;
    cur = cur.children[i];
  }
  return cur;
}

/**
 * Replace the node at `path` with `node` (immutably, sharing untouched
 * subtrees). Invalid path → the SAME tree reference.
 */
export function replaceAt(tree: HNode, path: Path, node: HNode): HNode {
  if (path.length === 0) return node;
  if (nodeAt(tree, path) === null) return tree;
  return rebuild(tree, path, node);
}

function rebuild(tree: HNode, path: Path, node: HNode): HNode {
  if (path.length === 0) return node;
  const t = tree as Extract<HNode, { kind: 'op' }>; // path validated by caller
  const i = path[0];
  const children = t.children.slice();
  children[i] = rebuild(children[i], path.slice(1), node);
  return { kind: 'op', op: t.op, children };
}

/**
 * Wrap the node at `path` in `op`: it becomes the first child, remaining
 * children are holes. Invalid path → the SAME tree reference.
 */
export function wrapAt(tree: HNode, path: Path, op: OpId): HNode {
  const target = nodeAt(tree, path);
  if (target === null) return tree;
  const children: HNode[] = [target];
  for (let k = 1; k < ARITY[op]; k++) children.push({ kind: 'hole' });
  return replaceAt(tree, path, { kind: 'op', op, children });
}

/**
 * Collapse the node at `path` back to a hole (root included).
 * Invalid path → the SAME tree reference.
 */
export function deleteAt(tree: HNode, path: Path): HNode {
  if (nodeAt(tree, path) === null) return tree;
  return replaceAt(tree, path, { kind: 'hole' });
}

/** Paths of all holes, in left-to-right (pre-order) order. */
export function holes(tree: HNode): Path[] {
  const out: Path[] = [];
  (function walk(n: HNode, path: Path): void {
    if (n.kind === 'hole') { out.push(path); return; }
    if (n.kind === 'op') n.children.forEach((c, i) => walk(c, [...path, i]));
  })(tree, []);
  return out;
}

export function isComplete(tree: HNode): boolean {
  return holes(tree).length === 0;
}

const HOLE_GLYPH = '▢';

const BINARY_SYMBOL: Partial<Record<OpId, string>> = {
  and: '&', or: '|', implies: '->', iff: '<->',
};

/**
 * Pretty-print with `▢` for holes, in snippet-template style: binary ops
 * always parenthesized (`(x & y)`, `(x U y)`), CTL untils bracketed
 * (`A[x U y]`), CTL* quantifiers always `A (x)` / `E (x)`, and any non-leaf
 * child of another unary op wrapped in parens unless its printed form is
 * already parenthesized (`AG (p -> q)` not `AG ((p -> q))`). Output is not
 * minimal — it must merely reparse correctly for hole-free trees.
 *
 * The `logic` parameter fixes which parser the text targets; op templates
 * are disjoint across logics, so it is currently informational.
 */
export function toText(tree: HNode, _logic: Logic): string {
  return render(tree);
}

function render(n: HNode): string {
  switch (n.kind) {
    case 'hole': return HOLE_GLYPH;
    case 'prop': return n.name;
    case 'const': return n.value ? 'true' : 'false';
    case 'op': {
      const ts = n.children.map(render);
      switch (n.op) {
        case 'and': case 'or': case 'implies': case 'iff':
          return `(${ts[0]} ${BINARY_SYMBOL[n.op]} ${ts[1]})`;
        case 'U':
          return `(${ts[0]} U ${ts[1]})`;
        case 'AU': return `A[${ts[0]} U ${ts[1]}]`;
        case 'EU': return `E[${ts[0]} U ${ts[1]}]`;
        case 'A': case 'E':
          return `${n.op} (${ts[0]})`;
        default: {
          // Unary: not, X/F/G, AX/EX/AF/EF/AG/EG.
          const label = n.op === 'not' ? '!' : n.op;
          const child = n.children[0];
          const t = child.kind === 'op' && !ts[0].startsWith('(') ? `(${ts[0]})` : ts[0];
          return `${label} ${t}`;
        }
      }
    }
  }
}
