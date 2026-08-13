import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import FormulaPanel from './FormulaPanel';
import { Analysis, FormulaEntry } from './types';
import { parseCTL } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';
import { ParseError } from '../core/ctl-parser';

function entry(id: string, text: string, logic: FormulaEntry['logic']): FormulaEntry {
  return { id, text, logic };
}

function noop() { /* no-op */ }

function renderPanel(analyses: Analysis[]) {
  return render(
    <FormulaPanel
      analyses={analyses}
      selectedFormulaId={null}
      onSelect={noop}
      onAdd={noop}
      onRemove={noop}
      entryLogic="ctl"
    />,
  );
}

function row(container: HTMLElement, i = 0) {
  return container.querySelectorAll('.formula-row')[i];
}

describe('FormulaPanel verdict matrix', () => {
  it('CTL: error → warning mark, no badge crash', () => {
    const e = entry('f1', 'AG (', 'ctl');
    const analyses: Analysis[] = [{ entry: e, error: new ParseError('bad', 0), verdict: null }];
    const { container } = renderPanel(analyses);
    const r = row(container);
    expect(r.querySelector('.verdict')!.textContent).toBe('⚠');
    expect(r.querySelector('.badge')!.textContent).toBe('CTL');
  });

  it('CTL: verdict true → checkmark with true class', () => {
    const e = entry('f1', 'AG EF p', 'ctl');
    const ast = parseCTL(e.text);
    const analyses: Analysis[] = [{ entry: e, ast, verdict: true }];
    const { container } = renderPanel(analyses);
    const r = row(container);
    const v = r.querySelector('.verdict')!;
    expect(v.textContent).toBe('✓');
    expect(v.className).toContain('true');
  });

  it('CTL: verdict false → cross with false class', () => {
    const e = entry('f1', 'AF p', 'ctl');
    const ast = parseCTL(e.text);
    const analyses: Analysis[] = [{ entry: e, ast, verdict: false }];
    const { container } = renderPanel(analyses);
    const r = row(container);
    const v = r.querySelector('.verdict')!;
    expect(v.textContent).toBe('✗');
    expect(v.className).toContain('false');
  });

  it('CTL: verdict null → dash with none class', () => {
    const e = entry('f1', 'EX p', 'ctl');
    const ast = parseCTL(e.text);
    const analyses: Analysis[] = [{ entry: e, ast, verdict: null }];
    const { container } = renderPanel(analyses);
    const r = row(container);
    const v = r.querySelector('.verdict')!;
    expect(v.textContent).toBe('–');
    expect(v.className).toContain('none');
  });

  it('LTL: allPaths holds → second mark ∀✓ true class', () => {
    const e = entry('f1', 'G p', 'ltl');
    const ltlAst = parseLTL(e.text);
    const analyses: Analysis[] = [{
      entry: e, ltlAst, verdict: true,
      allPaths: { kind: 'holds' } as never,
    }];
    const { container } = renderPanel(analyses);
    const marks = [...row(container).querySelectorAll('.verdict')];
    expect(marks.length).toBe(2);
    expect(marks[1].textContent).toBe('∀✓');
    expect(marks[1].className).toContain('true');
  });

  it('LTL: allPaths fails → second mark ∀✗ false class', () => {
    const e = entry('f1', 'F p', 'ltl');
    const ltlAst = parseLTL(e.text);
    const analyses: Analysis[] = [{
      entry: e, ltlAst, verdict: false,
      allPaths: { kind: 'fails' } as never,
    }];
    const { container } = renderPanel(analyses);
    const marks = [...row(container).querySelectorAll('.verdict')];
    expect(marks[1].textContent).toBe('∀✗');
    expect(marks[1].className).toContain('false');
  });

  it('LTL: allPaths too-large → second mark ∀⚠ none class', () => {
    const e = entry('f1', 'F p', 'ltl');
    const ltlAst = parseLTL(e.text);
    const analyses: Analysis[] = [{
      entry: e, ltlAst, verdict: null,
      allPaths: { kind: 'too-large' } as never,
    }];
    const { container } = renderPanel(analyses);
    const marks = [...row(container).querySelectorAll('.verdict')];
    expect(marks[1].textContent).toBe('∀⚠');
    expect(marks[1].className).toContain('none');
  });

  it('LTL: allPaths no-initial → second mark ∀– none class', () => {
    const e = entry('f1', 'F p', 'ltl');
    const ltlAst = parseLTL(e.text);
    const analyses: Analysis[] = [{
      entry: e, ltlAst, verdict: null,
      allPaths: { kind: 'no-initial' } as never,
    }];
    const { container } = renderPanel(analyses);
    const marks = [...row(container).querySelectorAll('.verdict')];
    expect(marks[1].textContent).toBe('∀–');
    expect(marks[1].className).toContain('none');
  });

  it('LTL: error suppresses the ∀ mark even if allPaths is present', () => {
    const e = entry('f1', 'F(', 'ltl');
    const analyses: Analysis[] = [{
      entry: e, error: new ParseError('bad', 0), verdict: null,
      allPaths: { kind: 'holds' } as never,
    }];
    const { container } = renderPanel(analyses);
    const marks = [...row(container).querySelectorAll('.verdict')];
    expect(marks.length).toBe(1); // only the primary ⚠ mark, no ∀ mark
    expect(marks[0].textContent).toBe('⚠');
  });

  it('CTL*: starTooLarge → warning mark', () => {
    const e = entry('f1', 'A G (E F p)', 'ctlstar');
    const starAst = parseCTLStar(e.text);
    const analyses: Analysis[] = [{ entry: e, starAst, verdict: null, starTooLarge: true }];
    const { container } = renderPanel(analyses);
    const r = row(container);
    expect(r.querySelector('.verdict')!.textContent).toBe('⚠');
  });

  it('badges: CTL/LTL/CTL* labels via LOGIC_LABEL', () => {
    const ctlE = entry('f1', 'AG p', 'ctl');
    const ltlE = entry('f2', 'G p', 'ltl');
    const starE = entry('f3', 'A G p', 'ctlstar');
    const analyses: Analysis[] = [
      { entry: ctlE, ast: parseCTL(ctlE.text), verdict: null },
      { entry: ltlE, ltlAst: parseLTL(ltlE.text), verdict: null },
      { entry: starE, starAst: parseCTLStar(starE.text), verdict: null },
    ];
    const { container } = renderPanel(analyses);
    const badges = [...container.querySelectorAll('.badge')].map((b) => b.textContent);
    expect(badges).toEqual(['CTL', 'LTL', 'CTL*']);
  });
});
