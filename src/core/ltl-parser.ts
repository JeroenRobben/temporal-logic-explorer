import { ParseError } from './ctl-parser';

export { ParseError };

/** LTL formula AST. Node ids are unique only within a single parseLTL() call —
 *  do not compare ids across trees from different calls. */
export type LTLNode =
  | { id: number; kind: 'true' | 'false' }
  | { id: number; kind: 'prop'; name: string }
  | { id: number; kind: 'not' | 'X' | 'F' | 'G'; child: LTLNode }
  | { id: number; kind: 'and' | 'or' | 'implies' | 'iff' | 'U'; left: LTLNode; right: LTLNode };

type TokKind =
  | 'ident' | 'lparen' | 'rparen' | 'lbracket' | 'rbracket'
  | 'not' | 'and' | 'or' | 'implies' | 'iff' | 'eof';

interface Token { kind: TokKind; text: string; pos: number }

function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) { i++; continue; }
    const push = (kind: TokKind, len: number) => {
      tokens.push({ kind, text: input.slice(i, i + len), pos: i });
      i += len;
    };
    if (c === '(') { push('lparen', 1); continue; }
    if (c === ')') { push('rparen', 1); continue; }
    if (c === '[') { push('lbracket', 1); continue; }
    if (c === ']') { push('rbracket', 1); continue; }
    if (c === '!' || c === '¬') { push('not', 1); continue; }
    if (c === '&' || c === '∧') { push('and', 1); continue; }
    if (c === '|' || c === '∨') { push('or', 1); continue; }
    if (input.startsWith('<->', i)) { push('iff', 3); continue; }
    if (c === '↔') { push('iff', 1); continue; }
    if (input.startsWith('->', i)) { push('implies', 2); continue; }
    if (c === '→') { push('implies', 1); continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      push('ident', j - i);
      continue;
    }
    throw new ParseError(`Unexpected character '${c}'`, i);
  }
  tokens.push({ kind: 'eof', text: '', pos: input.length });
  return tokens;
}

const UNARY_TEMPORAL = new Set(['X', 'F', 'G']);
const CTL_QUANTIFIED = /^[AE][XFGU]$/;
const MAX_DEPTH = 500;

