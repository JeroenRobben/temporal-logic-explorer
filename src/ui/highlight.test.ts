import { describe, it, expect } from 'vitest';
import { tokenize } from './highlight';

function classes(text: string, logic: 'ctl' | 'ltl' | 'ctlstar'): string {
  return tokenize(text, logic).filter((t) => t.cls !== 'space').map((t) => `${t.text}:${t.cls}`).join(' ');
}

describe('tokenize', () => {
  it('classifies CTL tokens', () => {
    expect(classes('AG (p -> EF q)', 'ctl'))
      .toBe('AG:quantifier (:paren p:prop ->:connective EF:quantifier q:prop ):paren');
  });
  it('classifies LTL tokens; A/E are plain props there', () => {
    expect(classes('G F p U A', 'ltl'))
      .toBe('G:temporal F:temporal p:prop U:temporal A:prop');
  });
  it('classifies CTL* quantifiers and temporals distinctly', () => {
    expect(classes('A G (E F p)', 'ctlstar'))
      .toBe('A:quantifier G:temporal (:paren E:quantifier F:temporal p:prop ):paren');
  });
  it('marks holes and reconstructs input exactly', () => {
    const text = 'A[▢ U ▢]';
    const toks = tokenize(text, 'ctl');
    expect(toks.filter((t) => t.cls === 'hole').length).toBe(2);
    expect(toks.map((t) => t.text).join('')).toBe(text);
  });
  it('unknown characters are error-classed, never dropped', () => {
    const toks = tokenize('p @ q', 'ctl');
    expect(toks.map((t) => t.text).join('')).toBe('p @ q');
    expect(toks.find((t) => t.text === '@')!.cls).toBe('error');
  });
  it('unicode connectives classify', () => {
    expect(classes('¬p ∧ q', 'ltl')).toBe('¬:connective p:prop ∧:connective q:prop');
  });
});
