import { describe, it, expect } from 'vitest';
import { ARITY, HNode, OpId, Path, deleteAt, holes, replaceAt, toText, wrapAt } from './htree';
import { optionsFor } from './catalog';
import { parseCTLStar, classify } from '../core/ctlstar-parser';

const hole: HNode = { kind: 'hole' };
const prop = (name: string): HNode => ({ kind: 'prop', name });
const op = (o: OpId, ...children: HNode[]): HNode => ({ kind: 'op', op: o, children });

const BOOLEANS: OpId[] = ['not', 'and', 'or', 'implies', 'iff'];
const TEMPORALS: OpId[] = ['X', 'F', 'G', 'U'];
const CTL_PAIRS: OpId[] = ['AX', 'EX', 'AF', 'EF', 'AG', 'EG', 'AU', 'EU'];

describe('optionsFor: CTL and LTL are position-independent', () => {
  const trees: [string, HNode, Path][] = [
    ['bare hole root', hole, []],
    ['under unary', op('not', hole), [0]],
    ['right of binary', op('and', prop('p'), hole), [1]],
    ['nested', op('implies', hole, op('not', hole)), [1, 0]],
  ];

  it('CTL: booleans + all eight pairs everywhere; props+consts', () => {
    for (const [label, tree, path] of trees) {
      const o = optionsFor('ctl', tree, path);
      expect(o.ops, label).toEqual(expect.arrayContaining([...BOOLEANS, ...CTL_PAIRS]));
      expect(o.ops, label).toHaveLength(BOOLEANS.length + CTL_PAIRS.length);
      expect(o.props, label).toBe(true);
      expect(o.consts, label).toBe(true);
    }
  });

  it('LTL: booleans + X F G U everywhere; props+consts', () => {
    for (const [label, tree, path] of trees) {
      const o = optionsFor('ltl', tree, path);
      expect(o.ops, label).toEqual(expect.arrayContaining([...BOOLEANS, ...TEMPORALS]));
      expect(o.ops, label).toHaveLength(BOOLEANS.length + TEMPORALS.length);
      expect(o.props, label).toBe(true);
      expect(o.consts, label).toBe(true);
    }
  });
});

describe('optionsFor: CTL* is level-sensitive', () => {
  it('state level at the root: booleans + A/E, NO bare temporals', () => {
    const o = optionsFor('ctlstar', hole, []);
    expect(o.ops).toEqual(expect.arrayContaining([...BOOLEANS, 'A', 'E']));
    for (const t of TEMPORALS) expect(o.ops).not.toContain(t);
    expect(o.props).toBe(true);
    expect(o.consts).toBe(true);
  });

  it('inside an A subtree: temporals and nested A/E offered', () => {
    const o = optionsFor('ctlstar', op('A', hole), [0]);
    expect(o.ops).toEqual(expect.arrayContaining([...BOOLEANS, ...TEMPORALS, 'A', 'E']));
  });

  it('deeper inside a quantifier (through temporals/booleans) stays path level', () => {
    const tree = op('A', op('G', op('implies', prop('p'), hole)));
    const o = optionsFor('ctlstar', tree, [0, 0, 1]);
    expect(o.ops).toEqual(expect.arrayContaining(TEMPORALS));
  });

  it('booleans at state level preserve state level: (▢ & ▢) root', () => {
    const tree = op('and', hole, hole);
    for (const path of [[0], [1]] as Path[]) {
      const o = optionsFor('ctlstar', tree, path);
      for (const t of TEMPORALS) expect(o.ops, `path ${path}`).not.toContain(t);
      expect(o.ops, `path ${path}`).toEqual(expect.arrayContaining(['A', 'E']));
    }
  });

  it('nested state-level booleans stay state level: ! ((▢ | ▢) -> ▢)', () => {
    const tree = op('not', op('implies', op('or', hole, hole), hole));
    const o = optionsFor('ctlstar', tree, [0, 0, 1]);
    for (const t of TEMPORALS) expect(o.ops).not.toContain(t);
  });

  it('re-entering a quantifier below path level keeps path level', () => {
    // A (G (E (▢))) — inner quantifier's child is again path level.
    const tree = op('A', op('G', op('E', hole)));
    const o = optionsFor('ctlstar', tree, [0, 0, 0]);
    expect(o.ops).toEqual(expect.arrayContaining(TEMPORALS));
  });
});

// --- random-build invariant ------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROPS = ['p', 'q', 'r', 's'];
const DEPTH_CAP = 5;

/** Build a complete CTL* tree choosing uniformly from optionsFor at each
 *  hole; at the depth cap holes are filled with props. */
