import { describe, it, expect } from 'vitest';
import { parseCTL, pretty, ParseError, CTLNode } from './ctl-parser';

function kinds(n: CTLNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': return `not(${kinds(n.child)})`;
    case 'and': case 'or': case 'implies': case 'iff':
      return `${n.kind}(${kinds(n.left)},${kinds(n.right)})`;
    case 'EU': case 'AU': return `${n.kind}(${kinds(n.left)},${kinds(n.right)})`;
    default: return `${n.kind}(${kinds(n.child)})`;
  }
}

describe('parseCTL', () => {
  it('parses atoms and propositions', () => {
    expect(kinds(parseCTL('p'))).toBe('p');
    expect(kinds(parseCTL('true'))).toBe('true');
    expect(kinds(parseCTL('false'))).toBe('false');
  });
  it('parses temporal prefixes, nested', () => {
    expect(kinds(parseCTL('AG EF p'))).toBe('AG(EF(p))');
    expect(kinds(parseCTL('EX AX q'))).toBe('EX(AX(q))');
  });
  it('parses until', () => {
    expect(kinds(parseCTL('A[p U q]'))).toBe('AU(p,q)');
    expect(kinds(parseCTL('E[p U AG q]'))).toBe('EU(p,AG(q))');
  });
  it('handles precedence: not > and > or > implies > iff', () => {
    expect(kinds(parseCTL('!p & q'))).toBe('and(not(p),q)');
    expect(kinds(parseCTL('p | q & r'))).toBe('or(p,and(q,r))');
    expect(kinds(parseCTL('p -> q | r'))).toBe('implies(p,or(q,r))');
    expect(kinds(parseCTL('p <-> q -> r'))).toBe('iff(p,implies(q,r))');
  });
  it('implies is right-associative', () => {
    expect(kinds(parseCTL('p -> q -> r'))).toBe('implies(p,implies(q,r))');
  });
  it('accepts unicode operators', () => {
    expect(kinds(parseCTL('¬p ∧ q ∨ r'))).toBe('or(and(not(p),q),r)');
  });
  it('temporal operators bind like unary: AG p & q is (AG p) & q', () => {
    expect(kinds(parseCTL('AG p & q'))).toBe('and(AG(p),q)');
  });
  it('assigns unique ids to every node', () => {
    const n = parseCTL('AG (p & q)');
    const ids: number[] = [];
    (function walk(m: CTLNode) {
      ids.push(m.id);
      if ('child' in m) walk(m.child);
      if ('left' in m) { walk(m.left); walk(m.right); }
    })(n);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('reports position on syntax errors', () => {
    try {
      parseCTL('p & ');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).pos).toBe(4);
    }
  });
  it('rejects unbalanced until', () => {
    expect(() => parseCTL('A[p U q')).toThrow(ParseError);
  });
  it('rejects trailing garbage', () => {
    expect(() => parseCTL('p q')).toThrow(ParseError);
  });
  it('rejects overly deep nesting with ParseError', () => {
    expect(() => parseCTL('!'.repeat(10000) + 'p')).toThrow(ParseError);
  });
  it('parses nested until', () => {
    expect(kinds(parseCTL('E[E[p U q] U r]'))).toBe('EU(EU(p,q),r)');
  });
  it('gives an LTL hint for bare path operators', () => {
    try {
      parseCTL('FG p');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).hint).toMatch(/path quantifier/);
    }
    expect(() => parseCTL('G p')).toThrow(/path/i);
  });
});

describe('pretty', () => {
  it('round-trips ASCII to unicode with minimal parens', () => {
    expect(pretty(parseCTL('AG EF p'))).toBe('AG EF p');
    expect(pretty(parseCTL('!p & q'))).toBe('¬p ∧ q');
    expect(pretty(parseCTL('(p | q) & r'))).toBe('(p ∨ q) ∧ r');
    expect(pretty(parseCTL('A[p U q]'))).toBe('A[p U q]');
    expect(pretty(parseCTL('p -> q'))).toBe('p → q');
    expect(pretty(parseCTL('AG (p -> AF q)'))).toBe('AG (p → AF q)');
  });

  it('pretty is idempotent', () => {
    for (const src of ['p <-> (q <-> r)', '(p <-> q) <-> r', 'p & (q & r)', 'p -> (q -> r)', '(p -> q) -> r', 'AG (p -> EF q)', 'E[p U A[q U r]]', 'AG (p <-> (q <-> r))', 'E[(p & q) U (r | p)]']) {
      const p1 = pretty(parseCTL(src));
      expect(pretty(parseCTL(p1))).toBe(p1);
    }
  });
});
