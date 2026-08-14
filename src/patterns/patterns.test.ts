import { describe, it, expect } from 'vitest';
import { PATTERNS, instantiate, PatternDef, PatternCell } from './patterns';
import { parseForLogic, prettyForLogic } from '../learn/engine';
import { Logic } from '../ui/types';

const HOLE = '▢';

/** Full fill with multi-char props: proves whole-token substitution. */
const FULL = { P: 'alpha', S: 'beta', q: 'gamma', r: 'delta' } as const;

type ScopeKey = 'globally' | 'before' | 'after';
const SCOPES: ScopeKey[] = ['globally', 'before', 'after'];

function byId(id: string): PatternDef {
  const p = PATTERNS.find((d) => d.id === id);
  if (!p) throw new Error(`missing pattern ${id}`);
  return p;
}

/** Every offered (pattern, scope, logic) cell as [label, template, logic]. */
function offeredCells(): Array<[string, string, Logic]> {
  const out: Array<[string, string, Logic]> = [];
  for (const p of PATTERNS) {
    for (const scope of SCOPES) {
      const cell: PatternCell = p.scopes[scope];
      out.push([`${p.id}/${scope}/ltl`, cell.ltl, 'ltl']);
      out.push([`${p.id}/${scope}/ctlstar`, cell.ctlstar, 'ctlstar']);
      if (cell.ctl !== undefined) out.push([`${p.id}/${scope}/ctl`, cell.ctl, 'ctl']);
    }
  }
  return out;
}

function countHoles(s: string): number {
  return s.split(HOLE).length - 1;
}

describe('PATTERNS shape', () => {
  it('has the five Dwyer patterns in order', () => {
    expect(PATTERNS.map((p) => p.id)).toEqual([
      'absence', 'universality', 'existence', 'response', 'precedence',
    ]);
  });

  it('slots: P everywhere, S added for response/precedence', () => {
    for (const p of PATTERNS) {
      if (p.id === 'response' || p.id === 'precedence') {
        expect(p.slots, p.id).toEqual(['P', 'S']);
      } else {
        expect(p.slots, p.id).toEqual(['P']);
      }
    }
  });

  it('every scope cell offers ltl + ctlstar; ctl present iff globally', () => {
    for (const p of PATTERNS) {
      for (const scope of SCOPES) {
        const cell = p.scopes[scope];
        expect(typeof cell.ltl, `${p.id}/${scope}`).toBe('string');
        expect(typeof cell.ctlstar, `${p.id}/${scope}`).toBe('string');
        if (scope === 'globally') {
          expect(typeof cell.ctl, `${p.id}/${scope}`).toBe('string');
        } else {
          expect(cell.ctl, `${p.id}/${scope}`).toBeUndefined();
        }
      }
    }
  });

  it('every ctlstar template is the A-wrapped ltl template', () => {
    for (const p of PATTERNS) {
      for (const scope of SCOPES) {
        const cell = p.scopes[scope];
        expect(cell.ctlstar, `${p.id}/${scope}`).toBe(`A (${cell.ltl})`);
      }
    }
  });
});

describe('full instantiation parses and round-trips', () => {
  for (const [label, template, logic] of offeredCells()) {
    it(label, () => {
      const inst = instantiate(template, FULL);
      // No slot token survives full instantiation.
      expect(inst).not.toMatch(/\b[PSqr]\b/);
      expect(inst).not.toContain(HOLE);
      const ast = parseForLogic(logic, inst);
      expect(ast, `${label}: '${inst}' must parse`).not.toBeNull();
      const once = prettyForLogic(logic, ast);
      const twice = prettyForLogic(logic, parseForLogic(logic, once));
      expect(twice, `${label}: pretty∘parse idempotent`).toBe(once);
    });
  }
});

describe('unfilled slots become holes', () => {
  // Expected ▢ count per cell with NO slots filled = slot-token occurrences
  // in the spec table's template (each occurrence is one hole).
  const LTL_HOLES: Record<string, Record<ScopeKey, number>> = {
    absence:      { globally: 1, before: 3, after: 2 },
    universality: { globally: 1, before: 3, after: 2 },
    existence:    { globally: 1, before: 4, after: 3 },
    response:     { globally: 2, before: 6, after: 3 },
    precedence:   { globally: 3, before: 4, after: 6 },
  };
  const CTL_HOLES: Record<string, number> = {
    absence: 1, universality: 1, existence: 1, response: 2, precedence: 3,
  };

  for (const p of ['absence', 'universality', 'existence', 'response', 'precedence']) {
    for (const scope of SCOPES) {
      it(`${p}/${scope}`, () => {
        const cell = byId(p).scopes[scope];
        const want = LTL_HOLES[p][scope];
        expect(countHoles(instantiate(cell.ltl, {})), 'ltl').toBe(want);
        expect(countHoles(instantiate(cell.ctlstar, {})), 'ctlstar').toBe(want);
        if (scope === 'globally') {
          expect(countHoles(instantiate(cell.ctl!, {})), 'ctl').toBe(CTL_HOLES[p]);
        }
      });
    }
  }

  it('no slot token survives even when nothing is filled', () => {
    for (const [label, template] of offeredCells()) {
      expect(instantiate(template, {}), label).not.toMatch(/\b[PSqr]\b/);
    }
  });
});

describe('instantiate mechanics', () => {
  it('repeated slots substitute consistently', () => {
    const t = byId('response').scopes.before.ltl; // S appears once, r four times
    const inst = instantiate(t, { S: 'x' });
    expect(inst).not.toMatch(/\bS\b/);
    expect((inst.match(/\bx\b/g) ?? []).length).toBeGreaterThan(0);
    // Every r site turned into a hole, consistently.
    const rFilled = instantiate(t, { r: 'x' });
    expect(rFilled).not.toMatch(/\br\b/);
    expect((rFilled.match(/\bx\b/g) ?? []).length).toBe(4);
  });

  it('non-atomic fills are parenthesized', () => {
    expect(instantiate('G (! P)', { P: 'a & b' })).toBe('G (! (a & b))');
  });

  it('atomic fills are not parenthesized', () => {
    expect(instantiate('G (! P)', { P: 'alpha' })).toBe('G (! alpha)');
  });

  it('a fill that is itself a slot letter is not re-substituted', () => {
    // 'q' is a legal prop name; filling P with it must not leak into the q slot pass.
    expect(instantiate('G (q -> G (! P))', { P: 'q' })).toBe(`G (${HOLE} -> G (! q))`);
  });

  it('partial fill leaves other slots as holes', () => {
    const inst = instantiate(byId('response').scopes.globally.ltl, { P: 'req' });
    expect(inst).toContain('req');
    expect(countHoles(inst)).toBe(1);
    expect(inst).not.toMatch(/\b[PSqr]\b/);
  });
});
