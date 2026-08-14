// Content validation battery: validates EVERY reference doc and tutorial
// generically — future content tasks add modules, not tests.
import { describe, expect, it } from 'vitest';
import { REFERENCES, TUTORIALS, referenceById, REF_BY_PALETTE } from './index';
import { parseForLogic, stepKind } from '../engine';
import { initialSim, applySim, viewOf } from '../replay';
import { validateLasso } from '../../core/trace';

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

describe('map completeness', () => {
  // Fixture copies of the palette() label lists in src/ui/Composer.tsx —
  // KEEP IN SYNC with that function when palette buttons change. The UI-level
  // twin (learn-links.test.tsx) asserts every rendered button gets a mapped ?;
  // this data-level check pins the exact label inventory per logic.
  const BOOL_LABELS = ['∧', '∨', '¬', '→', '↔'];
  const PALETTE_LABELS: Record<string, string[]> = {
    ctl: ['AG', 'EF', 'AF', 'EG', 'AX', 'EX', 'A[▢U▢]', 'E[▢U▢]', ...BOOL_LABELS],
    ltl: ['G', 'F', 'X', '▢U▢', ...BOOL_LABELS],
    ctlstar: ['A', 'E', 'G', 'F', 'X', '▢U▢', ...BOOL_LABELS],
  };

  for (const [logic, labels] of Object.entries(PALETTE_LABELS)) {
    it(`every ${logic} palette label maps to a resolvable reference`, () => {
      for (const label of labels) {
        const refId = REF_BY_PALETTE[label];
        expect(refId, `palette label ${label} (${logic}) missing from REF_BY_PALETTE`).toBeTruthy();
        expect(referenceById(refId), `REF_BY_PALETTE[${label}] → ${refId} does not resolve`).toBeTruthy();
      }
    });
  }

  it('every ReferenceDoc tutorialId resolves to an existing tutorial', () => {
    const tutIds = new Set(TUTORIALS.map((t) => t.id));
    for (const r of REFERENCES) {
      if (r.tutorialId) expect(tutIds.has(r.tutorialId), `${r.id} → ${r.tutorialId} dangling`).toBe(true);
    }
  });

  it('every tutorial is reachable from exactly one doc (tut-booleans: shared, ≥1)', () => {
    const refCount = new Map<string, number>();
    for (const r of REFERENCES) {
      if (r.tutorialId) refCount.set(r.tutorialId, (refCount.get(r.tutorialId) ?? 0) + 1);
    }
    for (const t of TUTORIALS) {
      const n = refCount.get(t.id) ?? 0;
      if (t.id === 'tut-booleans') expect(n, 'tut-booleans must be reachable from the boolean docs').toBeGreaterThanOrEqual(1);
      else expect(n, `${t.id} must be referenced by exactly one ReferenceDoc`).toBe(1);
    }
  });
});

describe('tutorial replay', () => {
  for (const t of TUTORIALS) {
    it(`${t.id}: models valid, formulas parse, checkpoints gated and solvable`, () => {
      let sim = initialSim();
      expect(stepKind(t.steps[t.steps.length - 1])).toBe('info'); // last step concludes
      // step 0 must pin the full workspace: model, formulas, and trace (null) —
      // leftover user traces must never pre-satisfy a later checkpoint.
      expect(t.steps[0].setup?.model, `${t.id} step 0 must pin model`).toBeTruthy();
      expect(t.steps[0].setup?.formulas, `${t.id} step 0 must pin formulas`).toBeTruthy();
      expect(t.steps[0].setup?.trace, `${t.id} step 0 must pin trace`).toBeNull();
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
          // Solution lassos must validate against the model in force at this step.
          const solTrace = step.solution!.trace;
          if (solTrace && solTrace.loopIndex !== null) {
            expect(
              validateLasso(sim.model, { stateIds: solTrace.stateIds, loopIndex: solTrace.loopIndex }),
              `${t.id}#${i} solution lasso must validate against the step's model`,
            ).toBeNull();
          }
        }
      }
    });
  }
});
