import { describe, it, expect } from 'vitest';
import { HNode, OpId, Path, holes, replaceAt, toText } from './htree';
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
      const children: HNode[] = [{ kind: 'hole' }];
      if (o === 'and' || o === 'or' || o === 'implies' || o === 'iff' || o === 'U') {
        children.push({ kind: 'hole' });
      }
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