class Parser {
  private i = 0;
  private nextId = 0;
  private depth = 0;
  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
  }
  private next(): Token { return this.tokens[this.i++]; }
  private expect(kind: TokKind, what: string): Token {
    const t = this.peek();
    if (t.kind !== kind) throw new ParseError(`Expected ${what}`, t.pos);
    return this.next();
  }
  private node<T extends Omit<LTLNode, 'id'>>(n: T): LTLNode {
    return { id: this.nextId++, ...n } as LTLNode;
  }
  private startsFormula(t: Token): boolean {
    return t.kind === 'ident' || t.kind === 'lparen' || t.kind === 'not';
  }

  parse(): LTLNode {
    const n = this.parseIff();
    const t = this.peek();
    if (t.kind !== 'eof') throw new ParseError(`Unexpected '${t.text}'`, t.pos);
    return n;
  }

  private parseIff(): LTLNode {
    let left = this.parseImplies();
    while (this.peek().kind === 'iff') {
      this.next();
      left = this.node({ kind: 'iff', left, right: this.parseImplies() });
    }
    return left;
  }

  private parseImplies(): LTLNode {
    const left = this.parseOr();
    if (this.peek().kind === 'implies') {
      this.next();
      return this.node({ kind: 'implies', left, right: this.parseImplies() });
    }
    return left;
  }

  private parseOr(): LTLNode {
    let left = this.parseAnd();
    while (this.peek().kind === 'or') {
      this.next();
      left = this.node({ kind: 'or', left, right: this.parseAnd() });
    }
    return left;
  }

  private parseAnd(): LTLNode {
    let left = this.parseUntil();
    while (this.peek().kind === 'and') {
      this.next();
      left = this.node({ kind: 'and', left, right: this.parseUntil() });
    }
    return left;
  }

  private parseUntil(): LTLNode {
    const left = this.parseUnary();
    const t = this.peek();
    if (t.kind === 'ident' && t.text === 'U') {
      this.next();
      return this.node({ kind: 'U', left, right: this.parseUntil() });
    }
    return left;
  }

  private parseUnary(): LTLNode {
    this.depth++;
    try {
      if (this.depth > MAX_DEPTH) {
        throw new ParseError('Formula is too deeply nested', this.peek().pos);
      }
      const t = this.peek();
      if (t.kind === 'not') {
        this.next();
        return this.node({ kind: 'not', child: this.parseUnary() });
      }
      if (t.kind === 'ident') {
        if (UNARY_TEMPORAL.has(t.text)) {
          this.next();
          const kind = t.text as 'X' | 'F' | 'G';
          return this.node({ kind, child: this.parseUnary() });
        }
        if (CTL_QUANTIFIED.test(t.text)
          || ((t.text === 'A' || t.text === 'E') && this.peek(1).kind === 'lbracket')) {
          throw new ParseError(
            `'${t.text}' uses a path quantifier — that's CTL, not LTL`,
            t.pos,
            'In LTL, drop the A/E: write G p, F p, X p, or p U q.',
          );
        }
        if (/^[XFG]{2,}$/.test(t.text) && this.startsFormula(this.peek(1))) {
          throw new ParseError(
            `'${t.text}' — LTL operators need spaces between them`,
            t.pos,
            `Write ${t.text.split('').join(' ')} p.`,
          );
        }
      }
      return this.parseAtom();
    } finally {
      this.depth--;
    }
  }

  private parseAtom(): LTLNode {
    const t = this.next();
    if (t.kind === 'ident') {
      if (t.text === 'true') return this.node({ kind: 'true' });
      if (t.text === 'false') return this.node({ kind: 'false' });
      return this.node({ kind: 'prop', name: t.text });
    }
    if (t.kind === 'lparen') {
      const n = this.parseIff();
      this.expect('rparen', "')'");
      return n;
    }
    throw new ParseError(
      t.kind === 'eof' ? 'Unexpected end of formula' : `Unexpected '${t.text}'`,
      t.pos,
    );
  }
}

export function parseLTL(input: string): LTLNode {
  return new Parser(lex(input)).parse();
}

const PREC: Record<string, number> = {
  iff: 1, implies: 2, or: 3, and: 4, U: 5,
  not: 6, X: 6, F: 6, G: 6,
  prop: 7, true: 7, false: 7,
};

export function pretty(n: LTLNode): string {
  return prettyPrec(n, 0);
}

function prettyPrec(n: LTLNode, parent: number): string {
  const p = PREC[n.kind];
  const wrap = (s: string) => (p < parent ? `(${s})` : s);
  switch (n.kind) {
    case 'true': return 'true';
    case 'false': return 'false';
    case 'prop': return n.name;
    case 'not': return wrap(`¬${prettyPrec(n.child, p)}`);
    case 'and': return wrap(`${prettyPrec(n.left, p)} ∧ ${prettyPrec(n.right, p)}`);
    case 'or': return wrap(`${prettyPrec(n.left, p)} ∨ ${prettyPrec(n.right, p)}`);
    case 'implies': return wrap(`${prettyPrec(n.left, p + 1)} → ${prettyPrec(n.right, p)}`);
    case 'iff': return wrap(`${prettyPrec(n.left, p)} ↔ ${prettyPrec(n.right, p)}`);
    // U is always parenthesized to sidestep precedence ambiguity in output
    case 'U': return `(${prettyPrec(n.left, PREC.U)} U ${prettyPrec(n.right, PREC.U)})`;
    default: return wrap(`${n.kind} ${prettyPrec(n.child, p)}`);
  }
}
