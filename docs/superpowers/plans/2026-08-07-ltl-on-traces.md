# LTL on Lasso Traces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LTL formulas evaluated on one active lasso trace through the Kripke structure, with a subformula-matrix timeline pane, canvas trace recording, and per-formula logic tags.

**Architecture:** Three new pure core modules (`ltl-parser`, `trace`, `ltl-checker` → per-position truth rows) mirroring the CTL stack; UI adds a `logic` tag to formulas, a bottom Timeline pane (trace strip + subformula matrix), and a canvas record mode with a violet trace overlay. CTL paths untouched.

**Tech Stack:** Existing React 18 + TS + Vite + Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-07-ltl-on-traces-design.md`
**Baseline:** branch `feature/ltl-traces`, 72 tests passing.

---

## File map

```
src/core/ltl-parser.ts     — NEW: LTL AST + parser + pretty (shares ParseError with ctl-parser)
src/core/ltl-parser.test.ts— NEW
src/core/trace.ts          — NEW: Lasso type, validateLasso, validatePrefix, nextPosition, propsAt
src/core/trace.test.ts     — NEW
src/core/ltl-checker.ts    — NEW: checkLTL → Map<nodeId, boolean[]>
src/core/ltl-checker.test.ts—NEW
src/ui/types.ts            — MODIFY: Logic, FormulaEntry.logic, PendingLasso, Analysis reshaped
src/ui/storage.ts          — MODIFY: SavedState.trace, logic defaulting
src/ui/examples.ts         — MODIFY: logic tags + one LTL example formula
src/ui/Header.tsx          — MODIFY: live LTL/CTL entry-mode tabs
src/ui/FormulaPanel.tsx    — MODIFY: logic badges, unified verdict
src/ui/Inspector.tsx       — MODIFY: LTL formula branch, RESERVED_NAMES += X F G
src/ui/Canvas.tsx          — MODIFY: record mode, trace overlay, hover ring
src/ui/Timeline.tsx        — NEW: trace strip + subformula matrix
src/ui/App.tsx             — MODIFY: trace state, recording, analyses branch, Timeline wiring
src/styles.css             — MODIFY: badge, timeline, pulse styles
src/ui/App.test.tsx        — MODIFY: integration tests
README.md                  — MODIFY
```

---

### Task 1: LTL parser

**Files:**
- Create: `src/core/ltl-parser.ts`
- Test: `src/core/ltl-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/ltl-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLTL, pretty, ParseError, LTLNode } from './ltl-parser';

function kinds(n: LTLNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': case 'X': case 'F': case 'G':
      return `${n.kind}(${kinds(n.child)})`;
    default:
      return `${n.kind}(${kinds(n.left)},${kinds(n.right)})`;
  }
}

describe('parseLTL', () => {
  it('parses atoms and unary temporals', () => {
    expect(kinds(parseLTL('p'))).toBe('p');
    expect(kinds(parseLTL('X F G p'))).toBe('X(F(G(p)))');
    expect(kinds(parseLTL('G F p'))).toBe('G(F(p))');
  });
  it('parses until, right-associative', () => {
    expect(kinds(parseLTL('p U q'))).toBe('U(p,q)');
    expect(kinds(parseLTL('p U q U r'))).toBe('U(p,U(q,r))');
  });
  it('precedence: unary > U > and > or > implies > iff', () => {
    expect(kinds(parseLTL('F p U q'))).toBe('U(F(p),q)');
    expect(kinds(parseLTL('!p U q'))).toBe('U(not(p),q)');
    expect(kinds(parseLTL('p U q & r'))).toBe('and(U(p,q),r)');
    expect(kinds(parseLTL('p | q U r'))).toBe('or(p,U(q,r))');
    expect(kinds(parseLTL('p -> G q'))).toBe('implies(p,G(q))');
    expect(kinds(parseLTL('p <-> q -> r'))).toBe('iff(p,implies(q,r))');
  });
  it('accepts unicode operators', () => {
    expect(kinds(parseLTL('¬p ∧ G q'))).toBe('and(not(p),G(q))');
  });
  it('assigns unique ids per parse', () => {
    const n = parseLTL('G (p & F q)');
    const ids: number[] = [];
    (function walk(m: LTLNode) {
      ids.push(m.id);
      if ('child' in m) walk(m.child);
      if ('left' in m) { walk(m.left); walk(m.right); }
    })(n);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('reports position on syntax errors', () => {
    try {
      parseLTL('p & ');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).pos).toBe(4);
    }
  });
  it('rejects trailing garbage', () => {
    expect(() => parseLTL('p q')).toThrow(ParseError);
  });
  it('hints that path quantifiers are CTL', () => {
    for (const bad of ['AG p', 'EF p', 'AX p']) {
      try {
        parseLTL(bad);
        expect.fail('should throw');
      } catch (e) {
        expect((e as ParseError).hint).toMatch(/drop the A\/E/i);
      }
    }
    expect(() => parseLTL('A[p U q]')).toThrow(/path quantifier/i);
  });
  it('hints about missing spaces in FG-style input', () => {
    try {
      parseLTL('FG p');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).hint).toMatch(/F G/);
    }
  });
  it('rejects overly deep nesting with ParseError', () => {
    expect(() => parseLTL('!'.repeat(10000) + 'p')).toThrow(ParseError);
  });
});

