import { describe, it, expect } from 'vitest';
import {
  HNode, OpId, Path,
  nodeAt, replaceAt, wrapAt, deleteAt, holes, isComplete, toText,
} from './htree';
import { parseCTL } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';

const hole = (): HNode => ({ kind: 'hole' });
const prop = (name: string): HNode => ({ kind: 'prop', name });
const konst = (value: boolean): HNode => ({ kind: 'const', value });
const op = (o: OpId, ...children: HNode[]): HNode => ({ kind: 'op', op: o, children });

// AG (p -> EF q) as an htree
const agImplies = op('AG', op('implies', prop('p'), op('EF', prop('q'))));

describe('nodeAt', () => {
  it('returns the root at []', () => {
    expect(nodeAt(agImplies, [])).toBe(agImplies);
  });
  it('returns nested nodes by child-index path', () => {
    expect(nodeAt(agImplies, [0])).toEqual(op('implies', prop('p'), op('EF', prop('q'))));
    expect(nodeAt(agImplies, [0, 0])).toEqual(prop('p'));
    expect(nodeAt(agImplies, [0, 1, 0])).toEqual(prop('q'));
  });
  it('returns null for invalid paths', () => {
    expect(nodeAt(agImplies, [1])).toBeNull();
    expect(nodeAt(agImplies, [0, 0, 0])).toBeNull();
    expect(nodeAt(prop('p'), [0])).toBeNull();
  });
});

describe('replaceAt', () => {
  it('replaces the root', () => {
    const next = replaceAt(agImplies, [], prop('z'));
    expect(next).toEqual(prop('z'));
  });
  it('replaces a nested node immutably', () => {
    const next = replaceAt(agImplies, [0, 0], prop('r'));
    expect(nodeAt(next, [0, 0])).toEqual(prop('r'));
    // original untouched
    expect(nodeAt(agImplies, [0, 0])).toEqual(prop('p'));
    // untouched sibling subtree is shared
    expect(nodeAt(next, [0, 1])).toBe(nodeAt(agImplies, [0, 1]));
  });
  it('no-ops on invalid paths, returning the SAME tree reference', () => {
    expect(replaceAt(agImplies, [3], prop('r'))).toBe(agImplies);
    expect(replaceAt(agImplies, [0, 1, 0, 0], prop('r'))).toBe(agImplies);
  });
});

describe('wrapAt', () => {
  it('wraps a node as first child of a unary op', () => {
    const next = wrapAt(agImplies, [0, 0], 'not');
    expect(nodeAt(next, [0, 0])).toEqual(op('not', prop('p')));
  });
  it('wraps with a binary op, filling remaining children with holes', () => {
    const next = wrapAt(prop('p'), [], 'and');
    expect(next).toEqual(op('and', prop('p'), hole()));
  });
  it('wraps the root with a CTL until', () => {
    const next = wrapAt(prop('p'), [], 'AU');
    expect(next).toEqual(op('AU', prop('p'), hole()));
  });
  it('no-ops on invalid paths, returning the SAME tree reference', () => {
    expect(wrapAt(agImplies, [7], 'not')).toBe(agImplies);
    expect(wrapAt(agImplies, [0, 0, 5], 'not')).toBe(agImplies);
  });
});

describe('deleteAt', () => {
  it('collapses a nested node back to a hole', () => {
    const next = deleteAt(agImplies, [0, 1]);
    expect(nodeAt(next, [0, 1])).toEqual(hole());
    expect(nodeAt(agImplies, [0, 1])).toEqual(op('EF', prop('q')));
  });
  it('collapses the root to a hole', () => {
    expect(deleteAt(agImplies, [])).toEqual(hole());
  });
  it('no-ops on invalid paths, returning the SAME tree reference', () => {
    expect(deleteAt(agImplies, [2])).toBe(agImplies);
    expect(deleteAt(agImplies, [0, 1, 0, 0])).toBe(agImplies);
  });
});

