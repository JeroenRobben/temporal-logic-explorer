import { describe, it, expect } from 'vitest';
import { parseCTL } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';
import { glossify } from './gloss';

describe('glossify', () => {
  it('renders CTL operators', () => {
    expect(glossify(parseCTL('AG EF r'), 'ctl'))
      .toBe('on every path, at every step, on some path, eventually r');
    expect(glossify(parseCTL('A[p U q]'), 'ctl'))
      .toBe('on every path, p until q');
  });
  it('renders LTL operators', () => {
    expect(glossify(parseLTL('G (p -> F q)'), 'ltl'))
      .toBe('at every step, if p then eventually q');
    expect(glossify(parseLTL('X p'), 'ltl')).toBe('in the next step, p');
  });
  it('renders CTL* quantifiers', () => {
    expect(glossify(parseCTLStar('A G (E F p)'), 'ctlstar'))
      .toBe('on every path, at every step, on some path, eventually p');
  });
  it('renders booleans', () => {
    expect(glossify(parseCTL('p & !q'), 'ctl')).toBe('p and not q');
    expect(glossify(parseLTL('p <-> q'), 'ltl')).toBe('p exactly when q');
  });
  it('bounds depth at 4 with ellipsis', () => {
    const g = glossify(parseLTL('G (F (X (G (p U q))))'), 'ltl');
    expect(g).toBe('at every step, eventually in the next step, at every step, …');
  });
});
