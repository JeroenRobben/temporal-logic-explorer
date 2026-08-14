import { describe, expect, it } from 'vitest';
import { KripkeStructure } from '../core/kripke';
import { parseLTL } from '../core/ltl-parser';
import { parseCTL } from '../core/ctl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';
import { checkLTLAllPaths } from '../core/ltl-allpaths';
import { checkCTL } from '../core/ctl-checker';
import { checkCTLStar } from '../core/ctlstar-checker';
import { AutomatonTooLarge } from '../core/buchi';
import { PATTERNS, instantiate } from './patterns';

/** LTL↔CTL / LTL↔CTL* cross-check fuzz over random total Kripke structures.
 *
 *  Both sides of each check are template instantiations of the same pattern
 *  cell; any disagreement means a template derivation bug (never a weakening
 *  of this battery — see the plan's semantics guard).
 */

// Deterministic seeded PRNG (mulberry32) for reproducible fuzzing.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random TOTAL model: 3–6 states, every state ≥1 successor (self-loop when
 *  the draw gives none), independent random prop subsets, one initial state. */
function randomModel(rand: () => number, props: string[], initialIndex: number): KripkeStructure {
  const n = 3 + Math.floor(rand() * 4);
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const states = ids.map((id, i) => ({
    id,
    name: id,
    propositions: props.filter(() => rand() < 0.5),
    isInitial: i === initialIndex % n,
    x: 0,
    y: 0,
  }));
  const transitions: { from: string; to: string }[] = [];
  for (const from of ids) {
    let out = 0;
    for (const to of ids) {
      if (rand() < 0.3) { transitions.push({ from, to }); out++; }
    }
    if (out === 0) transitions.push({ from, to: from }); // keep the model total
  }
  return { states, transitions };
}

function serialize(model: KripkeStructure, ltl: string, other: string): string {
  const states = model.states
    .map((s) => `${s.id}${s.isInitial ? '*' : ''}{${s.propositions.join(',')}}`)
    .join(' ');
  const trans = model.transitions.map((t) => `${t.from}->${t.to}`).join(' ');
  return `LTL: ${ltl}\nOther: ${other}\nStates: ${states}\nTransitions: ${trans}`;
}

describe('pattern template cross-check fuzz', () => {
  it('Globally: LTL all-paths verdict matches CTL verdict (5 patterns x 200 models)', () => {
    const rand = mulberry32(20260814);
    let total = 0;
    let skipped = 0;
    for (const pattern of PATTERNS) {
      const cellDef = pattern.scopes.globally;
      const ltlText = instantiate(cellDef.ltl, { P: 'p', S: 's' });
      const ctlText = instantiate(cellDef.ctl!, { P: 'p', S: 's' });
      const ltlAst = parseLTL(ltlText);
      const ctlAst = parseCTL(ctlText);
      for (let i = 0; i < 200; i++) {
        total++;
        const model = randomModel(rand, ['p', 's'], i);
        const ltlRes = checkLTLAllPaths(model, ltlAst);
        if (ltlRes.kind === 'too-large') { skipped++; continue; }
        const ltlHolds = ltlRes.kind === 'holds';
        const ctlRes = checkCTL(model, ctlAst);
        if (ctlRes.verdict !== ltlHolds) {
          throw new Error(
            `LTL/CTL disagreement on '${pattern.id}' globally ` +
            `(LTL ${ltlHolds ? 'holds' : 'fails'}, CTL ${ctlRes.verdict}):\n` +
            serialize(model, ltlText, ctlText),
          );
        }
      }
    }
    console.info(`skip: ${skipped}/${total}`);
    expect(skipped).toBeLessThan(total * 0.1);
  });

  it('Before-r and After-q: LTL all-paths verdict matches CTL* verdict (5 patterns x 2 scopes x 100 models)', () => {
    const rand = mulberry32(20260815);
    let total = 0;
    let skipped = 0;
    for (const pattern of PATTERNS) {
      for (const scope of ['before', 'after'] as const) {
        const cellDef = pattern.scopes[scope];
        const fill = { P: 'p', S: 's', q: 'q', r: 'r' } as const;
        const ltlText = instantiate(cellDef.ltl, fill);
        const starText = instantiate(cellDef.ctlstar, fill);
        const ltlAst = parseLTL(ltlText);
        const starAst = parseCTLStar(starText);
        for (let i = 0; i < 100; i++) {
          total++;
          const model = randomModel(rand, ['p', 's', 'q', 'r'], i);
          const ltlRes = checkLTLAllPaths(model, ltlAst);
          if (ltlRes.kind === 'too-large') { skipped++; continue; }
          const ltlHolds = ltlRes.kind === 'holds';
          let starVerdict: boolean | null;
          try {
            starVerdict = checkCTLStar(model, starAst).verdict;
          } catch (e) {
            if (e instanceof AutomatonTooLarge) { skipped++; continue; }
            throw e;
          }
          if (starVerdict !== ltlHolds) {
            throw new Error(
              `LTL/CTL* disagreement on '${pattern.id}' ${scope} ` +
              `(LTL ${ltlHolds ? 'holds' : 'fails'}, CTL* ${starVerdict}):\n` +
              serialize(model, ltlText, starText),
            );
          }
        }
      }
    }
    console.info(`skip: ${skipped}/${total}`);
    expect(skipped).toBeLessThan(total * 0.1);
  });
});
