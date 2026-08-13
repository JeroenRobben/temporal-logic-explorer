import { describe, it, expect } from 'vitest';
import { parseLTL, pretty, ParseError, LTLNode } from './ltl-parser';

function kinds(n: LTLNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': case 'X': case 'F': case 'G':
      return `${n.kind}(${kinds(n.child)})`;
    default:
      return `${n.kind}(${kinds(n.left)},${kinds(n.right)})`;
  }
}

describe('parseLTL', () => {
  it('parses atoms and unary temporals', () => {
    expect(kinds(parseLTL('p'))).toBe('p');
    expect(kinds(parseLTL('X F G p'))).toBe('X(F(G(p)))');
    expect(kinds(parseLTL('G F p'))).toBe('G(F(p))');
  });
  it('parses until, right-associative', () => {
    expect(kinds(parseLTL('p U q'))).toBe('U(p,q)');
    expect(kinds(parseLTL('p U q U r'))).toBe('U(p,U(q,r))');
  });
  it('precedence: unary > U > and > or > implies > iff', () => {
    expect(kinds(parseLTL('F p U q'))).toBe('U(F(p),q)');
    expect(kinds(parseLTL('!p U q'))).toBe('U(not(p),q)');
    expect(kinds(parseLTL('p U q & r'))).toBe('and(U(p,q),r)');
    expect(kinds(parseLTL('p | q U r'))).toBe('or(p,U(q,r))');
    expect(kinds(parseLTL('p -> G q'))).toBe('implies(p,G(q))');
    expect(kinds(parseLTL('p <-> q -> r'))).toBe('iff(p,implies(q,r))');
  });
  it('accepts unicode operators', () => {
    expect(kinds(parseLTL('¬p ∧ G q'))).toBe('and(not(p),G(q))');
  });
  it('assigns unique ids per parse', () => {
    const n = parseLTL('G (p & F q)');
    const ids: number[] = [];
    (function walk(m: LTLNode) {
      ids.push(m.id);
      if ('child' in m) walk(m.child);
      if ('left' in m) { walk(m.left); walk(m.right); }
    })(n);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('reports position on syntax errors', () => {
    try {
      parseLTL('p & ');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).pos).toBe(4);
    }
  });
  it('rejects trailing garbage', () => {
    expect(() => parseLTL('p q')).toThrow(ParseError);
  });
  it('hints that path quantifiers are CTL', () => {
    for (const bad of ['AG p', 'EF p', 'AX p']) {
      try {
        parseLTL(bad);
        expect.fail('should throw');
      } catch (e) {
        expect((e as ParseError).hint).toMatch(/drop the A\/E/i);
      }
    }
    expect(() => parseLTL('A[p U q]')).toThrow(/path quantifier/i);
  });
  it('hints about missing spaces in FG-style input', () => {
    try {
      parseLTL('FG p');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).hint).toMatch(/F G/);
    }
  });
  it('rejects overly deep nesting with ParseError', () => {
    expect(() => parseLTL('!'.repeat(10000) + 'p')).toThrow(ParseError);
  });
});

describe('pretty (LTL)', () => {
  it('round-trips with U always parenthesized', () => {
    expect(pretty(parseLTL('G F p'))).toBe('G F p');
    expect(pretty(parseLTL('p U q'))).toBe('(p U q)');
    expect(pretty(parseLTL('F p U q'))).toBe('(F p U q)');
    expect(pretty(parseLTL('!p & q'))).toBe('¬p ∧ q');
    expect(pretty(parseLTL('G (p -> F q)'))).toBe('G (p → F q)');
  });

  it('preserves grouping of low-precedence operators nested under U', () => {
    for (const f of ['(p & q) U r', 'p U (q & r)', '(p | q) U r', 'p U (q -> r)', '(p <-> q) U r']) {
      const ast = parseLTL(f);
      expect(kinds(parseLTL(pretty(ast)))).toBe(kinds(ast));
    }
  });

  it('pretty is idempotent', () => {
    for (const src of ['p <-> (q <-> r)', '(p <-> q) <-> r', '(p & q) U r', 'G (p -> F q)', 'F p U q', 'p U q U r', '!p U (q | r)']) {
      const p1 = pretty(parseLTL(src));
      expect(pretty(parseLTL(p1))).toBe(p1);
    }
  });
});