describe('pretty (LTL)', () => {
  it('round-trips with U always parenthesized', () => {
    expect(pretty(parseLTL('G F p'))).toBe('G F p');
    expect(pretty(parseLTL('p U q'))).toBe('(p U q)');
    expect(pretty(parseLTL('F p U q'))).toBe('(F p U q)');
    expect(pretty(parseLTL('!p & q'))).toBe('¬p ∧ q');
    expect(pretty(parseLTL('G (p -> F q)'))).toBe('G (p → F q)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./ltl-parser`. Existing 72 pass.

- [ ] **Step 3: Implement**

`src/core/ltl-parser.ts`:

```ts
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
    case 'iff': return wrap(`${prettyPrec(n.left, p + 1)} ↔ ${prettyPrec(n.right, p)}`);
    // U is always parenthesized to sidestep precedence ambiguity in output
    case 'U': return `(${prettyPrec(n.left, 0)} U ${prettyPrec(n.right, 0)})`;
    default: return wrap(`${n.kind} ${prettyPrec(n.child, p)}`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (72 + 12 = 84).

- [ ] **Step 5: Commit**

```bash
git add src/core/ltl-parser.ts src/core/ltl-parser.test.ts
git commit -m "feat: LTL parser with CTL-ism hints and unambiguous pretty-printing"
```

---

### Task 2: Trace module

**Files:**
- Create: `src/core/trace.ts`
- Test: `src/core/trace.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/trace.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { Lasso, validateLasso, validatePrefix, nextPosition, propsAt } from './trace';

const k: KripkeStructure = {
  states: [
    { id: 'a', name: 'a', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 'b', name: 'b', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'c', name: 'c', propositions: ['q'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' },
    { from: 'a', to: 'a' },
  ],
};

describe('validateLasso', () => {
  it('accepts a valid lasso', () => {
    expect(validateLasso(k, { stateIds: ['a', 'b', 'c'], loopIndex: 0 })).toBe(null);
    expect(validateLasso(k, { stateIds: ['a'], loopIndex: 0 })).toBe(null); // self-loop
  });
  it('rejects empty and out-of-range loops', () => {
    expect(validateLasso(k, { stateIds: [], loopIndex: 0 })).toMatch(/empty/);
    expect(validateLasso(k, { stateIds: ['a'], loopIndex: 1 })).toMatch(/loop/);
  });
  it('rejects unknown states and broken transitions', () => {
    expect(validateLasso(k, { stateIds: ['a', 'zzz'], loopIndex: 0 })).toMatch(/zzz/);
    expect(validateLasso(k, { stateIds: ['a', 'c'], loopIndex: 0 })).toMatch(/transition/);
  });
  it('rejects a missing loop-back transition', () => {
    // b -> a does not exist
    expect(validateLasso(k, { stateIds: ['a', 'b'], loopIndex: 0 })).toMatch(/loop/);
  });
});

describe('validatePrefix', () => {
  it('accepts valid prefixes and rejects broken ones', () => {
    expect(validatePrefix(k, ['a', 'b', 'c'])).toBe(null);
    expect(validatePrefix(k, [])).toBe(null); // empty prefix is fine (not yet started)
    expect(validatePrefix(k, ['a', 'c'])).toMatch(/transition/);
    expect(validatePrefix(k, ['nope'])).toMatch(/nope/);
  });
});

describe('helpers', () => {
  const l: Lasso = { stateIds: ['a', 'b', 'c'], loopIndex: 1 };
  it('nextPosition wraps to loopIndex', () => {
    expect(nextPosition(l, 0)).toBe(1);
    expect(nextPosition(l, 1)).toBe(2);
    expect(nextPosition(l, 2)).toBe(1);
  });
  it('propsAt reads state propositions', () => {
    expect(propsAt(k, l, 0)).toEqual(['p']);
    expect(propsAt(k, l, 2)).toEqual(['q']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./trace`.

- [ ] **Step 3: Implement**

`src/core/trace.ts`:

```ts
import { KripkeStructure, stateById } from './kripke';

/** A lasso trace: positions 0..n-1; the successor of position n-1 is loopIndex. */
export interface Lasso {
  stateIds: string[];
  loopIndex: number;
}

function hasTransition(k: KripkeStructure, from: string, to: string): boolean {
  return k.transitions.some((t) => t.from === from && t.to === to);
}

/** Null if valid, otherwise a human-readable problem description. */
export function validateLasso(k: KripkeStructure, lasso: Lasso): string | null {
  if (lasso.stateIds.length === 0) return 'trace is empty';
  if (!Number.isInteger(lasso.loopIndex)
    || lasso.loopIndex < 0 || lasso.loopIndex >= lasso.stateIds.length) {
    return 'loop index out of range';
  }
  const prefixError = validatePrefix(k, lasso.stateIds);
  if (prefixError) return prefixError;
  const last = lasso.stateIds[lasso.stateIds.length - 1];
  const loopTarget = lasso.stateIds[lasso.loopIndex];
  if (!hasTransition(k, last, loopTarget)) {
    return `no loop-back transition ${last} → ${loopTarget}`;
  }
  return null;
}

/** Validates a (possibly incomplete) walk: states exist, consecutive pairs are transitions. */
export function validatePrefix(k: KripkeStructure, stateIds: string[]): string | null {
  for (const id of stateIds) {
    if (!stateById(k, id)) return `state ${id} is not in the model`;
  }
  for (let i = 0; i + 1 < stateIds.length; i++) {
    if (!hasTransition(k, stateIds[i], stateIds[i + 1])) {
      return `no transition ${stateIds[i]} → ${stateIds[i + 1]}`;
    }
  }
  return null;
}

export function nextPosition(lasso: Lasso, i: number): number {
  return i + 1 < lasso.stateIds.length ? i + 1 : lasso.loopIndex;
}

export function propsAt(k: KripkeStructure, lasso: Lasso, i: number): string[] {
  return stateById(k, lasso.stateIds[i])?.propositions ?? [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (84 + 7 = 91).

- [ ] **Step 5: Commit**

```bash
git add src/core/trace.ts src/core/trace.test.ts
git commit -m "feat: lasso trace model with validation helpers"
```

---

### Task 3: LTL checker

**Files:**
- Create: `src/core/ltl-checker.ts`
- Test: `src/core/ltl-checker.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/ltl-checker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { parseLTL } from './ltl-parser';
import { Lasso } from './trace';
import { checkLTL } from './ltl-checker';

// work[w] -> error[] -> reset[r] -> work…  plus work self-loop
const k: KripkeStructure = {
  states: [
    { id: 'w', name: 'work', propositions: ['w'], isInitial: true, x: 0, y: 0 },
    { id: 'e', name: 'error', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 'r', name: 'reset', propositions: ['r'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 'w', to: 'w' }, { from: 'w', to: 'e' },
    { from: 'e', to: 'r' }, { from: 'r', to: 'w' },
  ],
};

const cycle: Lasso = { stateIds: ['w', 'e', 'r'], loopIndex: 0 };     // w e r w e r …
const stuck: Lasso = { stateIds: ['w'], loopIndex: 0 };               // w w w …
const prefixed: Lasso = { stateIds: ['w', 'w', 'e', 'r'], loopIndex: 1 }; // w (w e r)^ω

function row(lasso: Lasso, formula: string): boolean[] {
  const root = parseLTL(formula);
  return checkLTL(k, lasso, root).get(root.id)!;
}

describe('checkLTL', () => {
  it('props and booleans are pointwise', () => {
    expect(row(cycle, 'w')).toEqual([true, false, false]);
    expect(row(cycle, 'w | r')).toEqual([true, false, true]);
    expect(row(cycle, '!w')).toEqual([false, true, true]);
  });
  it('X wraps around the loop', () => {
    expect(row(cycle, 'X w')).toEqual([false, false, true]); // next of pos2 is pos0
    expect(row(stuck, 'X w')).toEqual([true]);
  });
  it('F sees the loop', () => {
    expect(row(cycle, 'F r')).toEqual([true, true, true]);
    expect(row(stuck, 'F r')).toEqual([false]);
  });
  it('G F r: true when r is inside the loop, false otherwise', () => {
    expect(row(cycle, 'G F r')).toEqual([true, true, true]);
    expect(row(stuck, 'G F r')).toEqual([false]);
  });
  it('F G w: false on the cycle (w not invariant in loop), true on stuck', () => {
    expect(row(cycle, 'F G w')).toEqual([false, false, false]);
    expect(row(stuck, 'F G w')).toEqual([true]);
  });
  it('U: q in the loop vs never', () => {
    expect(row(cycle, '!r U r')).toEqual([true, true, true]);
    expect(row(stuck, 'w U r')).toEqual([false]);
    expect(row(cycle, 'w U r')).toEqual([false, false, true]); // at pos1 w fails before r
  });
  it('prefix vs loop distinction', () => {
    // prefixed = w (w e r)^ω: G w false everywhere, F r true everywhere
    expect(row(prefixed, 'F r')).toEqual([true, true, true, true]);
    expect(row(prefixed, 'G F r')).toEqual([true, true, true, true]);
  });
  it('nested: G (w -> F r) on the cycle', () => {
    expect(row(cycle, 'G (w -> F r)')).toEqual([true, true, true]);
  });
  it('stores a row for every subformula, all of trace length', () => {
    const root = parseLTL('G (w -> F r)');
    const rows = checkLTL(k, cycle, root);
    let count = 0;
    (function walk(n: import('./ltl-parser').LTLNode) {
      count++;
      expect(rows.get(n.id)).toHaveLength(3);
      if ('child' in n) walk(n.child);
      if ('left' in n) { walk(n.left); walk(n.right); }
    })(root);
    expect(count).toBe(5); // G, ->, w, F, r
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./ltl-checker`.

- [ ] **Step 3: Implement**

`src/core/ltl-checker.ts`:

```ts
import { KripkeStructure } from './kripke';
import { LTLNode } from './ltl-parser';
import { Lasso, nextPosition, propsAt } from './trace';

/**
 * Evaluate an LTL formula on a lasso trace.
 * Returns, per subformula node id, the truth value at every trace position.
 *
 * F/G/U are computed by two backward sweeps: values are monotone in their
 * future value, and on a lasso two sweeps suffice for the loop to stabilize
 * (the first sweep may read a not-yet-final wrap-around value; the second
 * sweep sees the corrected one).
 */
export function checkLTL(k: KripkeStructure, lasso: Lasso, root: LTLNode): Map<number, boolean[]> {
  const n = lasso.stateIds.length;
  const results = new Map<number, boolean[]>();

  function backwardFix(init: boolean, step: (i: number, nextVal: boolean) => boolean): boolean[] {
    const row = new Array<boolean>(n).fill(init);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        row[i] = step(i, row[nextPosition(lasso, i)]);
      }
    }
    return row;
  }

  function ev(node: LTLNode): boolean[] {
    let row: boolean[];
    switch (node.kind) {
      case 'true': row = new Array<boolean>(n).fill(true); break;
      case 'false': row = new Array<boolean>(n).fill(false); break;
      case 'prop':
        row = Array.from({ length: n }, (_, i) => propsAt(k, lasso, i).includes(node.name));
        break;
      case 'not': { const c = ev(node.child); row = c.map((v) => !v); break; }
      case 'and': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => v && r[i]); break; }
      case 'or': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => v || r[i]); break; }
      case 'implies': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => !v || r[i]); break; }
      case 'iff': { const l = ev(node.left), r = ev(node.right); row = l.map((v, i) => v === r[i]); break; }
      case 'X': {
        const c = ev(node.child);
        row = Array.from({ length: n }, (_, i) => c[nextPosition(lasso, i)]);
        break;
      }
      case 'F': { const c = ev(node.child); row = backwardFix(false, (i, nx) => c[i] || nx); break; }
      case 'G': { const c = ev(node.child); row = backwardFix(true, (i, nx) => c[i] && nx); break; }
      case 'U': {
        const l = ev(node.left), r = ev(node.right);
        row = backwardFix(false, (i, nx) => r[i] || (l[i] && nx));
        break;
      }
    }
    results.set(node.id, row);
    return row;
  }

  ev(root);
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (91 + 9 = 100). If any expectation disagrees with the implementation, STOP and report — both are derived from LTL semantics and a mismatch means one of them is wrong.

- [ ] **Step 5: Commit**

```bash
git add src/core/ltl-checker.ts src/core/ltl-checker.test.ts
git commit -m "feat: LTL evaluation on lasso traces via two-sweep backward fixpoint"
```

---

### Task 4: UI foundations — logic tags, storage, tabs, panel, inspector

**Files:**
- Modify: `src/ui/types.ts`, `src/ui/storage.ts`, `src/ui/examples.ts`, `src/ui/Header.tsx`, `src/ui/FormulaPanel.tsx`, `src/ui/Inspector.tsx`, `src/ui/App.tsx`, `src/styles.css`

This task makes LTL formulas parse/evaluate and show verdicts — no trace-building UI yet (Tasks 5–6), so LTL verdicts stay `–` until then unless a trace arrives via localStorage.

- [ ] **Step 1: types.ts**

Replace the `FormulaEntry` and `Analysis` definitions (keep `Selection` as-is) with:

```ts
import { CTLNode, ParseError } from '../core/ctl-parser';
import { LTLNode } from '../core/ltl-parser';
import { EvaluationRecord } from '../core/ctl-checker';

export type Logic = 'ctl' | 'ltl';

export interface FormulaEntry {
  id: string;
  text: string;
  logic: Logic;
}

/** A trace being built: loopIndex null until the loop is closed. */
export interface PendingLasso {
  stateIds: string[];
  loopIndex: number | null;
}

export interface Analysis {
  entry: FormulaEntry;
  ast?: CTLNode;                     // CTL only
  ltlAst?: LTLNode;                  // LTL only
  error?: ParseError;
  record?: EvaluationRecord;         // CTL only
  ltlRows?: Map<number, boolean[]>;  // LTL only; absent without a complete trace
  /** Unified row verdict: CTL = over initial states; LTL = position 0; null = unknown. */
  verdict: boolean | null;
}
```

(Keep the existing `Selection` type below it.)

- [ ] **Step 2: storage.ts**

Extend `SavedState` and validation:

```ts
import { KripkeStructure } from '../core/kripke';
import { FormulaEntry, PendingLasso } from './types';
```

```ts
export interface SavedState {
  model: KripkeStructure;
  formulas: FormulaEntry[];
  trace?: PendingLasso | null;
}
```

In `validateSavedState`, replace the final formulas check with:

```ts
  if (!Array.isArray(o.formulas)) return false;
  if (!(o.formulas as unknown[]).every((f) => {
    const fe = f as Record<string, unknown>;
    return typeof fe.id === 'string' && typeof fe.text === 'string'
      && (fe.logic === undefined || fe.logic === 'ctl' || fe.logic === 'ltl');
  })) return false;
  if (o.trace !== undefined && o.trace !== null) {
    const tr = o.trace as Record<string, unknown>;
    if (!Array.isArray(tr.stateIds) || !tr.stateIds.every((s: unknown) => typeof s === 'string')) return false;
    if (tr.loopIndex !== null && (typeof tr.loopIndex !== 'number'
      || !Number.isInteger(tr.loopIndex) || tr.loopIndex < 0
      || tr.loopIndex >= tr.stateIds.length)) return false;
  }
  return true;
```

In `loadSaved`, after the validate check, normalize missing logic tags (v1 data):

```ts
    if (!validateSavedState(parsed)) return null;
    const normalized = normalizeSavedState(parsed);
    return {
      ...normalized,
      formulas: normalized.formulas.map((f) => ({ logic: 'ctl' as const, ...f })),
    };
```

(Adjust to the file's current structure — it already routes through `normalizeSavedState`; the only addition is the logic-defaulting map and the trace field passing through untouched.)

- [ ] **Step 3: examples.ts**

Add `logic: 'ctl'` to every existing formula entry in all three examples, and append to the Reset example's formulas:

```ts
      { id: 'f4', text: 'G F r', logic: 'ltl' }, // '–' until you build a trace; true iff reset is in the loop
```

- [ ] **Step 4: styles.css**

Append:

```css
.badge { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; padding: 1px 4px;
  border-radius: 3px; background: #e2e8f0; color: #4a5568; flex: 0 0 auto; }
.badge.ltl { background: #e9d8fd; color: #553c9a; }
```

- [ ] **Step 5: Header.tsx**

Extend props and make the LTL tab live as the entry-mode switch:

```ts
import { Logic } from './types';
```

Add to `HeaderProps`:

```ts
  entryLogic: Logic;
  onEntryLogic: (l: Logic) => void;
```

Replace the tabs block with:

```tsx
      <div className="tabs">
        <button className={`tab ${entryLogic === 'ltl' ? 'active' : ''}`}
          onClick={() => onEntryLogic('ltl')} title="New formulas are LTL (evaluated on the trace)">LTL</button>
        <button className={`tab ${entryLogic === 'ctl' ? 'active' : ''}`}
          onClick={() => onEntryLogic('ctl')} title="New formulas are CTL (evaluated on the structure)">CTL</button>
        <button className="tab" disabled title="Coming later">CTL*</button>
      </div>
```

(Destructure the two new props.)

- [ ] **Step 6: FormulaPanel.tsx**

Changes:
1. Import both pretty-printers and Logic:

```ts
import { pretty as prettyCTL } from '../core/ctl-parser';
import { pretty as prettyLTL } from '../core/ltl-parser';
import { Analysis } from './types';
```

2. Add prop `entryLogic: Logic` (import `Logic` from './types'); placeholder becomes:

```tsx
        placeholder={`Add ${entryLogic.toUpperCase()} formula — press Enter`}
```

3. Verdict now reads the unified field, and rows show a badge + right pretty-printer:

```tsx
          const verdict = a.error ? '⚠'
            : a.verdict === true ? '✓'
            : a.verdict === false ? '✗' : '–';
          const cls = a.verdict === true ? 'true'
            : a.verdict === false ? 'false' : 'none';
          const text = a.ast ? prettyCTL(a.ast) : a.ltlAst ? prettyLTL(a.ltlAst) : a.entry.text;
```

and in the row JSX, before the verdict span:

```tsx
              <span className={`badge ${a.entry.logic}`}>{a.entry.logic.toUpperCase()}</span>
```

with `<span className="text">{text}</span>` replacing the old expression. Add `title={a.verdict === null && !a.error && a.entry.logic === 'ltl' ? 'Build a trace to evaluate LTL formulas' : undefined}` on the row div.

- [ ] **Step 7: Inspector.tsx**

1. Extend the reserved list:

```ts
export const RESERVED_NAMES = ['true', 'false', 'A', 'E', 'U', 'X', 'F', 'G', 'AX', 'EX', 'AF', 'EF', 'AG', 'EG', 'AU', 'EU'];
```

2. Imports:

```ts
import { LTLNode, pretty as prettyLTL } from '../core/ltl-parser';
```

3. Add LTL glosses to the GLOSS map (keys don't collide with CTL's):

```ts
  X: 'in the next step',
  F: 'eventually',
  G: 'at every step from here on',
  U: 'the left holds until the right does',
```

4. Add LTL tree helpers next to the CTL ones:

```tsx
function childrenOfLTL(n: LTLNode): LTLNode[] {
  if ('child' in n) return [n.child];
  if ('left' in n) return [n.left, n.right];
  return [];
}

function labelOfLTL(n: LTLNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': return '¬';
    case 'and': return '∧';
    case 'or': return '∨';
    case 'implies': return '→';
    case 'iff': return '↔';
    case 'U': return '· U ·';
    default: return n.kind;
  }
}

function LTLNodeTree(props: {
  node: LTLNode; depth: number;
  selectedNodeId: number | null; onSelectNode: (id: number) => void;
}) {
  const { node, depth, selectedNodeId, onSelectNode } = props;
  return (
    <div>
      <div
        className={`node-row ${node.id === selectedNodeId ? 'selected' : ''}`}
        style={{ marginLeft: depth * 14 }}
        onClick={() => onSelectNode(node.id)}
        title={GLOSS[node.kind]}
      >
        <span className="swatch" style={{ background: colorForNode(node.id) }} />
        <span>{labelOfLTL(node)}</span>
        <span className="muted">{prettyLTL(node)}</span>
      </div>
      {childrenOfLTL(node).map((c) => (
        <LTLNodeTree key={c.id} node={c} depth={depth + 1}
          selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
      ))}
    </div>
  );
}
```

5. In the formula branch (`selection?.kind === 'formula' && analysis`), after the existing error branch, insert an LTL view BEFORE the CTL destructuring:

```tsx
    if (analysis.entry.logic === 'ltl' && analysis.ltlAst) {
      const { ltlAst, ltlRows } = analysis;
      const selectedLTLNode = selectedNodeId !== null
        ? (function find(n: LTLNode): LTLNode | undefined {
            if (n.id === selectedNodeId) return n;
            for (const c of childrenOfLTL(n)) { const r = find(c); if (r) return r; }
          })(ltlAst)
        : undefined;
      return (
        <div>
          <div className="section-title">Subformulas — rows in the timeline</div>
          <LTLNodeTree node={ltlAst} depth={0} selectedNodeId={selectedNodeId}
            onSelectNode={(id) => onSelectNode(id === selectedNodeId ? null : id)} />
          {selectedLTLNode && <div className="gloss">{GLOSS[selectedLTLNode.kind]}</div>}
          <div className="section-title">Verdict (trace position 0)</div>
          {ltlRows
            ? <div className="muted">{ltlRows.get(ltlAst.id)![0] ? '✓ holds' : '✗ fails'} on the current trace</div>
            : <div className="muted">No trace — build one (⏺ in the timeline) to evaluate.</div>}
        </div>
      );
    }
```

(The CTL path continues unchanged below; LTL formulas never reach the stepper/evidence sections.)

- [ ] **Step 8: App.tsx**

1. Imports: add

```ts
import { parseLTL } from '../core/ltl-parser';
import { checkLTL } from '../core/ltl-checker';
import { validateLasso } from '../core/trace';
import { Analysis, FormulaEntry, Logic, PendingLasso, Selection } from './types';
```

2. New state (near the other useState calls):

```tsx
  const [entryLogic, setEntryLogic] = useState<Logic>('ctl');
  const [trace, setTrace] = useState<PendingLasso | null>(initial.trace ?? null);
```

(`initial` already comes from `loadSaved() ?? {…}` — extend the fallback object with `trace: null`.)

3. Derive the complete lasso once:

```tsx
  const completeLasso = useMemo(() => {
    if (!trace || trace.loopIndex === null) return null;
    const lasso = { stateIds: trace.stateIds, loopIndex: trace.loopIndex };
    return validateLasso(model, lasso) === null ? lasso : null;
  }, [trace, model]);
```

4. Replace the analyses memo with the two-logic version:

```tsx
  const analyses: Analysis[] = useMemo(() =>
    formulas.map((entry) => {
      try {
        if (entry.logic === 'ltl') {
          const ltlAst = parseLTL(entry.text);
          const ltlRows = completeLasso ? checkLTL(model, completeLasso, ltlAst) : undefined;
          return {
            entry, ltlAst, ltlRows,
            verdict: ltlRows ? ltlRows.get(ltlAst.id)![0] : null,
          };
        }
        const ast = parseCTL(entry.text);
        const record = checkCTL(model, ast);
        return { entry, ast, record, verdict: record.verdict };
      } catch (e) {
        if (e instanceof ParseError) return { entry, error: e, verdict: null };
        throw e;
      }
    }), [formulas, model, completeLasso]);
```

(`ParseError` from ctl-parser is the shared class — ltl-parser re-exports the same one, so the single instanceof covers both.)

5. Persistence: `useEffect(() => { save({ model, formulas, trace }); }, [model, formulas, trace]);` and `loadState` sets `setTrace(s.trace ?? null)`; `onAdd` in FormulaPanel wiring becomes:

```tsx
            onAdd={(text) => setFormulas((f) => [...f, { id: freshId('f'), text, logic: entryLogic }])}
```

6. Guard the CTL-only memos: in the `highlight` memo the existing `activeAnalysis?.record` check already excludes LTL (no record) — verify, don't change. Same for `evidence` (`activeAnalysis.ast` guard). No changes needed if those guards are present.

7. Pass `entryLogic={entryLogic}` + `onEntryLogic={setEntryLogic}` to Header, `entryLogic={entryLogic}` to FormulaPanel.

- [ ] **Step 9: Verify**

`npm test`: the App tests' default example now includes the LTL formula row (`(G F r)` pretty text, `–` verdict) — the existing test asserting `rows.length` of formula rows will FAIL (3 → 4) and the verdict-array test likewise. Update those two assertions to expect 4 rows and verdicts `['✓', '✗', '✓', '–']` — this is a legitimate spec change, not test-weakening. All else passes. `npx tsc --noEmit`, `npm run build` clean.

- [ ] **Step 10: Commit**

```bash
git add src/ui src/styles.css
git commit -m "feat: per-formula logic tags, LTL analyses and inspector view, live LTL tab"
```

---

### Task 5: Canvas record mode + trace overlay

**Files:**
- Modify: `src/ui/Canvas.tsx`, `src/styles.css`

- [ ] **Step 1: styles**

Append to `src/styles.css`:

```css
.pulse-ring { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { stroke-opacity: 0.9; } 50% { stroke-opacity: 0.25; } }
.record-btn { position: absolute; top: 8px; right: 10px; z-index: 5; padding: 4px 10px;
  border: 1px solid #7c3aed; border-radius: 4px; background: #fff; color: #7c3aed; cursor: pointer; }
.record-btn.on { background: #7c3aed; color: #fff; }
```

- [ ] **Step 2: Canvas changes**

In `src/ui/Canvas.tsx`:

1. Imports: add `successors` to the kripke import; add `import { PendingLasso } from './types';`
2. Add to `CanvasProps`:

```ts
  trace: PendingLasso | null;
  recording: boolean;
  onRecordingChange: (b: boolean) => void;
  onTraceClick: (stateId: string) => void;
  hoverStateId: string | null;
```

3. Destructure the new props. Define after `hasReverse`:

```tsx
  const TRACE_COLOR = '#7c3aed';
  const traceBadges = new Map<string, number[]>();
  if (trace) {
    trace.stateIds.forEach((id, i) => {
      traceBadges.set(id, [...(traceBadges.get(id) ?? []), i + 1]);
    });
  }
  const tracePairs: { a: KripkeState; b: KripkeState; loopBack: boolean }[] = [];
  if (trace) {
    for (let i = 0; i + 1 < trace.stateIds.length; i++) {
      const a = stateById(model, trace.stateIds[i]);
      const b = stateById(model, trace.stateIds[i + 1]);
      if (a && b) tracePairs.push({ a, b, loopBack: false });
    }
    if (trace.loopIndex !== null && trace.stateIds.length > 0) {
      const a = stateById(model, trace.stateIds[trace.stateIds.length - 1]);
      const b = stateById(model, trace.stateIds[trace.loopIndex]);
      if (a && b) tracePairs.push({ a, b, loopBack: true });
    }
  }
  // While recording: empty/no trace → every state is a valid start; open trace →
  // successors of the last state; closed loop → no targets.
  const recordTargets: Set<string> | null = recording
    ? (() => {
        if (!trace || trace.stateIds.length === 0) return new Set(model.states.map((s) => s.id));
        if (trace.loopIndex !== null) return new Set<string>();
        return new Set(successors(model, trace.stateIds[trace.stateIds.length - 1]));
      })()
    : null;
```

4. Interaction changes:
- Top of `onStatePointerDown`, after the rename guard:

```tsx
    if (recording) {
      e.stopPropagation();
      onTraceClick(s.id);
      return;
    }
```

- In `onPointerUp`'s pan-branch, suppress click-to-add while recording: change the condition to `else if (d.type === 'pan' && !d.moved && !recording)`.
- Hide the connect handle while recording: extend the `hoverState` computation with `&& !recording`.

5. Rendering additions inside the transformed `<g>`, after the evidence overlay and before the states:

```tsx
          {tracePairs.map(({ a, b, loopBack }, i) => (
            <path key={`tr-${i}`}
              d={edgePath(a, b, a.id !== b.id && hasReverse(a.id, b.id))}
              fill="none" stroke={TRACE_COLOR} strokeWidth={3.5} opacity={0.8}
              strokeDasharray={loopBack ? '8 5' : undefined} />
          ))}
```

Inside the per-state `<g>`, after the deadlock glyph:

```tsx
                {recordTargets?.has(s.id) && (
                  <circle className="pulse-ring" cx={s.x} cy={s.y} r={R + 8} fill="none"
                    stroke={TRACE_COLOR} strokeWidth={3} />
                )}
                {hoverStateId === s.id && (
                  <circle cx={s.x} cy={s.y} r={R + 4} fill="none" stroke="#718096"
                    strokeWidth={2} strokeDasharray="3 3" />
                )}
                {traceBadges.has(s.id) && (
                  <text x={s.x + R + 4} y={s.y - R + 2} fontSize={11} fill={TRACE_COLOR}
                    fontWeight={700} style={{ userSelect: 'none' }}>
                    {traceBadges.get(s.id)!.join(',')}
                  </text>
                )}
```

6. Record button + help text: inside the container div, before `.canvas-help`:

```tsx
      <button className={`record-btn ${recording ? 'on' : ''}`}
        onClick={() => onRecordingChange(!recording)}>
        {recording ? '■ stop recording' : '⏺ Build trace'}
      </button>
```

Update `.canvas-help` text to append ` · ⏺: build trace`.

- [ ] **Step 3: App wiring (minimal, Timeline arrives in Task 6)**

In `App.tsx` add recording state and the trace-click handler:

```tsx
  const [recording, setRecording] = useState(false);

  function handleTraceClick(id: string) {
    if (!trace || trace.stateIds.length === 0) {
      setTrace({ stateIds: [id], loopIndex: null });
      return;
    }
    if (trace.loopIndex !== null) return; // complete — ignore further clicks
    const last = trace.stateIds[trace.stateIds.length - 1];
    if (!model.transitions.some((t) => t.from === last && t.to === id)) return;
    const existing = trace.stateIds.indexOf(id);
    if (existing !== -1) {
      setTrace({ ...trace, loopIndex: existing });
      setRecording(false);
    } else {
      setTrace({ stateIds: [...trace.stateIds, id], loopIndex: null });
    }
  }

  function startRecording(on: boolean) {
    if (on) setTrace({ stateIds: [], loopIndex: null });
    setRecording(on);
  }
```

Escape while recording exits record mode (keep the trace prefix): in the keydown handler, make the Escape branch:

```tsx
      if (e.key === 'Escape') {
        if (recording) { setRecording(false); return; }
        setSelection(null);
      }
```

(add `recording` to the effect deps). Trace revalidation on model edits:

```tsx
  useEffect(() => {
    if (!trace) return;
    const err = trace.loopIndex === null
      ? validatePrefix(model, trace.stateIds)
      : validateLasso(model, { stateIds: trace.stateIds, loopIndex: trace.loopIndex });
    if (err) {
      setTrace(null);
      setTraceNotice(`Trace cleared — ${err}`);
    }
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps
```

with `const [traceNotice, setTraceNotice] = useState<string | null>(null);` and `validatePrefix` added to the trace import. Pass the new Canvas props:

```tsx
            trace={trace}
            recording={recording}
            onRecordingChange={startRecording}
            onTraceClick={handleTraceClick}
            hoverStateId={hoverStateId}
```

with `const [hoverStateId, setHoverStateId] = useState<string | null>(null);` (Timeline drives it in Task 6; until then it stays null).

- [ ] **Step 4: Verify**

`npm test` (all pass — no markup the existing tests rely on changed), `npx tsc --noEmit`, `npm run build`. Manual check via `npm run dev`: ⏺ button starts recording (all states pulse), clicking builds a violet numbered path, successors-only glow, clicking an on-trace state closes the loop (dashed loop-back edge) and exits; Escape exits leaving a prefix; the `G F r` example formula flips from `–` to ✓/✗ once a loop exists (✓ iff reset is in the loop).

- [ ] **Step 5: Commit**

```bash
git add src/ui/Canvas.tsx src/ui/App.tsx src/styles.css
git commit -m "feat: canvas trace recording with successor glow and violet lasso overlay"
```

---

### Task 6: Timeline pane

**Files:**
- Create: `src/ui/Timeline.tsx`
- Modify: `src/ui/App.tsx`, `src/styles.css`

- [ ] **Step 1: styles**

Append to `src/styles.css`:

```css
.timeline { border-top: 1px solid #ddd; background: #fafafa; padding: 8px 12px;
  max-height: 220px; overflow: auto; font-size: 12px; }
.timeline .strip { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid #cbd5e0;
  border-radius: 12px; padding: 1px 8px; background: #fff; }
.chip.loop-entry { border-color: #7c3aed; color: #553c9a; }
.chip .trim { border: none; background: none; cursor: pointer; color: #999; padding: 0 2px; }
.timeline table { border-collapse: collapse; font-family: ui-monospace, monospace; }
.timeline th, .timeline td { padding: 2px 10px; text-align: center; }
.timeline th { font-weight: 600; cursor: default; }
.timeline td.loop-col, .timeline th.loop-col { background: #f3ebff; }
.timeline .cell-true { color: #2f855a; }
.timeline .cell-false { color: #c53030; }
.timeline .witness { text-decoration: underline; text-underline-offset: 3px; }
.timeline .row-label { text-align: left; display: flex; align-items: center; gap: 6px; }
.timeline .row-selected { background: #ebf4ff; }
.notice { background: #fffaf0; border: 1px solid #ed8936; border-radius: 4px;
  padding: 4px 8px; margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
```

- [ ] **Step 2: Timeline component**

`src/ui/Timeline.tsx`:

```tsx
import { useState } from 'react';
import { KripkeStructure, allPropositions, stateById, successors } from '../core/kripke';
import { LTLNode, pretty as prettyLTL } from '../core/ltl-parser';
import { Lasso, nextPosition } from '../core/trace';
import { Analysis, PendingLasso } from './types';
import { colorForNode } from './colors';

interface TimelineProps {
  model: KripkeStructure;
  trace: PendingLasso | null;
  onTraceChange: (t: PendingLasso | null) => void;
  recording: boolean;
  onRecordingChange: (b: boolean) => void;
  /** The active analysis, when it is a successfully parsed LTL formula. */
  analysis: Analysis | null;
  selectedNodeId: number | null;
  onSelectNode: (id: number | null) => void;
  onHoverState: (id: string | null) => void;
  notice: string | null;
  onDismissNotice: () => void;
}

function postOrder(n: LTLNode): LTLNode[] {
  const out: LTLNode[] = [];
  (function walk(m: LTLNode) {
    if ('child' in m) walk(m.child);
    if ('left' in m) { walk(m.left); walk(m.right); }
    out.push(m);
  })(n);
  return out;
}

/** For a true F/U/X cell, the position that justifies it (or null). */
function witnessFor(
  node: LTLNode, rows: Map<number, boolean[]>, lasso: Lasso, i: number,
): number | null {
  const len = lasso.stateIds.length;
  switch (node.kind) {
    case 'X':
      return nextPosition(lasso, i);
    case 'F': {
      const c = rows.get(node.child.id)!;
      let j = i;
      for (let steps = 0; steps <= 2 * len; steps++) {
        if (c[j]) return j;
        j = nextPosition(lasso, j);
      }
      return null;
    }
    case 'U': {
      const l = rows.get(node.left.id)!;
      const r = rows.get(node.right.id)!;
      let j = i;
      for (let steps = 0; steps <= 2 * len; steps++) {
        if (r[j]) return j;
        if (!l[j]) return null;
        j = nextPosition(lasso, j);
      }
      return null;
    }
    default:
      return null;
  }
}

export default function Timeline(props: TimelineProps) {
  const {
    model, trace, onTraceChange, recording, onRecordingChange,
    analysis, selectedNodeId, onSelectNode, onHoverState, notice, onDismissNotice,
  } = props;
  const [hoverCell, setHoverCell] = useState<{ nodeId: number; pos: number } | null>(null);

  const complete: Lasso | null = trace && trace.loopIndex !== null
    ? { stateIds: trace.stateIds, loopIndex: trace.loopIndex } : null;
  const rows = analysis?.ltlRows;
  const ltlAst = analysis?.ltlAst;
  const nodes = ltlAst ? postOrder(ltlAst) : [];
  const props_ = allPropositions(model);
  const nameAt = (i: number) => stateById(model, trace!.stateIds[i])?.name ?? trace!.stateIds[i];

  function trim(i: number) {
    if (!trace) return;
    const stateIds = trace.stateIds.slice(0, i);
    onTraceChange(stateIds.length === 0 ? null : { stateIds, loopIndex: null });
  }

  function extend(id: string) {
    if (!trace || trace.loopIndex !== null) return;
    onTraceChange({ stateIds: [...trace.stateIds, id], loopIndex: null });
  }

  function closeLoop(index: number) {
    if (!trace || trace.loopIndex !== null) return;
    onTraceChange({ ...trace, loopIndex: index });
  }

  const last = trace && trace.stateIds.length > 0
    ? trace.stateIds[trace.stateIds.length - 1] : null;
  const canExtend = trace !== null && trace.loopIndex === null && last !== null;
  const succ = canExtend ? successors(model, last!) : [];
  const loopCandidates = canExtend
    ? trace!.stateIds
        .map((id, idx) => ({ id, idx }))
        .filter(({ id }) => model.transitions.some((t) => t.from === last && t.to === id))
    : [];

  const witnessPos = hoverCell && rows && complete && ltlAst
    ? (() => {
        const node = nodes.find((m) => m.id === hoverCell.nodeId);
        return node && rows.get(node.id)![hoverCell.pos]
          ? witnessFor(node, rows, complete, hoverCell.pos) : null;
      })()
    : null;

  return (
    <div className="timeline">
      {notice && (
        <div className="notice">
          <span>⚠ {notice}</span>
          <button onClick={onDismissNotice}>✕</button>
        </div>
      )}
      <div className="strip">
        <button className={`record-btn ${recording ? 'on' : ''}`} style={{ position: 'static' }}
          onClick={() => onRecordingChange(!recording)}>
          {recording ? '■ stop' : '⏺ record'}
        </button>
        {trace && trace.stateIds.map((id, i) => (
          <span key={i} className={`chip ${trace.loopIndex === i ? 'loop-entry' : ''}`}>
            {trace.loopIndex === i && '⟲ '}
            {stateById(model, id)?.name ?? id}
            <button className="trim" title="Trim from here" onClick={() => trim(i)}>✕</button>
          </span>
        ))}
        {trace && trace.loopIndex === null && trace.stateIds.length > 0 && (
          <span className="muted">no loop yet —</span>
        )}
        {succ.map((id) => (
          <button key={`x-${id}`} onClick={() => extend(id)}>
            → {stateById(model, id)?.name ?? id}
          </button>
        ))}
        {loopCandidates.map(({ id, idx }) => (
          <button key={`l-${idx}`} onClick={() => closeLoop(idx)}>
            ⟲ {stateById(model, id)?.name ?? id}
          </button>
        ))}
        {trace && (
          <button onClick={() => { onTraceChange(null); onRecordingChange(false); }}>clear trace</button>
        )}
        {!trace && !recording && (
          <span className="muted">No trace — press ⏺ record, then click states on the canvas.</span>
        )}
      </div>
      {trace && trace.stateIds.length > 0 && (
        <table onMouseLeave={() => { onHoverState(null); setHoverCell(null); }}>
          <thead>
            <tr>
              <th />
              {trace.stateIds.map((_, i) => (
                <th key={i}
                  className={complete && i >= complete.loopIndex ? 'loop-col' : ''}
                  onMouseEnter={() => onHoverState(trace.stateIds[i])}>
                  {complete && i === complete.loopIndex ? '⟲' : ''}{nameAt(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props_.map((p) => (
              <tr key={`p-${p}`}>
                <td className="row-label muted">{p}</td>
                {trace.stateIds.map((id, i) => (
                  <td key={i} className={complete && i >= complete.loopIndex ? 'loop-col' : ''}>
                    {(stateById(model, id)?.propositions ?? []).includes(p) ? '·' : ''}
                  </td>
                ))}
              </tr>
            ))}
            {ltlAst && nodes.map((node) => (
              <tr key={node.id} className={node.id === selectedNodeId ? 'row-selected' : ''}>
                <td className="row-label" style={{ cursor: 'pointer' }}
                  onClick={() => onSelectNode(node.id === selectedNodeId ? null : node.id)}>
                  <span className="swatch" style={{ background: colorForNode(node.id) }} />
                  {prettyLTL(node)}
                </td>
                {trace.stateIds.map((_, i) => {
                  const v = rows?.get(node.id)?.[i];
                  const isWitness = hoverCell?.nodeId === node.id && witnessPos === i
                    && hoverCell.pos !== i;
                  return (
                    <td key={i}
                      className={[
                        complete && i >= complete.loopIndex ? 'loop-col' : '',
                        v === true ? 'cell-true' : v === false ? 'cell-false' : '',
                        isWitness ? 'witness' : '',
                      ].join(' ')}
                      onMouseEnter={() => setHoverCell({ nodeId: node.id, pos: i })}>
                      {v === undefined ? '–' : v ? '●' : '○'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: App wiring**

In `App.tsx`:

1. `import Timeline from './Timeline';`
2. Derive the active LTL analysis for the pane:

```tsx
  const activeLTLAnalysis = activeAnalysis && activeAnalysis.entry.logic === 'ltl' && activeAnalysis.ltlAst
    ? activeAnalysis : null;
```

3. Render below `</div>` of `.main` (still inside the fragment):

```tsx
      {(trace !== null || activeLTLAnalysis !== null || traceNotice !== null) && (
        <Timeline
          model={model}
          trace={trace}
          onTraceChange={setTrace}
          recording={recording}
          onRecordingChange={startRecording}
          analysis={activeLTLAnalysis}
          selectedNodeId={selectedNodeId}
          onSelectNode={(id) => { setSelectedNodeId(id); setStepIndex(null); }}
          onHoverState={setHoverStateId}
          notice={traceNotice}
          onDismissNotice={() => setTraceNotice(null)}
        />
      )}
```

4. One adjustment to `startRecording` from Task 5 so the Timeline's record button doesn't wipe a prefix being extended by buttons: only reset the trace when starting fresh over a COMPLETE trace:

```tsx
  function startRecording(on: boolean) {
    if (on && (trace === null || trace.loopIndex !== null)) {
      setTrace({ stateIds: [], loopIndex: null });
    }
    setRecording(on);
  }
```

- [ ] **Step 4: Verify**

`npm test`, `npx tsc --noEmit`, `npm run build` clean. Manual: timeline appears when an LTL formula is selected or a trace exists; chips trim (loop reopens); successor/⟲ buttons extend and close; matrix shows prop dots and per-subformula ●/○ with loop columns tinted; hovering a column highlights the state on canvas; hovering a true F/U/X cell underlines its witness column; clicking a subformula row syncs with the inspector tree selection.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Timeline.tsx src/ui/App.tsx src/styles.css
git commit -m "feat: timeline pane — trace strip, subformula matrix, witness hints"
```

---

### Task 7: Integration tests, README, final review

**Files:**
- Modify: `src/ui/App.test.tsx`, `README.md`

- [ ] **Step 1: Integration tests**

Append to the describe block in `src/ui/App.test.tsx` (uses the existing `firePointer` helper; default example coordinates: work(160,140), error(380,140), reset(270,320)):

```tsx
  it('LTL formula shows – without a trace, with a tooltip-style hint', () => {
    render(<App />);
    const rows = document.querySelectorAll('.formula-row');
    const ltlRow = [...rows].find((r) => r.querySelector('.badge.ltl'));
    expect(ltlRow).toBeTruthy();
    expect(ltlRow!.querySelector('.verdict')!.textContent).toBe('–');
  });

  it('recording a lasso through reset makes G F r true', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    for (const [x, y] of [[160, 140], [380, 140], [270, 320], [160, 140]] as const) {
      firePointer('pointerDown', svg, { clientX: x, clientY: y, button: 0 });
      firePointer('pointerUp', svg, { clientX: x, clientY: y, button: 0 });
    }
    // clicking work again closed the loop; G F r now evaluates on w e r cycle
    const rows = document.querySelectorAll('.formula-row');
    const ltlRow = [...rows].find((r) => r.querySelector('.badge.ltl'))!;
    expect(ltlRow.querySelector('.verdict')!.textContent).toBe('✓');
  });

  it('trimming the trace reopens the loop and reverts LTL verdicts to –', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    for (const [x, y] of [[160, 140], [380, 140], [270, 320], [160, 140]] as const) {
      firePointer('pointerDown', svg, { clientX: x, clientY: y, button: 0 });
      firePointer('pointerUp', svg, { clientX: x, clientY: y, button: 0 });
    }
    fireEvent.click(document.querySelectorAll('.chip .trim')[2]); // trim 'reset'
    const ltlRow = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.querySelector('.badge.ltl'))!;
    expect(ltlRow.querySelector('.verdict')!.textContent).toBe('–');
  });

  it('deleting a state on the trace clears the trace with a notice', () => {
    render(<App />);
    fireEvent.click(screen.getByText('⏺ Build trace'));
    const svg = document.querySelector('svg')!;
    for (const [x, y] of [[160, 140], [380, 140], [270, 320], [160, 140]] as const) {
      firePointer('pointerDown', svg, { clientX: x, clientY: y, button: 0 });
      firePointer('pointerUp', svg, { clientX: x, clientY: y, button: 0 });
    }
    // select and delete 'error'
    firePointer('pointerDown', screen.getByText('error'), { clientX: 380, clientY: 140, button: 0 });
    firePointer('pointerUp', svg, { clientX: 380, clientY: 140, button: 0 });
    fireEvent.keyDown(document.body, { key: 'Delete' });
    expect(screen.getByText(/Trace cleared/)).toBeTruthy();
    expect(document.querySelectorAll('.chip').length).toBe(0);
  });
```

Note on mechanics: while recording, a pointerdown on a state's `<g>` triggers `onTraceClick` — the coordinates land on the state groups because their `onPointerDown` handlers fire via bubbling from the `<text>`/`<circle>` under the cursor. If the pointerdown on `svg` doesn't reach the state group in jsdom (it targets the svg element itself, not the circle — jsdom has no hit-testing), target the state's `<text>` element instead: `firePointer('pointerDown', screen.getByText('work'), {...})` followed by pointerUp on the svg. Adjust that mechanically if the first form fails; assertions stay unchanged. Also note `screen.getByText('work')` may match both the canvas label and a timeline chip once the trace exists — prefer `within(document.querySelector('svg')!).getByText('work')` (import `within` from @testing-library/react) or query `svg text` elements directly.

- [ ] **Step 2: Run tests**

`npm test` — expect 104 passing (100 + 4). `npx tsc --noEmit`, `npm run build` clean.

- [ ] **Step 3: README**

In `README.md`, under `## Use`, update the Formulas bullet and add a Trace bullet:

```markdown
- **Formulas (left):** pick LTL or CTL with the header tabs, type, press Enter.
  CTL: `AX EX AF EF AG EG`, `A[p U q]`, `E[p U q]` — checked against the structure.
  LTL: `X F G`, `p U q` — checked against the current trace. Shared: `! & | -> <->`.
- **Trace (bottom):** press ⏺ and click states on the canvas to walk a path; click a
  state already on the trace to close the loop (lasso). The timeline shows every
  subformula's truth at every position — loop columns tinted, hover a true F/U/X
  cell to see the position that justifies it. Trim with ✕, extend with the
  successor buttons.
```

- [ ] **Step 4: Manual walkthrough**

`npm run dev`: full spec pass — record incl. Escape-mid-recording (prefix kept, `–` verdicts, "no loop yet" note), extend/close via timeline buttons, `G F r` vs a work-self-loop trace (✗) vs the 3-cycle (✓), matrix hover behaviors, canvas column-hover ring, LTL inspector tree sync, CTL formulas unaffected, trace persistence across reload, v1 JSON import still works, deleting a trace state clears with notice. Fix anything broken with small individual commits.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.test.tsx README.md
git commit -m "test: LTL trace integration tests; docs: LTL usage"
```