function buildRandom(rand: () => number): HNode {
  let tree: HNode = { kind: 'hole' };
  for (;;) {
    const hs = holes(tree);
    if (hs.length === 0) return tree;
    const path = hs[0];
    if (path.length >= DEPTH_CAP) {
      tree = replaceAt(tree, path, prop(PROPS[Math.floor(rand() * PROPS.length)]));
      continue;
    }
    const opts = optionsFor('ctlstar', tree, path);
    // Choices: each offered op, plus a prop, plus a const.
    const n = opts.ops.length + (opts.props ? 1 : 0) + (opts.consts ? 1 : 0);
    const pick = Math.floor(rand() * n);
    let filler: HNode;
    if (pick < opts.ops.length) {
      const o = opts.ops[pick];
      const children: HNode[] = [];
      for (let k = 0; k < ARITY[o]; k++) children.push({ kind: 'hole' });
      filler = op(o, ...children);
    } else if (opts.props && pick === opts.ops.length) {
      filler = prop(PROPS[Math.floor(rand() * PROPS.length)]);
    } else {
      filler = { kind: 'const', value: rand() < 0.5 };
    }
    tree = replaceAt(tree, path, filler);
  }
}

describe('random-build invariant: catalog-built CTL* trees are state-rooted', () => {
  it('300 seeded builds all parse and classify state at the root', () => {
    const rand = mulberry32(0xBADA55);
    for (let i = 0; i < 300; i++) {
      const t = buildRandom(rand);
      const text = toText(t, 'ctlstar');
      let root;
      try {
        root = parseCTLStar(text);
      } catch (e) {
        throw new Error(`parseCTLStar rejected catalog-built formula: ${text} (${String(e)})`);
      }
      expect(classify(root).get(root.id), `not state-rooted: ${text}`).toBe('state');
    }
  });
});

// --- action-sequence fuzz --------------------------------------------------

/** Paths of ALL nodes (root included), pre-order. */
function allPaths(tree: HNode): Path[] {
  const out: Path[] = [];
  (function walk(n: HNode, path: Path): void {
    out.push(path);
    if (n.kind === 'op') n.children.forEach((c, i) => walk(c, [...path, i]));
  })(tree, []);
  return out;
}

/** Random legal filler for the position `path`: an offered op (with hole
 *  children per ARITY), a prop, or a const — mirrors the builder palette. */
function randomFiller(rand: () => number, tree: HNode, path: Path): HNode {
  const opts = optionsFor('ctlstar', tree, path);
  const n = opts.ops.length + (opts.props ? 1 : 0) + (opts.consts ? 1 : 0);
  const pick = Math.floor(rand() * n);
  if (pick < opts.ops.length) {
    const o = opts.ops[pick];
    const children: HNode[] = [];
    for (let k = 0; k < ARITY[o]; k++) children.push({ kind: 'hole' });
    return op(o, ...children);
  }
  if (opts.props && pick === opts.ops.length) {
    return prop(PROPS[Math.floor(rand() * PROPS.length)]);
  }
  return { kind: 'const', value: rand() < 0.5 };
}

describe('action-sequence fuzz: random builder sessions stay state-rooted', () => {
  it('500 seeded CTL* sessions of fill/replace/wrap/delete parse and classify state at the root', () => {
    const rand = mulberry32(0xF00DFACE);
    const ACTIONS = 30;
    for (let s = 0; s < 500; s++) {
      let tree: HNode = { kind: 'hole' };
      for (let a = 0; a < ACTIONS; a++) {
        const hs = holes(tree);
        const paths = allPaths(tree);
        const action = Math.floor(rand() * 4);
        if (action === 0 && hs.length > 0) {
          // fill: a random hole, from its palette
          const path = hs[Math.floor(rand() * hs.length)];
          tree = replaceAt(tree, path, randomFiller(rand, tree, path));
        } else if (action === 1) {
          // replace: any node (root included), from its position's palette
          const path = paths[Math.floor(rand() * paths.length)];
          tree = replaceAt(tree, path, randomFiller(rand, tree, path));
        } else if (action === 2) {
          // wrap: any node, in a unary op offered at that node's position
          const path = paths[Math.floor(rand() * paths.length)];
          const wrapOps = optionsFor('ctlstar', tree, path).ops.filter((o) => ARITY[o] === 1);
          tree = wrapAt(tree, path, wrapOps[Math.floor(rand() * wrapOps.length)]);
        } else {
          // delete: any node (root included) back to a hole
          tree = deleteAt(tree, paths[Math.floor(rand() * paths.length)]);
        }
      }
      // Finish the session: fill remaining holes with props (always legal).
      for (let hs = holes(tree); hs.length > 0; hs = holes(tree)) {
        tree = replaceAt(tree, hs[0], prop(PROPS[Math.floor(rand() * PROPS.length)]));
      }
      const text = toText(tree, 'ctlstar');
      let root;
      try {
        root = parseCTLStar(text);
      } catch (e) {
        throw new Error(`parseCTLStar rejected session-built formula: ${text} (${String(e)})`);
      }
      expect(classify(root).get(root.id), `not state-rooted: ${text}`).toBe('state');
    }
  });
});