describe('holes / isComplete', () => {
  it('enumerates hole paths in left-to-right order', () => {
    const t = op('AU', hole(), op('and', prop('p'), hole()));
    expect(holes(t)).toEqual<Path[]>([[0], [1, 1]]);
  });
  it('a bare hole is one hole at the root', () => {
    expect(holes(hole())).toEqual<Path[]>([[]]);
  });
  it('complete trees have no holes', () => {
    expect(holes(agImplies)).toEqual([]);
    expect(isComplete(agImplies)).toBe(true);
    expect(isComplete(op('AU', hole(), prop('p')))).toBe(false);
    expect(isComplete(hole())).toBe(false);
  });
});

describe('toText — CTL', () => {
  it('prints until with a hole: A[▢ U p]', () => {
    expect(toText(op('AU', hole(), prop('p')), 'ctl')).toBe('A[▢ U p]');
  });
  it('prints E-until template', () => {
    expect(toText(op('EU', hole(), hole()), 'ctl')).toBe('E[▢ U ▢]');
  });
  it('prints AG (p -> EF q)', () => {
    expect(toText(agImplies, 'ctl')).toBe('AG (p -> EF q)');
  });
  it('prints negation of a leaf without parens', () => {
    expect(toText(op('not', prop('p')), 'ctl')).toBe('! p');
  });
  it('prints negation of a binary child with parens', () => {
    expect(toText(op('not', op('and', prop('p'), prop('q'))), 'ctl')).toBe('! (p & q)');
  });
  it('prints constants', () => {
    expect(toText(konst(true), 'ctl')).toBe('true');
    expect(toText(konst(false), 'ctl')).toBe('false');
  });
  it('prints a bare hole as ▢', () => {
    expect(toText(hole(), 'ctl')).toBe('▢');
  });
  it('prints binary boolean templates with parens', () => {
    expect(toText(op('and', hole(), hole()), 'ctl')).toBe('(▢ & ▢)');
    expect(toText(op('or', prop('p'), prop('q')), 'ctl')).toBe('(p | q)');
    expect(toText(op('iff', prop('p'), prop('q')), 'ctl')).toBe('(p <-> q)');
  });
  it('complete outputs reparse under parseCTL', () => {
    for (const t of [
      agImplies,
      op('not', op('and', prop('p'), prop('q'))),
      op('AU', op('EX', prop('p')), op('not', prop('q'))),
      op('EU', konst(true), op('AG', op('or', prop('p'), prop('q')))),
      op('AG', op('AU', prop('p'), prop('q'))),
    ]) {
      expect(() => parseCTL(toText(t, 'ctl'))).not.toThrow();
    }
  });
});

describe('toText — LTL', () => {
  it('prints until with a hole: (p U ▢)', () => {
    expect(toText(op('U', prop('p'), hole()), 'ltl')).toBe('(p U ▢)');
  });
  it('prints G (p -> F q)', () => {
    const t = op('G', op('implies', prop('p'), op('F', prop('q'))));
    expect(toText(t, 'ltl')).toBe('G (p -> F q)');
  });
  it('complete outputs reparse under parseLTL', () => {
    for (const t of [
      op('G', op('implies', prop('p'), op('F', prop('q')))),
      op('U', op('not', prop('p')), op('X', prop('q'))),
      op('and', op('G', prop('p')), op('F', konst(false))),
    ]) {
      expect(() => parseLTL(toText(t, 'ltl'))).not.toThrow();
    }
  });
});

describe('toText — CTL*', () => {
  it('quantifiers print with parens: A (G (F p))', () => {
    const t = op('A', op('G', op('F', prop('p'))));
    expect(toText(t, 'ctlstar')).toBe('A (G (F p))');
  });
  it('quantifier over a hole: A (▢)', () => {
    expect(toText(op('A', hole()), 'ctlstar')).toBe('A (▢)');
  });
  it('complete outputs reparse under parseCTLStar', () => {
    for (const t of [
      op('A', op('G', op('F', prop('p')))),
      op('E', op('U', prop('p'), prop('q'))),
      op('and', op('A', op('G', prop('p'))), op('E', op('F', prop('q')))),
      op('not', op('A', op('X', prop('p')))),
    ]) {
      expect(() => parseCTLStar(toText(t, 'ctlstar'))).not.toThrow();
    }
  });
});
