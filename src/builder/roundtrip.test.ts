import { describe, it, expect } from 'vitest';
import { ARITY, HNode, OpId, fromAst, toText } from './htree';
import { legalOps } from './catalog';
import { parseForLogic } from '../learn/engine';
import { REFERENCES } from '../learn/content';
import { PATTERNS, instantiate } from '../patterns/patterns';
import type { Logic } from '../ui/types';

const prop = (name: string): HNode => ({ kind: 'prop', name });
const konst = (value: boolean): HNode => ({ kind: 'const', value });
const op = (o: OpId, ...children: HNode[]): HNode => ({ kind: 'op', op: o, children });

describe('fromAst hand cases', () => {
  it('CTL: AG (p -> EF q)', () => {
    expect(fromAst('ctl', 'AG (p -> EF q)')).toEqual(
      op('AG', op('implies', prop('p'), op('EF', prop('q')))),
    );
  });
  it('CTL: A[true U p] and consts', () => {
    expect(fromAst('ctl', 'A[true U p]')).toEqual(op('AU', konst(true), prop('p')));
    expect(fromAst('ctl', 'false')).toEqual(konst(false));
  });
  it('LTL: G (p -> F q)', () => {
    expect(fromAst('ltl', 'G (p -> F q)')).toEqual(
      op('G', op('implies', prop('p'), op('F', prop('q')))),
    );
  });
  it('LTL: (p U q), ! p, consts', () => {
    expect(fromAst('ltl', '(p U q)')).toEqual(op('U', prop('p'), prop('q')));
    expect(fromAst('ltl', '! p')).toEqual(op('not', prop('p')));
    expect(fromAst('ltl', 'true')).toEqual(konst(true));
  });
  it('CTL*: A (G (F p))', () => {
    expect(fromAst('ctlstar', 'A (G (F p))')).toEqual(
      op('A', op('G', op('F', prop('p')))),
    );
  });
  it('CTL*: E (p U q)', () => {
    expect(fromAst('ctlstar', 'E (p U q)')).toEqual(
      op('E', op('U', prop('p'), prop('q'))),
    );
  });
  it('parse errors yield null', () => {
    expect(fromAst('ctl', 'AG (')).toBeNull();
    expect(fromAst('ltl', 'p U')).toBeNull();
    expect(fromAst('ctlstar', '')).toBeNull();
    // LTL has no CTL operators
    expect(fromAst('ltl', 'AG p')).toBeNull();
  });
});

// --- seeded random complete-tree generation -------------------------------

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

function genTree(rand: () => number, logic: Logic, depth: number, pathLevel: boolean): HNode {
  // Leaf-bias grows with depth; forced leaf at the cap.
  if (depth >= DEPTH_CAP || rand() < 0.2 + depth * 0.1) {
    if (rand() < 0.15) return konst(rand() < 0.5);
    return prop(PROPS[Math.floor(rand() * PROPS.length)]);
  }
  const ops = legalOps(logic, pathLevel);
  const o = ops[Math.floor(rand() * ops.length)];
  const childLevel = o === 'A' || o === 'E' ? true : pathLevel;
  const arity = ARITY[o];
  const children: HNode[] = [];
  for (let i = 0; i < arity; i++) children.push(genTree(rand, logic, depth + 1, childLevel));
  return op(o, ...children);
}

describe('round-trip property: parse(toText(t)) and fromAst(toText(t)) == t', () => {
  (['ctl', 'ltl', 'ctlstar'] as Logic[]).forEach((logic) => {
    it(`${logic}: 500 seeded random complete trees`, () => {
      const rand = mulberry32(0xC0FFEE ^ logic.length);
      for (let n = 0; n < 500; n++) {
        const t = genTree(rand, logic, 0, false);
        const text = toText(t, logic);
        expect(parseForLogic(logic, text), `${logic} parse failed: ${text}`).not.toBeNull();
        expect(fromAst(logic, text), `${logic} round-trip failed: ${text}`).toEqual(t);
      }
    });
  });
});

// --- corpus: every formula string shipped in the repo's content -----------

describe('corpus round-trip', () => {
  it('every REFERENCES pattern formula fromAsts and re-parses', () => {
    let count = 0;
    for (const r of REFERENCES) {
      const logic: Logic = r.logic === 'shared' ? 'ctl' : r.logic === 'pattern' ? 'ltl' : r.logic;
      for (const p of r.patterns) {
        count++;
        const t = fromAst(logic, p.formula);
        expect(t, `${r.id}: fromAst null for ${p.formula}`).not.toBeNull();
        const text = toText(t as HNode, logic);
        expect(parseForLogic(logic, text), `${r.id}: reprint unparseable: ${text}`).not.toBeNull();
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  it('every PATTERNS cell, fully instantiated, fromAsts and re-parses', () => {
    const fill = { P: 'p', S: 's', q: 'q', r: 'r' } as const;
    let count = 0;
    for (const def of PATTERNS) {
      for (const cell of Object.values(def.scopes)) {
        const entries: [Logic, string][] = [
          ['ltl', cell.ltl],
          ['ctlstar', cell.ctlstar],
        ];
        if (cell.ctl !== undefined) entries.push(['ctl', cell.ctl]);
        for (const [logic, template] of entries) {
          count++;
          const formula = instantiate(template, fill);
          const t = fromAst(logic, formula);
          expect(t, `${def.id}/${logic}: fromAst null for ${formula}`).not.toBeNull();
          const text = toText(t as HNode, logic);
          expect(parseForLogic(logic, text), `${def.id}/${logic}: reprint unparseable: ${text}`).not.toBeNull();
        }
      }
    }
    expect(count).toBe(PATTERNS.length * 3 * 2 + PATTERNS.filter((d) => d.scopes.globally.ctl !== undefined).length);
  });
});
