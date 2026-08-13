import { Logic } from './types';

export type TokenClass =
  | 'quantifier' | 'temporal' | 'prop' | 'connective' | 'paren' | 'hole' | 'space' | 'error';

export interface HToken { text: string; cls: TokenClass }

const CTL_QUANT = new Set(['AG', 'EF', 'AF', 'EG', 'AX', 'EX', 'A', 'E']);
const STAR_QUANT = new Set(['A', 'E']);
const LTL_TEMPORAL = new Set(['X', 'F', 'G', 'U']);
const WORD_CONNECTIVE = new Set(['true', 'false']);

function identClass(word: string, logic: Logic): TokenClass {
  if (WORD_CONNECTIVE.has(word)) return 'connective';
  if (logic === 'ctl') {
    if (CTL_QUANT.has(word)) return 'quantifier';
    if (word === 'U') return 'temporal';
    return 'prop';
  }
  if (logic === 'ltl') {
    return LTL_TEMPORAL.has(word) ? 'temporal' : 'prop';
  }
  // ctlstar
  if (STAR_QUANT.has(word)) return 'quantifier';
  if (LTL_TEMPORAL.has(word)) return 'temporal';
  return 'prop';
}

/** Coloring tokenizer — approximate by design: it colors, it does not parse.
 *  Concatenating the returned texts always reconstructs the input exactly. */
export function tokenize(text: string, logic: Logic): HToken[] {
  const out: HToken[] = [];
  const re = /(\s+)|([A-Za-z_][A-Za-z0-9_]*)|(<->|->|↔|→)|([&|!∧∨¬])|([()[\]])|(▢)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const [, space, ident, arrow, sym, paren, hole, other] = m;
    if (space !== undefined) out.push({ text: space, cls: 'space' });
    else if (ident !== undefined) out.push({ text: ident, cls: identClass(ident, logic) });
    else if (arrow !== undefined) out.push({ text: arrow, cls: 'connective' });
    else if (sym !== undefined) out.push({ text: sym, cls: 'connective' });
    else if (paren !== undefined) out.push({ text: paren, cls: 'paren' });
    else if (hole !== undefined) out.push({ text: hole, cls: 'hole' });
    else out.push({ text: other!, cls: 'error' });
  }
  return out;
}
