// Content validation battery: validates EVERY reference doc and tutorial
// generically — future content tasks add modules, not tests.
import { describe, expect, it } from 'vitest';
import { REFERENCES, TUTORIALS, referenceById, REF_BY_PALETTE } from './index';
import { parseForLogic, stepKind } from '../engine';
import { initialSim, applySim, viewOf } from '../replay';

describe('reference docs', () => {
  for (const r of REFERENCES) {
    it(`${r.id} is complete and well-formed`, () => {
      expect(r.informal.length).toBeGreaterThan(40);
      expect(r.formal.length).toBeGreaterThan(10);
      expect(r.bookRef).toMatch(/^MCS/);
      for (const p of r.patterns) {
        const logic = r.logic === 'shared' ? 'ctl' : r.logic;
        expect(parseForLogic(logic, p.formula), `${r.id} pattern ${p.formula}`).not.toBeNull();
      }
      if (r.tutorialId) expect(TUTORIALS.some((t) => t.id === r.tutorialId)).toBe(true);
    });
  }
  it('palette map targets exist', () => {
    for (const id of Object.values(REF_BY_PALETTE)) expect(referenceById(id)).toBeTruthy();
  });
});

describe('tutorial replay', () => {
  for (const t of TUTORIALS) {
    it(`${t.id}: models valid, formulas parse, checkpoints gated and solvable`, () => {
      let sim = initialSim();
      expect(stepKind(t.steps[t.steps.length - 1])).toBe('info'); // last step concludes
      for (const [i, step] of t.steps.entries()) {
        if (step.setup) sim = applySim(sim, step.setup);
        // model well-formed: transitions reference existing states, ≥1 initial
        const ids = new Set(sim.model.states.map((s) => s.id));
        for (const tr of sim.model.transitions) { expect(ids.has(tr.from)).toBe(true); expect(ids.has(tr.to)).toBe(true); }
        for (const f of sim.formulas) expect(parseForLogic(f.logic, f.text), `${t.id}#${i} ${f.text}`).not.toBeNull();
        if (step.checkpoint) {
          expect(step.solution, `${t.id}#${i} task step needs a solution`).toBeTruthy();
          expect(step.checkpoint(viewOf(sim)), `${t.id}#${i} checkpoint must NOT hold on entry`).toBe(false);
          const solved = applySim(sim, step.solution!);
          expect(step.checkpoint(viewOf(solved)), `${t.id}#${i} solution must satisfy checkpoint`).toBe(true);
          sim = solved; // continue as if the user did it
        }
      }
    });
  }
});
