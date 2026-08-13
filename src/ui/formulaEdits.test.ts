import { describe, it, expect } from 'vitest';
import { wrapNode, swapQuantifier } from './formulaEdits';
import { parseCTL } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';

// node ids are deterministic: re-parse the text to find target ids
function ctlNodeId(text: string, pick: (k: string) => boolean): number {
  const ast = parseCTL(text);
  let found = -1;
  (function walk(n: import('../core/ctl-parser').CTLNode) {
    if (found === -1 && pick(n.kind === 'prop' ? n.name : n.kind)) found = n.id;
    if ('child' in n) walk(n.child);
    if ('left' in n) { walk(n.left); walk(n.right); }
  })(ast);
  return found;
}

describe('wrapNode', () => {
  it('wraps a CTL subformula and re-emits the whole formula', () => {
    const id = ctlNodeId('p & q', (k) => k === 'q');
    expect(wrapNode('ctl', 'p & q', id, 'AG')).toBe('p ∧ AG q');
  });
  it('wraps the root', () => {
    const id = ctlNodeId('EF r', (k) => k === 'EF');
    expect(wrapNode('ctl', 'EF r', id, 'AG')).toBe('AG EF r');
  });
  it('negates', () => {
    const id = ctlNodeId('p', (k) => k === 'p');
    expect(wrapNode('ctl', 'p', id, 'not')).toBe('¬p');
  });
  it('LTL wrap', () => {
    const ast = parseLTL('F p');
    expect(wrapNode('ltl', 'F p', ast.id, 'G')).toBe('G F p');
  });
  it('CTL* wrap of an inner state node', () => {
    // wrap the E F p subtree of 'A G (E F p)' with another A — still parses
    const star = parseCTLStar('A G (E F p)');
    // find the E node
    let eId = -1;
    (function walk(n: import('../core/ctlstar-parser').StarNode) {
      if (n.kind === 'E') eId = n.id;
      if ('child' in n) walk(n.child);
      if ('left' in n) { walk(n.left); walk(n.right); }
    })(star);
    const out = wrapNode('ctlstar', 'A G (E F p)', eId, 'A')!;
    expect(() => parseCTLStar(out)).not.toThrow();
    expect(out).toContain('A E F p');
  });
  it('rejects a CTL* wrap that would make the root path-level', () => {
    const star = parseCTLStar('p');
    expect(wrapNode('ctlstar', 'p', star.id, 'G')).toBe(null);
  });
  it('returns null for an unknown node id', () => {
    expect(wrapNode('ctl', 'p', 999, 'AG')).toBe(null);
  });
  it('result reparses and contains the original subtree (property, spot cases)', () => {
    for (const [logic, text, kind, wrapper] of [
      ['ctl', 'A[p U q]', 'AU', 'EF'],
      ['ltl', '(p U q)', 'U', 'G'],
      ['ctlstar', 'A (p U q)', 'A', 'E'],
    ] as const) {
      const parse = logic === 'ctl' ? parseCTL : logic === 'ltl' ? parseLTL : parseCTLStar;
      const ast = parse(text) as { id: number; kind: string };
      let target = -1;
      (function walk(n: { id: number; kind: string; child?: unknown; left?: unknown; right?: unknown }) {
        if (n.kind === kind) target = n.id;
        if (n.child) walk(n.child as never);
        if (n.left) { walk(n.left as never); walk(n.right as never); }
      })(ast as never);
      const out = wrapNode(logic, text, target, wrapper);
      expect(out).not.toBe(null);
      expect(() => parse(out!)).not.toThrow();
    }
  });
});

describe('swapQuantifier', () => {
  it('swaps CTL quantifier pairs', () => {
    const id = ctlNodeId('AG EF r', (k) => k === 'AG');
    expect(swapQuantifier('ctl', 'AG EF r', id)).toBe('EG EF r');
    const id2 = ctlNodeId('AG EF r', (k) => k === 'EF');
    expect(swapQuantifier('ctl', 'AG EF r', id2)).toBe('AG AF r');
  });
  it('swaps CTL* A/E', () => {
    const star = parseCTLStar('A F p');
    expect(swapQuantifier('ctlstar', 'A F p', star.id)).toBe('E F p');
  });
  it('swaps CTL until quantifiers', () => {
    const id = ctlNodeId('A[p U q]', (k) => k === 'AU');
    expect(swapQuantifier('ctl', 'A[p U q]', id)).toBe('E[p U q]');
  });
  it('returns null for LTL and non-quantified nodes', () => {
    const ast = parseLTL('G p');
    expect(swapQuantifier('ltl', 'G p', ast.id)).toBe(null);
    const id = ctlNodeId('p', (k) => k === 'p');
    expect(swapQuantifier('ctl', 'p', id)).toBe(null);
  });
});
