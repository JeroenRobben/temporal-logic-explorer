import { describe, it, expect } from 'vitest';
import { parseCTLStar, classify, pretty, ParseError, StarNode } from './ctlstar-parser';

function kinds(n: StarNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': case 'X': case 'F': case 'G': case 'A': case 'E':
      return `${n.kind}(${kinds(n.child)})`;
    default: return `${n.kind}(${kinds(n.left)},${kinds(n.right)})`;
  }
}

describe('parseCTLStar', () => {
  it('parses quantified path formulas', () => {
    expect(kinds(parseCTLStar('A F G p'))).toBe('A(F(G(p)))');
    expect(kinds(parseCTLStar('E (G F p)'))).toBe('E(G(F(p)))');
    expect(kinds(parseCTLStar('A G (E F p)'))).toBe('A(G(E(F(p))))');
  });
  it('quantifiers bind at unary precedence: A p U q is (A p) U q — as a root it errors', () => {
    // (A p) U q is a PATH formula at the root → rejected by classification
    expect(() => parseCTLStar('A p U q')).toThrow(/path quantifier/i);
    expect(kinds(parseCTLStar('A (p U q)'))).toBe('A(U(p,q))');
    expect(kinds(parseCTLStar('E ((A p) U q)'))).toBe('E(U(A(p),q))');
  });
  it('state-level booleans over quantifiers are fine', () => {
    expect(kinds(parseCTLStar('p & A F q'))).toBe('and(p,A(F(q)))');
    expect(kinds(parseCTLStar('A F p -> E G q'))).toBe('implies(A(F(p)),E(G(q)))');
  });
  it('rejects bare temporal roots with a quantifier hint', () => {
    for (const bad of ['F p', 'G p', 'p U q', 'X p']) {
      expect(() => parseCTLStar(bad)).toThrow(/path quantifier/i);
    }
  });
  it('hints on CTL bracket syntax', () => {
    try {
      parseCTLStar('A[p U q]');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).hint).toMatch(/A \(p U q\)/);
    }
  });
  it('hints on glued CTL-style tokens', () => {
    try {
      parseCTLStar('AG p');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).hint).toMatch(/A G/);
    }
  });
  it('reports position on syntax errors and assigns unique ids', () => {
    try {
      parseCTLStar('A F ');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).pos).toBe(4);
    }
    const n = parseCTLStar('A G (p & E F q)');
    const ids: number[] = [];
    (function walk(m: StarNode) {
      ids.push(m.id);
      if ('child' in m) walk(m.child);
      if ('left' in m) { walk(m.left); walk(m.right); }
    })(n);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('classify', () => {
  function clsOf(input: string): Map<string, 'state' | 'path'> {
    const root = parseCTLStar(input);
    const cls = classify(root);
    const byKinds = new Map<string, 'state' | 'path'>();
    (function walk(m: StarNode) {
      byKinds.set(kinds(m), cls.get(m.id)!);
      if ('child' in m) walk(m.child);
      if ('left' in m) { walk(m.left); walk(m.right); }
    })(root);
    return byKinds;
  }
  it('marks quantified nodes state and inner temporals path', () => {
    const m = clsOf('A (p U E G q)');
    expect(m.get('A(U(p,E(G(q))))')).toBe('state');
    expect(m.get('U(p,E(G(q)))')).toBe('path');
    expect(m.get('p')).toBe('state');
    expect(m.get('E(G(q))')).toBe('state');
    expect(m.get('G(q)')).toBe('path');
  });
  it('booleans are state iff all children are state', () => {
    const m = clsOf('A (p & F q)');
    expect(m.get('and(p,F(q))')).toBe('path');
    const m2 = clsOf('A F (p & E X q)');
    expect(m2.get('and(p,E(X(q)))')).toBe('state');
  });
});

describe('pretty (CTL*)', () => {
  it('round-trips with quantifier-child parens where needed', () => {
    expect(pretty(parseCTLStar('A F G p'))).toBe('A F G p');
    expect(pretty(parseCTLStar('A (p U q)'))).toBe('A (p U q)');
    expect(pretty(parseCTLStar('A G (E F p)'))).toBe('A G E F p');
    expect(pretty(parseCTLStar('p & A F q'))).toBe('p ∧ A F q');
  });

  it('preserves grouping of low-precedence operators nested under U', () => {
    for (const f of [
      'A ((p & q) U r)', 'A (p U (q & r))', 'A ((p | q) U r)',
      'A (p U (q -> r))', 'A ((p <-> q) U r)',
    ]) {
      const ast = parseCTLStar(f);
      expect(kinds(parseCTLStar(pretty(ast)))).toBe(kinds(ast));
    }
  });

  it('pretty is idempotent', () => {
    for (const src of [
      'p <-> (q <-> r)', '(p <-> q) <-> r', 'A ((p & q) U r)',
      'A G (p -> F q)', 'E (F p U q)', 'A (p U q U r)', 'A (!p U (q | r))',
    ]) {
      const p1 = pretty(parseCTLStar(src));
      expect(pretty(parseCTLStar(p1))).toBe(p1);
    }
  });
});

describe('ParseError.fix', () => {
  it('glued CTL token offers a spacing fix', () => {
    try {
      parseCTLStar('AG p');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      expect(fix.replacement).toBe('A G p');
      expect(() => parseCTLStar(fix.replacement)).not.toThrow();
    }
  });
  it('bracket syntax offers a parenthesized rewrite', () => {
    try {
      parseCTLStar('A[p U q]');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      expect(fix.replacement).toBe('A (p U q)');
      expect(() => parseCTLStar(fix.replacement)).not.toThrow();
    }
  });
  it('bracket fix handles nested brackets', () => {
    try {
      parseCTLStar('E[p U A[q U r]]');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      // outer bracket rewritten; inner remains (will error again with its own fix on next parse)
      expect(fix.replacement).toBe('E (p U A[q U r])');
    }
  });
  it('glued LTL token offers a spacing fix', () => {
    try {
      parseCTLStar('A FG p');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).fix!.replacement).toBe('A F G p');
    }
  });
});
