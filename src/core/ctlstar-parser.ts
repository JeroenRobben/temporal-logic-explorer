import { ParseError } from './ctl-parser';

export { ParseError };

/** CTL* AST: LTL node kinds plus path quantifiers A/E. Ids are unique only
 *  within a single parseCTLStar() call. */
export type StarNode =
  | { id: number; kind: 'true' | 'false' }
  | { id: number; kind: 'prop'; name: string }
  | { id: number; kind: 'not' | 'X' | 'F' | 'G' | 'A' | 'E'; child: StarNode }
  | { id: number; kind: 'and' | 'or' | 'implies' | 'iff' | 'U'; left: StarNode; right: StarNode };

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
const QUANTIFIERS = new Set(['A', 'E']);
const GLUED_CTL = /^[AE][XFGU]$/;
const GLUED_LTL = /^[XFG]{2,}$/;
const MAX_DEPTH = 500;

class Parser {
  private i = 0;
  private nextId = 0;
  private depth = 0;
  /** node id → source position of the token that produced it */
  readonly posOf = new Map<number, number>();
  constructor(private tokens: Token[], private input: string) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)];
  }
  private next(): Token { return this.tokens[this.i++]; }
  private expect(kind: TokKind, what: string): Token {
    const t = this.peek();
    if (t.kind !== kind) throw new ParseError(`Expected ${what}`, t.pos);
    return this.next();
  }
  private replaceToken(t: Token, replacement: string): string {
    return this.input.slice(0, t.pos) + replacement + this.input.slice(t.pos + t.text.length);
  }
  private node<T extends Omit<StarNode, 'id'>>(n: T, pos: number): StarNode {
    const built = { id: this.nextId++, ...n } as StarNode;
    this.posOf.set(built.id, pos);
    return built;
  }
  private startsFormula(t: Token): boolean {
    return t.kind === 'ident' || t.kind === 'lparen' || t.kind === 'not';
  }

  parse(): StarNode {
    const n = this.parseIff();
    const t = this.peek();
    if (t.kind !== 'eof') throw new ParseError(`Unexpected '${t.text}'`, t.pos);
    return n;
  }

  private parseIff(): StarNode {
    let left = this.parseImplies();
    while (this.peek().kind === 'iff') {
      const t = this.next();
      left = this.node({ kind: 'iff', left, right: this.parseImplies() }, t.pos);
    }
    return left;
  }

  private parseImplies(): StarNode {
    const left = this.parseOr();
    if (this.peek().kind === 'implies') {
      const t = this.next();
      return this.node({ kind: 'implies', left, right: this.parseImplies() }, t.pos);
    }
    return left;
  }

  private parseOr(): StarNode {
    let left = this.parseAnd();
    while (this.peek().kind === 'or') {
      const t = this.next();
      left = this.node({ kind: 'or', left, right: this.parseAnd() }, t.pos);
    }
    return left;
  }

  private parseAnd(): StarNode {
    let left = this.parseUntil();
    while (this.peek().kind === 'and') {
      const t = this.next();
      left = this.node({ kind: 'and', left, right: this.parseUntil() }, t.pos);
    }
    return left;
  }

  private parseUntil(): StarNode {
    const left = this.parseUnary();
    const t = this.peek();
    if (t.kind === 'ident' && t.text === 'U') {
      this.next();
      return this.node({ kind: 'U', left, right: this.parseUntil() }, t.pos);
    }
    return left;
  }

  private parseUnary(): StarNode {
    this.depth++;
    try {
      if (this.depth > MAX_DEPTH) {
        throw new ParseError('Formula is too deeply nested', this.peek().pos);
      }
      const t = this.peek();
      if (t.kind === 'not') {
        this.next();
        return this.node({ kind: 'not', child: this.parseUnary() }, t.pos);
      }
      if (t.kind === 'ident') {
        if (UNARY_TEMPORAL.has(t.text)) {
          this.next();
          const kind = t.text as 'X' | 'F' | 'G';
          return this.node({ kind, child: this.parseUnary() }, t.pos);
        }
        if (QUANTIFIERS.has(t.text)) {
          if (this.peek(1).kind === 'lbracket') {
            const open = this.peek(1).pos;
            let depth = 0;
            let close = -1;
            for (let j = open; j < this.input.length; j++) {
              if (this.input[j] === '[') depth++;
              else if (this.input[j] === ']') { depth--; if (depth === 0) { close = j; break; } }
            }
            const fix = close !== -1
              ? {
                  label: `Use parentheses: ${t.text} (…)`,
                  replacement: this.input.slice(0, open) + ' (' + this.input.slice(open + 1, close) + ')' + this.input.slice(close + 1),
                }
              : undefined;
            throw new ParseError(`'${t.text}[…]' is CTL bracket syntax`, t.pos, `In CTL* write ${t.text} (p U q).`, fix);
          }
          if (this.startsFormula(this.peek(1))) {
            this.next();
            const kind = t.text as 'A' | 'E';
            return this.node({ kind, child: this.parseUnary() }, t.pos);
          }
        }
        if (GLUED_CTL.test(t.text) && this.startsFormula(this.peek(1))) {
          throw new ParseError(
            `'${t.text}' — in CTL* the quantifier and operator are separate`,
            t.pos,
            `Write ${t.text[0]} ${t.text[1]} p.`,
            { label: `Insert space: ${t.text[0]} ${t.text[1]}`, replacement: this.replaceToken(t, `${t.text[0]} ${t.text[1]}`) },
          );
        }
        if (GLUED_LTL.test(t.text) && this.startsFormula(this.peek(1))) {
          throw new ParseError(
            `'${t.text}' — operators need spaces between them`,
            t.pos,
            `Write ${t.text.split('').join(' ')} p.`,
            { label: `Insert spaces: ${t.text.split('').join(' ')}`, replacement: this.replaceToken(t, t.text.split('').join(' ')) },
          );
        }
      }
      return this.parseAtom();
    } finally {
      this.depth--;
    }
  }

  private parseAtom(): StarNode {
    const t = this.next();
    if (t.kind === 'ident') {
      if (t.text === 'true') return this.node({ kind: 'true' }, t.pos);
      if (t.text === 'false') return this.node({ kind: 'false' }, t.pos);
      return this.node({ kind: 'prop', name: t.text }, t.pos);
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

/** Bottom-up state/path classification. State: atoms, quantified nodes, and
 *  boolean connectives whose children are all state-level. Path: anything with
 *  a bare temporal operator at or above it. */
export function classify(root: StarNode): Map<number, 'state' | 'path'> {
  const m = new Map<number, 'state' | 'path'>();
  (function walk(n: StarNode): 'state' | 'path' {
    let cls: 'state' | 'path';
    switch (n.kind) {
      case 'true': case 'false': case 'prop':
        cls = 'state';
        break;
      case 'A': case 'E':
        walk(n.child);
        cls = 'state';
        break;
      case 'X': case 'F': case 'G':
        walk(n.child);
        cls = 'path';
        break;
      case 'U':
        walk(n.left);
        walk(n.right);
        cls = 'path';
        break;
      case 'not':
        cls = walk(n.child);
        break;
      default: {
        const l = walk(n.left);
        const r = walk(n.right);
        cls = l === 'state' && r === 'state' ? 'state' : 'path';
      }
    }
    m.set(n.id, cls);
    return cls;
  })(root);
  return m;
}

export function parseCTLStar(input: string): StarNode {
  const parser = new Parser(lex(input), input);
  const root = parser.parse();
  const cls = classify(root);
  if (cls.get(root.id) === 'path') {
    // Point at the leftmost top-level temporal contributor for a useful position.
    let cursor: StarNode = root;
    for (;;) {
      if (cursor.kind === 'X' || cursor.kind === 'F' || cursor.kind === 'G' || cursor.kind === 'U') break;
      if ('child' in cursor && cls.get(cursor.child.id) === 'path') { cursor = cursor.child; continue; }
      if ('left' in cursor) {
        cursor = cls.get(cursor.left.id) === 'path' ? cursor.left : cursor.right;
        continue;
      }
      break;
    }
    throw new ParseError(
      'Temporal operators need a path quantifier here',
      parser.posOf.get(cursor.id) ?? 0,
      'Wrap the path formula in A (…) or E (…).',
    );
  }
  return root;
}

const PREC: Record<string, number> = {
  iff: 1, implies: 2, or: 3, and: 4, U: 5,
  not: 6, X: 6, F: 6, G: 6, A: 6, E: 6,
  prop: 7, true: 7, false: 7,
};

export function pretty(n: StarNode): string {
  return prettyPrec(n, 0);
}

function prettyPrec(n: StarNode, parent: number): string {
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
    case 'U': return `(${prettyPrec(n.left, PREC.U)} U ${prettyPrec(n.right, PREC.U)})`;
    case 'A': case 'E': {
      // Parenthesize binary path children so A (p U q) round-trips unambiguously.
      // U children self-parenthesize (see the U case above), so they are excluded
      // here to avoid double parens.
      const c = n.child;
      const needsParens = c.kind === 'and' || c.kind === 'or'
        || c.kind === 'implies' || c.kind === 'iff';
      const inner = needsParens ? `(${prettyPrec(c, 0)})` : prettyPrec(c, p);
      return wrap(`${n.kind} ${inner}`);
    }
    default: return wrap(`${n.kind} ${prettyPrec(n.child, p)}`);
  }
}
