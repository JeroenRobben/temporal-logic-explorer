/**
 * `id` is a unique integer assigned during a single `parseCTL()` call
 * (nodes within that call's resulting tree get distinct ids). It is
 * NOT globally unique: separate `parseCTL()` calls restart id
 * assignment from 0, so ids must never be compared across trees
 * produced by different `parseCTL()` invocations.
 */
export type CTLNode =
  | { id: number; kind: 'true' | 'false' }
  | { id: number; kind: 'prop'; name: string }
  | { id: number; kind: 'not'; child: CTLNode }
  | { id: number; kind: 'and' | 'or' | 'implies' | 'iff'; left: CTLNode; right: CTLNode }
  | { id: number; kind: 'EX' | 'AX' | 'EF' | 'AF' | 'EG' | 'AG'; child: CTLNode }
  | { id: number; kind: 'EU' | 'AU'; left: CTLNode; right: CTLNode };

export class ParseError extends Error {
  constructor(message: string, public pos: number, public hint?: string) {
    super(message);
    this.name = 'ParseError';
  }
}

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

const UNARY_TEMPORAL = new Set(['AX', 'EX', 'AF', 'EF', 'AG', 'EG']);
const LTL_PATH_OP = /^[FGXU]+$/;

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
  private node<T extends Omit<CTLNode, 'id'>>(n: T): CTLNode {
    return { id: this.nextId++, ...n } as CTLNode;
  }
  private startsFormula(t: Token): boolean {
    return t.kind === 'ident' || t.kind === 'lparen' || t.kind === 'not';
  }

  parse(): CTLNode {
    const n = this.parseIff();
    const t = this.peek();
    if (t.kind !== 'eof') throw new ParseError(`Unexpected '${t.text}'`, t.pos);
    return n;
  }

  private parseIff(): CTLNode {
    let left = this.parseImplies();
    while (this.peek().kind === 'iff') {
      this.next();
      left = this.node({ kind: 'iff', left, right: this.parseImplies() });
    }
    return left;
  }

  private parseImplies(): CTLNode {
    const left = this.parseOr();
    if (this.peek().kind === 'implies') {
      this.next();
      return this.node({ kind: 'implies', left, right: this.parseImplies() });
    }
    return left;
  }

  private parseOr(): CTLNode {
    let left = this.parseAnd();
    while (this.peek().kind === 'or') {
      this.next();
      left = this.node({ kind: 'or', left, right: this.parseAnd() });
    }
    return left;
  }

  private parseAnd(): CTLNode {
    let left = this.parseUnary();
    while (this.peek().kind === 'and') {
      this.next();
      left = this.node({ kind: 'and', left, right: this.parseUnary() });
    }
    return left;
  }

  private parseUnary(): CTLNode {
    this.depth++;
    if (this.depth > MAX_DEPTH) {
      throw new ParseError('Formula is too deeply nested', this.peek().pos);
    }
    try {
      const t = this.peek();
      if (t.kind === 'not') {
        this.next();
        return this.node({ kind: 'not', child: this.parseUnary() });
      }
      if (t.kind === 'ident') {
        if (UNARY_TEMPORAL.has(t.text)) {
          this.next();
          const kind = t.text as 'AX' | 'EX' | 'AF' | 'EF' | 'AG' | 'EG';
          return this.node({ kind, child: this.parseUnary() });
        }
        if ((t.text === 'A' || t.text === 'E') && this.peek(1).kind === 'lbracket') {
          this.next(); this.next(); // A/E, [
          const left = this.parseIff();
          const u = this.expect('ident', "'U'");
          if (u.text !== 'U') throw new ParseError(`Expected 'U', got '${u.text}'`, u.pos);
          const right = this.parseIff();
          this.expect('rbracket', "']'");
          return this.node({ kind: t.text === 'A' ? 'AU' : 'EU', left, right });
        }
        if (LTL_PATH_OP.test(t.text) && this.startsFormula(this.peek(1))) {
          throw new ParseError(
            `'${t.text}' is a path formula — in CTL every temporal operator needs a path quantifier`,
            t.pos,
            "Pair each of F/G/X with a path quantifier (A or E), e.g. AF AG p instead of FG p.",
          );
        }
      }
      return this.parseAtom();
    } finally {
      this.depth--;
    }
  }

  private parseAtom(): CTLNode {
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

export function parseCTL(input: string): CTLNode {
  return new Parser(lex(input)).parse();
}

const PREC: Record<string, number> = {
  iff: 1, implies: 2, or: 3, and: 4,
  not: 5, EX: 5, AX: 5, EF: 5, AF: 5, EG: 5, AG: 5,
  EU: 6, AU: 6, prop: 6, true: 6, false: 6,
};

export function pretty(n: CTLNode): string {
  return prettyPrec(n, 0);
}

function prettyPrec(n: CTLNode, parent: number): string {
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
    case 'iff': return wrap(`${prettyPrec(n.left, p + 1)} ↔ ${prettyPrec(n.right, p)}`);
    case 'EU': return `E[${prettyPrec(n.left, 0)} U ${prettyPrec(n.right, 0)}]`;
    case 'AU': return `A[${prettyPrec(n.left, 0)} U ${prettyPrec(n.right, 0)}]`;
    default:
      return wrap(`${n.kind} ${prettyPrec(n.child, p)}`);
  }
}
