# Temporal Logic Explorer v1 (CTL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-side web app with a visual Kripke structure editor and a CTL model checker featuring subformula coloring, fixpoint step-through, and witness/counterexample paths.

**Architecture:** Two layers — `src/core/` (pure TS: Kripke model, CTL parser, fixpoint checker, evidence extraction; fully unit-tested) and `src/ui/` (React: three-pane layout with formula list, custom-SVG canvas, context-sensitive inspector). One-directional data flow: any edit re-runs the checker; UI renders from the resulting evaluation record.

**Tech Stack:** TypeScript, React 18, Vite, Vitest (+ jsdom & @testing-library/react for smoke tests). No graph or parser libraries.

**Spec:** `docs/superpowers/specs/2026-08-06-temporal-logic-explorer-design.md`

---

## File map

```
package.json, vite.config.ts, tsconfig.json, index.html
src/main.tsx                — entry point
src/styles.css              — all styling
src/core/kripke.ts          — Kripke structure types + graph helpers
src/core/ctl-parser.ts      — CTL AST, lexer, recursive-descent parser, pretty-printer
src/core/ctl-checker.ts     — fixpoint labeling → EvaluationRecord
src/core/evidence.ts        — witness/counterexample path extraction
src/core/*.test.ts          — unit tests per module
src/ui/types.ts             — FormulaEntry, Analysis types
src/ui/colors.ts            — subformula color palette
src/ui/storage.ts           — localStorage save/load
src/ui/examples.ts          — canned example models
src/ui/App.tsx              — state management + three-pane layout
src/ui/Header.tsx           — logic tabs, examples dropdown, import/export
src/ui/FormulaPanel.tsx     — formula list + input (left pane)
src/ui/Canvas.tsx           — SVG Kripke editor (center pane)
src/ui/Inspector.tsx        — subformula tree / state editor (right pane)
src/ui/App.test.tsx         — render smoke test
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/styles.css`, `src/ui/App.tsx`

- [ ] **Step 1: Write config files**

`package.json`:

```json
{
  "name": "temporal-logic-explorer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^24.1.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

`vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { globals: true, environment: 'jsdom' },
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Temporal Logic Explorer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Write entry point and placeholder App**

`src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/ui/App.tsx` (placeholder, replaced in Task 7):

```tsx
export default function App() {
  return <div>Temporal Logic Explorer</div>;
}
```

`src/styles.css` (placeholder, replaced in Task 7):

```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

- [ ] **Step 3: Install and verify**

Run: `npm install && npm run build`
Expected: build succeeds. Then `npm run dev` briefly, confirm the page shows "Temporal Logic Explorer".

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json index.html src
git commit -m "chore: scaffold Vite + React + TS + Vitest project"
```

---

### Task 2: Kripke structure model

**Files:**
- Create: `src/core/kripke.ts`
- Test: `src/core/kripke.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/kripke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  KripkeStructure, successors, stateById, deadlockStates, allPropositions,
} from './kripke';

const k: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 's2', name: 's2', propositions: ['q'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 's0', to: 's0' }, { from: 's0', to: 's1' }, { from: 's1', to: 's2' },
  ],
};

describe('kripke helpers', () => {
  it('successors returns outgoing targets', () => {
    expect(successors(k, 's0').sort()).toEqual(['s0', 's1']);
    expect(successors(k, 's2')).toEqual([]);
  });
  it('stateById finds states', () => {
    expect(stateById(k, 's1')?.name).toBe('s1');
    expect(stateById(k, 'nope')).toBeUndefined();
  });
  it('deadlockStates finds states with no successors', () => {
    expect(deadlockStates(k)).toEqual(['s2']);
  });
  it('allPropositions collects unique props', () => {
    expect(allPropositions(k).sort()).toEqual(['p', 'q']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./kripke`.

- [ ] **Step 3: Implement**

`src/core/kripke.ts`:

```ts
export interface KripkeState {
  id: string;
  name: string;
  propositions: string[];
  isInitial: boolean;
  x: number; // UI-only metadata; core algorithms ignore position
  y: number;
}

export interface Transition {
  from: string;
  to: string;
}

export interface KripkeStructure {
  states: KripkeState[];
  transitions: Transition[];
}

export function successors(k: KripkeStructure, stateId: string): string[] {
  return k.transitions.filter((t) => t.from === stateId).map((t) => t.to);
}

export function stateById(k: KripkeStructure, id: string): KripkeState | undefined {
  return k.states.find((s) => s.id === id);
}

export function deadlockStates(k: KripkeStructure): string[] {
  return k.states.filter((s) => successors(k, s.id).length === 0).map((s) => s.id);
}

export function allPropositions(k: KripkeStructure): string[] {
  return [...new Set(k.states.flatMap((s) => s.propositions))];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/kripke.ts src/core/kripke.test.ts
git commit -m "feat: Kripke structure model and graph helpers"
```

---

### Task 3: CTL AST, parser, pretty-printer

**Files:**
- Create: `src/core/ctl-parser.ts`
- Test: `src/core/ctl-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/ctl-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCTL, pretty, ParseError, CTLNode } from './ctl-parser';

function kinds(n: CTLNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': return `not(${kinds(n.child)})`;
    case 'and': case 'or': case 'implies': case 'iff':
      return `${n.kind}(${kinds(n.left)},${kinds(n.right)})`;
    case 'EU': case 'AU': return `${n.kind}(${kinds(n.left)},${kinds(n.right)})`;
    default: return `${n.kind}(${kinds(n.child)})`;
  }
}

describe('parseCTL', () => {
  it('parses atoms and propositions', () => {
    expect(kinds(parseCTL('p'))).toBe('p');
    expect(kinds(parseCTL('true'))).toBe('true');
    expect(kinds(parseCTL('false'))).toBe('false');
  });
  it('parses temporal prefixes, nested', () => {
    expect(kinds(parseCTL('AG EF p'))).toBe('AG(EF(p))');
    expect(kinds(parseCTL('EX AX q'))).toBe('EX(AX(q))');
  });
  it('parses until', () => {
    expect(kinds(parseCTL('A[p U q]'))).toBe('AU(p,q)');
    expect(kinds(parseCTL('E[p U AG q]'))).toBe('EU(p,AG(q))');
  });
  it('handles precedence: not > and > or > implies > iff', () => {
    expect(kinds(parseCTL('!p & q'))).toBe('and(not(p),q)');
    expect(kinds(parseCTL('p | q & r'))).toBe('or(p,and(q,r))');
    expect(kinds(parseCTL('p -> q | r'))).toBe('implies(p,or(q,r))');
    expect(kinds(parseCTL('p <-> q -> r'))).toBe('iff(p,implies(q,r))');
  });
  it('implies is right-associative', () => {
    expect(kinds(parseCTL('p -> q -> r'))).toBe('implies(p,implies(q,r))');
  });
  it('accepts unicode operators', () => {
    expect(kinds(parseCTL('¬p ∧ q ∨ r'))).toBe('or(and(not(p),q),r)');
  });
  it('temporal operators bind like unary: AG p & q is (AG p) & q', () => {
    expect(kinds(parseCTL('AG p & q'))).toBe('and(AG(p),q)');
  });
  it('assigns unique ids to every node', () => {
    const n = parseCTL('AG (p & q)');
    const ids: number[] = [];
    (function walk(m: CTLNode) {
      ids.push(m.id);
      if ('child' in m) walk(m.child);
      if ('left' in m) { walk(m.left); walk(m.right); }
    })(n);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('reports position on syntax errors', () => {
    try {
      parseCTL('p & ');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).pos).toBe(4);
    }
  });
  it('rejects unbalanced until', () => {
    expect(() => parseCTL('A[p U q')).toThrow(ParseError);
  });
  it('rejects trailing garbage', () => {
    expect(() => parseCTL('p q')).toThrow(ParseError);
  });
  it('gives an LTL hint for bare path operators', () => {
    try {
      parseCTL('FG p');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).hint).toMatch(/path quantifier/);
    }
    expect(() => parseCTL('G p')).toThrow(/path/i);
  });
});

describe('pretty', () => {
  it('round-trips ASCII to unicode with minimal parens', () => {
    expect(pretty(parseCTL('AG EF p'))).toBe('AG EF p');
    expect(pretty(parseCTL('!p & q'))).toBe('¬p ∧ q');
    expect(pretty(parseCTL('(p | q) & r'))).toBe('(p ∨ q) ∧ r');
    expect(pretty(parseCTL('A[p U q]'))).toBe('A[p U q]');
    expect(pretty(parseCTL('p -> q'))).toBe('p → q');
    expect(pretty(parseCTL('AG (p -> AF q)'))).toBe('AG (p → AF q)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./ctl-parser`.

- [ ] **Step 3: Implement**

`src/core/ctl-parser.ts`:

```ts
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

class Parser {
  private i = 0;
  private nextId = 0;
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
          "Pair each of F/G/X with A or E, e.g. AF AG p instead of FG p.",
        );
      }
    }
    return this.parseAtom();
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
```

Note: the `pretty` test `AG (p -> AF q)` → `'AG (p → AF q)'` works because `implies` has lower precedence than the unary temporal operator, so `prettyPrec(implies-node, 5)` wraps itself in parens.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS. If the pretty-printer output differs on parens, fix the printer (the tests define the contract).

- [ ] **Step 5: Commit**

```bash
git add src/core/ctl-parser.ts src/core/ctl-parser.test.ts
git commit -m "feat: CTL parser with friendly errors and pretty-printer"
```

---

### Task 4: CTL fixpoint checker

**Files:**
- Create: `src/core/ctl-checker.ts`
- Test: `src/core/ctl-checker.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/ctl-checker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure } from './kripke';
import { parseCTL, CTLNode } from './ctl-parser';
import { checkCTL } from './ctl-checker';

// s0[p] ⇄self →s1[] →s2[q] ⇄self
const k: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 's2', name: 's2', propositions: ['q'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 's0', to: 's0' }, { from: 's0', to: 's1' },
    { from: 's1', to: 's2' }, { from: 's2', to: 's2' },
  ],
};

function sat(k: KripkeStructure, formula: string): { sat: string[]; root: CTLNode; record: ReturnType<typeof checkCTL> } {
  const root = parseCTL(formula);
  const record = checkCTL(k, root);
  return { sat: [...record.results.get(root.id)!.sat].sort(), root, record };
}

describe('checkCTL', () => {
  it('atomic and boolean operators', () => {
    expect(sat(k, 'p').sat).toEqual(['s0']);
    expect(sat(k, 'true').sat).toEqual(['s0', 's1', 's2']);
    expect(sat(k, '!p').sat).toEqual(['s1', 's2']);
    expect(sat(k, 'p | q').sat).toEqual(['s0', 's2']);
    expect(sat(k, 'p -> q').sat).toEqual(['s1', 's2']);
  });
  it('EX / AX', () => {
    expect(sat(k, 'EX q').sat).toEqual(['s1', 's2']);
    expect(sat(k, 'AX q').sat).toEqual(['s1', 's2']);
    expect(sat(k, 'EX p').sat).toEqual(['s0']);
  });
  it('EF: everything reaches q', () => {
    expect(sat(k, 'EF q').sat).toEqual(['s0', 's1', 's2']);
  });
  it('EF records growing iterations', () => {
    const { root, record } = sat(k, 'EF q');
    const iters = record.results.get(root.id)!.iterations.map((s) => [...s].sort());
    expect(iters).toEqual([['s2'], ['s1', 's2'], ['s0', 's1', 's2']]);
  });
  it('AF: s0 can loop on ¬q forever', () => {
    expect(sat(k, 'AF q').sat).toEqual(['s1', 's2']);
  });
  it('EG: self-loop on p makes EG p hold at s0', () => {
    expect(sat(k, 'EG p').sat).toEqual(['s0']);
  });
  it('AG: q is invariant only from s2', () => {
    expect(sat(k, 'AG q').sat).toEqual(['s2']);
    expect(sat(k, 'AG EF q').sat).toEqual(['s0', 's1', 's2']);
  });
  it('EU: p does not bridge s1', () => {
    expect(sat(k, 'E[p U q]').sat).toEqual(['s2']);
    expect(sat(k, 'E[true U q]').sat).toEqual(['s0', 's1', 's2']);
  });
  it('AU', () => {
    expect(sat(k, 'A[true U q]').sat).toEqual(['s1', 's2']);
  });
  it('verdict is over initial states', () => {
    expect(sat(k, 'EF q').record.verdict).toBe(true);
    expect(sat(k, 'AF q').record.verdict).toBe(false);
  });
  it('verdict is null with no initial states', () => {
    const k2: KripkeStructure = { ...k, states: k.states.map((s) => ({ ...s, isInitial: false })) };
    expect(sat(k2, 'p').record.verdict).toBe(null);
  });
  it('deadlock states vacuously satisfy AX false and are reported', () => {
    const kd: KripkeStructure = {
      states: [
        { id: 'a', name: 'a', propositions: [], isInitial: true, x: 0, y: 0 },
      ],
      transitions: [],
    };
    const r = sat(kd, 'AX false');
    expect(r.sat).toEqual(['a']);
    expect(r.record.deadlocks).toEqual(['a']);
  });
  it('stores results for every subformula node', () => {
    const root = parseCTL('AG (p -> EF q)');
    const record = checkCTL(k, root);
    let count = 0;
    (function walk(n: CTLNode) {
      count++;
      expect(record.results.has(n.id)).toBe(true);
      if ('child' in n) walk(n.child);
      if ('left' in n) { walk(n.left); walk(n.right); }
    })(root);
    expect(count).toBe(5); // AG, ->, p, EF, q
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./ctl-checker`.

- [ ] **Step 3: Implement**

`src/core/ctl-checker.ts`:

```ts
import { KripkeStructure, successors, deadlockStates } from './kripke';
import { CTLNode } from './ctl-parser';

export interface NodeResult {
  sat: Set<string>;
  /** For fixpoint operators: successive approximations, first to last (= sat).
   *  For all other nodes: a single entry equal to sat. */
  iterations: Set<string>[];
}

export interface EvaluationRecord {
  results: Map<number, NodeResult>;
  /** true/false over initial states; null when there are no initial states. */
  verdict: boolean | null;
  deadlocks: string[];
}

export function checkCTL(k: KripkeStructure, root: CTLNode): EvaluationRecord {
  const ids = k.states.map((s) => s.id);
  const succ = new Map(ids.map((id) => [id, successors(k, id)]));
  // pre∃(Z): states with SOME successor in Z. pre∀(Z): states with ALL
  // successors in Z — vacuously true for deadlock states (empty successor set).
  const preE = (Z: Set<string>) => new Set(ids.filter((s) => succ.get(s)!.some((t) => Z.has(t))));
  const preA = (Z: Set<string>) => new Set(ids.filter((s) => succ.get(s)!.every((t) => Z.has(t))));

  const eq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const union = (a: Set<string>, b: Set<string>) => new Set([...a, ...b]);
  const inter = (a: Set<string>, b: Set<string>) => new Set([...a].filter((x) => b.has(x)));
  const compl = (a: Set<string>) => new Set(ids.filter((x) => !a.has(x)));

  const results = new Map<number, NodeResult>();
  const single = (s: Set<string>): NodeResult => ({ sat: s, iterations: [s] });

  function fixpoint(start: Set<string>, step: (Z: Set<string>) => Set<string>): NodeResult {
    const iterations = [start];
    let Z = start;
    for (;;) {
      const next = step(Z);
      if (eq(next, Z)) break;
      iterations.push(next);
      Z = next;
    }
    return { sat: Z, iterations };
  }

  function ev(n: CTLNode): Set<string> {
    let r: NodeResult;
    switch (n.kind) {
      case 'true': r = single(new Set(ids)); break;
      case 'false': r = single(new Set()); break;
      case 'prop':
        r = single(new Set(k.states.filter((s) => s.propositions.includes(n.name)).map((s) => s.id)));
        break;
      case 'not': r = single(compl(ev(n.child))); break;
      case 'and': r = single(inter(ev(n.left), ev(n.right))); break;
      case 'or': r = single(union(ev(n.left), ev(n.right))); break;
      case 'implies': r = single(union(compl(ev(n.left)), ev(n.right))); break;
      case 'iff': {
        const l = ev(n.left), rr = ev(n.right);
        r = single(union(inter(l, rr), inter(compl(l), compl(rr))));
        break;
      }
      case 'EX': r = single(preE(ev(n.child))); break;
      case 'AX': r = single(preA(ev(n.child))); break;
      case 'EF': { const c = ev(n.child); r = fixpoint(c, (Z) => union(Z, preE(Z))); break; }
      case 'AF': { const c = ev(n.child); r = fixpoint(c, (Z) => union(Z, preA(Z))); break; }
      case 'EG': { const c = ev(n.child); r = fixpoint(c, (Z) => inter(c, preE(Z))); break; }
      case 'AG': { const c = ev(n.child); r = fixpoint(c, (Z) => inter(c, preA(Z))); break; }
      case 'EU': {
        const l = ev(n.left), rr = ev(n.right);
        r = fixpoint(rr, (Z) => union(Z, inter(l, preE(Z))));
        break;
      }
      case 'AU': {
        const l = ev(n.left), rr = ev(n.right);
        r = fixpoint(rr, (Z) => union(Z, inter(l, preA(Z))));
        break;
      }
    }
    results.set(n.id, r);
    return r.sat;
  }

  const rootSat = ev(root);
  const initial = k.states.filter((s) => s.isInitial);
  const verdict = initial.length === 0 ? null : initial.every((s) => rootSat.has(s.id));
  return { results, verdict, deadlocks: deadlockStates(k) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ctl-checker.ts src/core/ctl-checker.test.ts
git commit -m "feat: CTL fixpoint model checker with per-subformula iteration records"
```

---

### Task 5: Evidence extraction

**Files:**
- Create: `src/core/evidence.ts`
- Test: `src/core/evidence.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/core/evidence.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { KripkeStructure, successors } from './kripke';
import { parseCTL } from './ctl-parser';
import { checkCTL } from './ctl-checker';
import { findEvidence, Evidence } from './evidence';

const k: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['p'], isInitial: true, x: 0, y: 0 },
    { id: 's1', name: 's1', propositions: [], isInitial: false, x: 0, y: 0 },
    { id: 's2', name: 's2', propositions: ['q'], isInitial: false, x: 0, y: 0 },
  ],
  transitions: [
    { from: 's0', to: 's0' }, { from: 's0', to: 's1' },
    { from: 's1', to: 's2' }, { from: 's2', to: 's2' },
  ],
};

function evidenceFor(formula: string, from = 's0'): Evidence | null {
  const root = parseCTL(formula);
  return findEvidence(k, checkCTL(k, root), root, from);
}

function isRealPath(e: Evidence) {
  for (let i = 0; i + 1 < e.path.length; i++) {
    expect(successors(k, e.path[i])).toContain(e.path[i + 1]);
  }
}

describe('findEvidence', () => {
  it('EF witness is a shortest real path to a q-state', () => {
    const e = evidenceFor('EF q')!;
    expect(e.kind).toBe('witness');
    expect(e.path).toEqual(['s0', 's1', 's2']);
    isRealPath(e);
  });
  it('AG counterexample reaches a violating state', () => {
    const e = evidenceFor('AG p')!;
    expect(e.kind).toBe('counterexample');
    expect(e.path[e.path.length - 1]).toBe('s1');
    isRealPath(e);
  });
  it('EG witness is a lasso staying in the region', () => {
    const e = evidenceFor('EG p')!;
    expect(e.kind).toBe('witness');
    expect(e.loopIndex).toBeDefined();
    expect(e.path[e.loopIndex!]).toBe(e.path[e.path.length - 1]);
    isRealPath(e);
  });
  it('AF counterexample is a lasso avoiding q', () => {
    const e = evidenceFor('AF q')!;
    expect(e.kind).toBe('counterexample');
    expect(e.loopIndex).toBeDefined();
    for (const s of e.path) expect(s).not.toBe('s2');
    isRealPath(e);
  });
  it('EU witness routes through φ-states only', () => {
    const e = evidenceFor('E[true U q]')!;
    expect(e.path[e.path.length - 1]).toBe('s2');
    isRealPath(e);
  });
  it('returns null when there is nothing to show', () => {
    expect(evidenceFor('EF q', 's2')?.path).toEqual(['s2']); // trivial witness
    expect(evidenceFor('AG EF q')).toBe(null); // holds; nested — unsupported
    expect(evidenceFor('p & q')).toBe(null); // non-temporal root
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./evidence`.

- [ ] **Step 3: Implement**

`src/core/evidence.ts`:

```ts
import { KripkeStructure, successors } from './kripke';
import { CTLNode } from './ctl-parser';
import { EvaluationRecord } from './ctl-checker';

export interface Evidence {
  /** State ids along the path. For lassos, the last entry repeats path[loopIndex]. */
  path: string[];
  loopIndex?: number;
  kind: 'witness' | 'counterexample';
}

type Succ = Map<string, string[]>;

function bfs(succ: Succ, from: string, targets: Set<string>, allowed?: Set<string>): string[] | null {
  if (targets.has(from)) return [from];
  const prev = new Map<string, string>();
  const visited = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const t of succ.get(cur) ?? []) {
      if (visited.has(t)) continue;
      visited.add(t);
      prev.set(t, cur);
      if (targets.has(t)) {
        const path = [t];
        let b: string | undefined = cur;
        while (b !== undefined) { path.unshift(b); b = prev.get(b); }
        return path;
      }
      if (!allowed || allowed.has(t)) queue.push(t);
    }
  }
  return null;
}

/** Walk inside `region` (every region state is assumed to have a successor in
 *  region) until a state repeats, producing a lasso. */
function lasso(succ: Succ, from: string, region: Set<string>): { path: string[]; loopIndex: number } | null {
  const indexOf = new Map([[from, 0]]);
  const path = [from];
  let cur = from;
  for (;;) {
    const next = (succ.get(cur) ?? []).find((t) => region.has(t));
    if (next === undefined) return null;
    if (indexOf.has(next)) return { path: [...path, next], loopIndex: indexOf.get(next)! };
    indexOf.set(next, path.length);
    path.push(next);
    cur = next;
  }
}

/**
 * Best-effort witness (formula holds at `from`) or counterexample (it fails).
 * Covers EF/AG/EG/AF/EU at the top level; returns null otherwise.
 */
export function findEvidence(
  k: KripkeStructure,
  record: EvaluationRecord,
  root: CTLNode,
  from: string,
): Evidence | null {
  const succ: Succ = new Map(k.states.map((s) => [s.id, successors(k, s.id)]));
  const all = k.states.map((s) => s.id);
  const satOf = (n: CTLNode) => record.results.get(n.id)!.sat;
  const compl = (S: Set<string>) => new Set(all.filter((x) => !S.has(x)));
  const holds = satOf(root).has(from);

  switch (root.kind) {
    case 'EF': {
      if (!holds) return null;
      const p = bfs(succ, from, satOf(root.child));
      return p && { path: p, kind: 'witness' };
    }
    case 'AG': {
      if (holds) return null;
      const p = bfs(succ, from, compl(satOf(root.child)));
      return p && { path: p, kind: 'counterexample' };
    }
    case 'EG': {
      if (!holds) return null;
      const l = lasso(succ, from, satOf(root));
      return l && { ...l, kind: 'witness' };
    }
    case 'AF': {
      // ¬AF φ region: every state in it has a successor in it (deadlocks
      // vacuously satisfy AF, so they are never in the region).
      if (holds) return null;
      const l = lasso(succ, from, compl(satOf(root)));
      return l && { ...l, kind: 'counterexample' };
    }
    case 'EU': {
      if (!holds) return null;
      const allowed = new Set([...satOf(root.left), ...satOf(root.right)]);
      const p = bfs(succ, from, satOf(root.right), allowed);
      return p && { path: p, kind: 'witness' };
    }
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/evidence.ts src/core/evidence.test.ts
git commit -m "feat: witness/counterexample extraction for top-level EF, AG, EG, AF, EU"
```

---

### Task 6: UI support modules (types, colors, storage, examples)

**Files:**
- Create: `src/ui/types.ts`, `src/ui/colors.ts`, `src/ui/storage.ts`, `src/ui/examples.ts`

- [ ] **Step 1: Implement all four modules** (thin, no TDD; covered indirectly by the App smoke test)

`src/ui/types.ts`:

```ts
import { CTLNode, ParseError } from '../core/ctl-parser';
import { EvaluationRecord } from '../core/ctl-checker';

export interface FormulaEntry {
  id: string;
  text: string;
}

export interface Analysis {
  entry: FormulaEntry;
  ast?: CTLNode;
  error?: ParseError;
  record?: EvaluationRecord;
}

export type Selection =
  | { kind: 'state'; id: string }
  | { kind: 'formula'; id: string }
  | null;
```

`src/ui/colors.ts`:

```ts
const PALETTE = [
  '#e05252', '#3a9ec2', '#52b788', '#e0a52e',
  '#9b6dd6', '#d66d9b', '#2ab5a5', '#7f8c3a',
];

export function colorForNode(nodeId: number): string {
  return PALETTE[nodeId % PALETTE.length];
}

export const EVIDENCE_COLOR = '#ff7f2a';
```

`src/ui/storage.ts`:

```ts
import { KripkeStructure } from '../core/kripke';
import { FormulaEntry } from './types';

const KEY = 'temporal-logic-explorer-v1';

export interface SavedState {
  model: KripkeStructure;
  formulas: FormulaEntry[];
}

export function loadSaved(): SavedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateSavedState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function save(state: SavedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full/unavailable — persistence is best-effort
  }
}

export function validateSavedState(x: unknown): x is SavedState {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  const m = o.model as Record<string, unknown> | undefined;
  if (!m || !Array.isArray(m.states) || !Array.isArray(m.transitions)) return false;
  if (!m.states.every((s: unknown) => {
    const st = s as Record<string, unknown>;
    return typeof st.id === 'string' && typeof st.name === 'string'
      && Array.isArray(st.propositions) && st.propositions.every((p: unknown) => typeof p === 'string')
      && typeof st.isInitial === 'boolean'
      && typeof st.x === 'number' && typeof st.y === 'number';
  })) return false;
  const stateIds = new Set((m.states as { id: string }[]).map((s) => s.id));
  if (!m.transitions.every((t: unknown) => {
    const tr = t as Record<string, unknown>;
    return typeof tr.from === 'string' && typeof tr.to === 'string'
      && stateIds.has(tr.from) && stateIds.has(tr.to);
  })) return false;
  if (!Array.isArray(o.formulas)) return false;
  return (o.formulas as unknown[]).every((f) => {
    const fe = f as Record<string, unknown>;
    return typeof fe.id === 'string' && typeof fe.text === 'string';
  });
}
```

`src/ui/examples.ts`:

```ts
import { KripkeStructure } from '../core/kripke';
import { FormulaEntry } from './types';

export interface Example {
  name: string;
  model: KripkeStructure;
  formulas: FormulaEntry[];
}

export const EXAMPLES: Example[] = [
  {
    name: 'Reset system (AG EF)',
    model: {
      states: [
        { id: 's0', name: 'work', propositions: ['w'], isInitial: true, x: 160, y: 140 },
        { id: 's1', name: 'error', propositions: [], isInitial: false, x: 380, y: 140 },
        { id: 's2', name: 'reset', propositions: ['r'], isInitial: false, x: 270, y: 320 },
      ],
      transitions: [
        { from: 's0', to: 's0' }, { from: 's0', to: 's1' },
        { from: 's1', to: 's2' }, { from: 's2', to: 's0' },
      ],
    },
    formulas: [
      { id: 'f1', text: 'AG EF r' },
      { id: 'f2', text: 'AF r' },
      { id: 'f3', text: 'AG (w -> EX true)' },
    ],
  },
  {
    name: 'Mutual exclusion',
    model: {
      states: [
        { id: 'n', name: 'idle', propositions: [], isInitial: true, x: 270, y: 120 },
        { id: 'c1', name: 'crit1', propositions: ['c1'], isInitial: false, x: 140, y: 300 },
        { id: 'c2', name: 'crit2', propositions: ['c2'], isInitial: false, x: 400, y: 300 },
      ],
      transitions: [
        { from: 'n', to: 'c1' }, { from: 'n', to: 'c2' },
        { from: 'c1', to: 'n' }, { from: 'c2', to: 'n' },
      ],
    },
    formulas: [
      { id: 'f1', text: 'AG !(c1 & c2)' },
      { id: 'f2', text: 'AG EF c1' },
      { id: 'f3', text: 'A[!c2 U c1]' },
    ],
  },
  {
    name: 'Deadlock demo',
    model: {
      states: [
        { id: 's0', name: 'alive', propositions: ['p'], isInitial: true, x: 180, y: 200 },
        { id: 's1', name: 'stuck', propositions: [], isInitial: false, x: 400, y: 200 },
      ],
      transitions: [
        { from: 's0', to: 's0' }, { from: 's0', to: 's1' },
      ],
    },
    formulas: [
      { id: 'f1', text: 'AG EF p' },
      { id: 'f2', text: 'AX false' },
    ],
  },
];
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build` — Expected: success (modules unused as yet).

- [ ] **Step 3: Commit**

```bash
git add src/ui/types.ts src/ui/colors.ts src/ui/storage.ts src/ui/examples.ts
git commit -m "feat: UI support modules — types, palette, localStorage, examples"
```

---

### Task 7: App shell — state management, layout, styles

**Files:**
- Create: `src/ui/Header.tsx`, `src/ui/FormulaPanel.tsx`, `src/ui/Canvas.tsx` (stub), `src/ui/Inspector.tsx` (stub)
- Modify: `src/ui/App.tsx` (replace placeholder), `src/styles.css` (replace placeholder)
- Test: `src/ui/App.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

`src/ui/App.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => localStorage.clear());
  it('renders the three panes with the default example', () => {
    render(<App />);
    expect(screen.getByText('Temporal Logic Explorer')).toBeTruthy();
    expect(screen.getByText('AG EF r')).toBeTruthy(); // formula row (pretty-printed)
    expect(screen.getByPlaceholderText(/add formula/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` — Expected: FAIL (placeholder App has no such content).

- [ ] **Step 3: Implement styles**

`src/styles.css` (full replacement):

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; font-size: 14px; color: #222; }
#root { height: 100vh; display: flex; flex-direction: column; }

.header { display: flex; align-items: center; gap: 16px; padding: 8px 14px;
  border-bottom: 1px solid #ddd; background: #fafafa; }
.header h1 { font-size: 16px; margin: 0; }
.tabs { display: flex; gap: 4px; }
.tab { padding: 4px 12px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; }
.tab.active { background: #2b6cb0; color: #fff; border-color: #2b6cb0; }
.tab:disabled { opacity: 0.45; cursor: not-allowed; }
.header .spacer { flex: 1; }
.header select, .header button { padding: 4px 8px; }

.main { flex: 1; display: flex; min-height: 0; }
.pane { overflow-y: auto; }
.pane.left { flex: 0 0 24%; border-right: 1px solid #ddd; padding: 10px; }
.pane.center { flex: 1; position: relative; overflow: hidden; }
.pane.right { flex: 0 0 26%; border-left: 1px solid #ddd; padding: 10px; }

.formula-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border: 1px solid #ddd; border-radius: 4px; margin-bottom: 6px; cursor: pointer; }
.formula-row.selected { border-color: #2b6cb0; background: #ebf4ff; }
.formula-row .verdict { font-weight: 700; }
.formula-row .verdict.true { color: #2f855a; }
.formula-row .verdict.false { color: #c53030; }
.formula-row .verdict.none { color: #999; }
.formula-row .text { flex: 1; font-family: ui-monospace, monospace; }
.formula-row .remove { border: none; background: none; cursor: pointer; color: #999; }
.formula-input { width: 100%; padding: 6px; font-family: ui-monospace, monospace; }
.parse-error { color: #c53030; font-size: 12px; margin: 4px 0; white-space: pre-wrap; }
.hint { color: #975a16; font-size: 12px; }

.canvas-svg { width: 100%; height: 100%; display: block; background: #fdfdfd; cursor: crosshair; }
.canvas-help { position: absolute; bottom: 6px; left: 10px; color: #999; font-size: 12px;
  pointer-events: none; }

.node-row { display: flex; align-items: center; gap: 6px; padding: 3px 6px;
  border-radius: 4px; cursor: pointer; font-family: ui-monospace, monospace; }
.node-row:hover { background: #f0f0f0; }
.node-row.selected { background: #ebf4ff; outline: 1px solid #2b6cb0; }
.swatch { width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto; }
.gloss { color: #666; font-size: 12px; font-style: italic; margin: 6px 0; }
.stepper { display: flex; align-items: center; gap: 6px; margin: 8px 0; }
.stepper button { padding: 2px 8px; }
.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
  color: #888; margin: 14px 0 6px; }
.muted { color: #888; font-size: 12px; }

.evidence-path { stroke-dasharray: 10 6; animation: dashmove 1.2s linear infinite; }
@keyframes dashmove { to { stroke-dashoffset: -32; } }
```

- [ ] **Step 4: Implement stubs and shell components**

`src/ui/Canvas.tsx` (stub, fully implemented in Tasks 8–9):

```tsx
import { KripkeStructure } from '../core/kripke';
import { Evidence } from '../core/evidence';

export interface Highlight {
  sat: Set<string>;
  fresh: Set<string>;
  color: string;
}

export interface CanvasProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selectedStateId: string | null;
  onSelectState: (id: string | null) => void;
  highlight: Highlight | null;
  evidence: Evidence | null;
  deadlocks: Set<string>;
}

export default function Canvas(_props: CanvasProps) {
  return <div className="canvas-help">canvas coming in Task 8</div>;
}
```

`src/ui/Inspector.tsx` (stub, fully implemented in Task 10):

```tsx
import { KripkeStructure } from '../core/kripke';
import { Analysis, Selection } from './types';

export interface InspectorProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selection: Selection;
  analysis: Analysis | null;
  selectedNodeId: number | null;
  onSelectNode: (id: number | null) => void;
  stepIndex: number | null;
  onStepIndex: (i: number | null) => void;
  showEvidence: boolean;
  onShowEvidence: (b: boolean) => void;
}

export default function Inspector(_props: InspectorProps) {
  return <div className="muted">inspector coming in Task 10</div>;
}
```

`src/ui/Header.tsx`:

```tsx
import { useRef } from 'react';
import { EXAMPLES } from './examples';
import { SavedState, validateSavedState } from './storage';

interface HeaderProps {
  onLoadExample: (index: number) => void;
  onImport: (s: SavedState) => void;
  exportState: () => SavedState;
}

export default function Header({ onLoadExample, onImport, exportState }: HeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function doExport() {
    const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'temporal-logic-model.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function doImport(file: File) {
    file.text().then((text) => {
      try {
        const parsed = JSON.parse(text);
        if (!validateSavedState(parsed)) throw new Error('not a valid model file');
        onImport(parsed);
      } catch (e) {
        alert(`Import failed: ${e instanceof Error ? e.message : 'invalid JSON'}`);
      }
    });
  }

  return (
    <div className="header">
      <h1>Temporal Logic Explorer</h1>
      <div className="tabs">
        <button className="tab" disabled title="Coming later">LTL</button>
        <button className="tab active">CTL</button>
        <button className="tab" disabled title="Coming later">CTL*</button>
      </div>
      <div className="spacer" />
      <select
        value=""
        onChange={(e) => { if (e.target.value !== '') onLoadExample(Number(e.target.value)); }}
      >
        <option value="">Load example…</option>
        {EXAMPLES.map((ex, i) => <option key={ex.name} value={i}>{ex.name}</option>)}
      </select>
      <button onClick={doExport}>Export</button>
      <button onClick={() => fileRef.current?.click()}>Import</button>
      <input
        ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }}
      />
    </div>
  );
}
```

`src/ui/FormulaPanel.tsx`:

```tsx
import { useState } from 'react';
import { pretty } from '../core/ctl-parser';
import { Analysis } from './types';

interface FormulaPanelProps {
  analyses: Analysis[];
  selectedFormulaId: string | null;
  onSelect: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}

export default function FormulaPanel({ analyses, selectedFormulaId, onSelect, onAdd, onRemove }: FormulaPanelProps) {
  const [draft, setDraft] = useState('');

  function submit() {
    const t = draft.trim();
    if (t === '') return;
    onAdd(t);
    setDraft('');
  }

  return (
    <div>
      <input
        className="formula-input"
        placeholder="Add formula, e.g. AG EF p — press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <div style={{ marginTop: 8 }}>
        {analyses.map((a) => {
          const verdict = a.error ? '⚠'
            : a.record?.verdict === true ? '✓'
            : a.record?.verdict === false ? '✗' : '–';
          const cls = a.record?.verdict === true ? 'true'
            : a.record?.verdict === false ? 'false' : 'none';
          return (
            <div
              key={a.entry.id}
              className={`formula-row ${a.entry.id === selectedFormulaId ? 'selected' : ''}`}
              onClick={() => onSelect(a.entry.id)}
            >
              <span className={`verdict ${cls}`}>{verdict}</span>
              <span className="text">{a.ast ? pretty(a.ast) : a.entry.text}</span>
              <button
                className="remove"
                title="Remove"
                onClick={(e) => { e.stopPropagation(); onRemove(a.entry.id); }}
              >×</button>
            </div>
          );
        })}
        {analyses.length === 0 && <div className="muted">No formulas yet.</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement App**

`src/ui/App.tsx` (full replacement):

```tsx
import { useEffect, useMemo, useState } from 'react';
import { KripkeStructure } from '../core/kripke';
import { parseCTL, ParseError } from '../core/ctl-parser';
import { checkCTL } from '../core/ctl-checker';
import { findEvidence } from '../core/evidence';
import { Analysis, FormulaEntry, Selection } from './types';
import { colorForNode } from './colors';
import { loadSaved, save, SavedState } from './storage';
import { EXAMPLES } from './examples';
import Header from './Header';
import FormulaPanel from './FormulaPanel';
import Canvas, { Highlight } from './Canvas';
import Inspector from './Inspector';

let idCounter = 0;
function freshId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${idCounter++}`;
}

export default function App() {
  const [model, setModel] = useState<KripkeStructure>(() => loadSaved()?.model ?? EXAMPLES[0].model);
  const [formulas, setFormulas] = useState<FormulaEntry[]>(() => loadSaved()?.formulas ?? EXAMPLES[0].formulas);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  useEffect(() => { save({ model, formulas }); }, [model, formulas]);

  const analyses: Analysis[] = useMemo(() =>
    formulas.map((entry) => {
      try {
        const ast = parseCTL(entry.text);
        return { entry, ast, record: checkCTL(model, ast) };
      } catch (e) {
        if (e instanceof ParseError) return { entry, error: e };
        throw e;
      }
    }), [formulas, model]);

  const selectedFormulaId = selection?.kind === 'formula' ? selection.id : null;
  const selectedAnalysis = analyses.find((a) => a.entry.id === selectedFormulaId) ?? null;

  const highlight: Highlight | null = useMemo(() => {
    if (!selectedAnalysis?.record || selectedNodeId === null) return null;
    const nr = selectedAnalysis.record.results.get(selectedNodeId);
    if (!nr) return null;
    const last = nr.iterations.length - 1;
    const idx = stepIndex === null ? last : Math.min(stepIndex, last);
    const cur = nr.iterations[idx];
    const prev = idx > 0 ? nr.iterations[idx - 1] : new Set<string>();
    const fresh = stepIndex === null ? new Set<string>() : new Set([...cur].filter((s) => !prev.has(s)));
    return { sat: cur, fresh, color: colorForNode(selectedNodeId) };
  }, [selectedAnalysis, selectedNodeId, stepIndex]);

  const evidence = useMemo(() => {
    if (!showEvidence || !selectedAnalysis?.record || !selectedAnalysis.ast) return null;
    const { record, ast } = selectedAnalysis;
    const rootSat = record.results.get(ast.id)!.sat;
    const initials = model.states.filter((s) => s.isInitial);
    const from = initials.find((s) => !rootSat.has(s.id)) ?? initials[0];
    return from ? findEvidence(model, record, ast, from.id) : null;
  }, [showEvidence, selectedAnalysis, model]);

  // Selecting a different formula or editing resets node/step sub-selection.
  function selectFormula(id: string) {
    setSelection({ kind: 'formula', id });
    setSelectedNodeId(null);
    setStepIndex(null);
  }

  function selectState(id: string | null) {
    setSelection(id === null ? null : { kind: 'state', id });
  }

  function loadState(s: SavedState) {
    setModel(s.model);
    setFormulas(s.formulas);
    setSelection(null);
    setSelectedNodeId(null);
    setStepIndex(null);
    setShowEvidence(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') setSelection(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection?.kind === 'state') {
        const id = selection.id;
        setModel((m) => ({
          states: m.states.filter((s) => s.id !== id),
          transitions: m.transitions.filter((t) => t.from !== id && t.to !== id),
        }));
        setSelection(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  return (
    <>
      <Header
        onLoadExample={(i) => loadState({
          model: structuredClone(EXAMPLES[i].model),
          formulas: structuredClone(EXAMPLES[i].formulas),
        })}
        onImport={loadState}
        exportState={() => ({ model, formulas })}
      />
      <div className="main">
        <div className="pane left">
          <FormulaPanel
            analyses={analyses}
            selectedFormulaId={selectedFormulaId}
            onSelect={selectFormula}
            onAdd={(text) => setFormulas((f) => [...f, { id: freshId('f'), text }])}
            onRemove={(id) => {
              setFormulas((f) => f.filter((x) => x.id !== id));
              if (selectedFormulaId === id) setSelection(null);
            }}
          />
        </div>
        <div className="pane center">
          <Canvas
            model={model}
            onChange={setModel}
            selectedStateId={selection?.kind === 'state' ? selection.id : null}
            onSelectState={selectState}
            highlight={highlight}
            evidence={evidence}
            deadlocks={new Set(analyses[0]?.record?.deadlocks ?? [])}
          />
        </div>
        <div className="pane right">
          <Inspector
            model={model}
            onChange={setModel}
            selection={selection}
            analysis={selectedAnalysis ?? (selection?.kind === 'state' ? analyses.find((a) => a.record) ?? null : null)}
            selectedNodeId={selectedNodeId}
            onSelectNode={(id) => { setSelectedNodeId(id); setStepIndex(null); }}
            stepIndex={stepIndex}
            onStepIndex={setStepIndex}
            showEvidence={showEvidence}
            onShowEvidence={setShowEvidence}
          />
        </div>
      </div>
    </>
  );
}
```

Note: `deadlocks` falls back to an empty set when there are no formulas; that's acceptable for now — Task 10 keeps this wiring. If no formula exists, deadlock badges are simply absent (recomputing `deadlockStates(model)` directly would also be fine; use `analyses[0]` as written to avoid an extra import).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (all core tests + App smoke test).

- [ ] **Step 7: Commit**

```bash
git add src/ui src/styles.css
git commit -m "feat: app shell — three-pane layout, formula panel, live checking, persistence"
```

---

### Task 8: Canvas rendering (read-only)

**Files:**
- Modify: `src/ui/Canvas.tsx` (replace stub)

- [ ] **Step 1: Implement rendering**

Replace `src/ui/Canvas.tsx` entirely:

```tsx
import { useRef, useState } from 'react';
import { KripkeStructure, KripkeState, stateById } from '../core/kripke';
import { Evidence } from '../core/evidence';
import { EVIDENCE_COLOR } from './colors';

export interface Highlight {
  sat: Set<string>;
  fresh: Set<string>;
  color: string;
}

export interface CanvasProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selectedStateId: string | null;
  onSelectState: (id: string | null) => void;
  highlight: Highlight | null;
  evidence: Evidence | null;
  deadlocks: Set<string>;
}

export const R = 28;

export function edgePath(a: KripkeState, b: KripkeState, curved: boolean): string {
  if (a.id === b.id) {
    return `M ${a.x - 10} ${a.y - R + 4} C ${a.x - 45} ${a.y - R - 52}, ${a.x + 45} ${a.y - R - 52}, ${a.x + 10} ${a.y - R + 4}`;
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  const sx = a.x + ux * R, sy = a.y + uy * R;
  const ex = b.x - ux * R, ey = b.y - uy * R;
  if (!curved) return `M ${sx} ${sy} L ${ex} ${ey}`;
  const mx = (sx + ex) / 2 - uy * 22, my = (sy + ey) / 2 + ux * 22;
  return `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`;
}

export default function Canvas(props: CanvasProps) {
  const { model, selectedStateId, highlight, evidence, deadlocks } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view] = useState({ tx: 0, ty: 0, scale: 1 });

  const hasReverse = (from: string, to: string) =>
    model.transitions.some((t) => t.from === to && t.to === from);

  const evidencePairs: [KripkeState, KripkeState][] = [];
  if (evidence) {
    for (let i = 0; i + 1 < evidence.path.length; i++) {
      const a = stateById(model, evidence.path[i]);
      const b = stateById(model, evidence.path[i + 1]);
      if (a && b) evidencePairs.push([a, b]);
    }
  }

  return (
    <>
      <svg ref={svgRef} className="canvas-svg">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
          </marker>
          <marker id="arrow-ev" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={EVIDENCE_COLOR} />
          </marker>
        </defs>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {model.transitions.map((t) => {
            const a = stateById(model, t.from), b = stateById(model, t.to);
            if (!a || !b) return null;
            return (
              <path key={`${t.from}->${t.to}`}
                d={edgePath(a, b, t.from !== t.to && hasReverse(t.from, t.to))}
                fill="none" stroke="#555" strokeWidth={1.5} markerEnd="url(#arrow)" />
            );
          })}
          {evidencePairs.map(([a, b], i) => (
            <path key={`ev-${i}`} className="evidence-path"
              d={edgePath(a, b, a.id !== b.id && hasReverse(a.id, b.id))}
              fill="none" stroke={EVIDENCE_COLOR} strokeWidth={4} opacity={0.85}
              markerEnd="url(#arrow-ev)" />
          ))}
          {model.states.map((s) => {
            const inSat = highlight?.sat.has(s.id);
            const isFresh = highlight?.fresh.has(s.id);
            return (
              <g key={s.id} data-state-id={s.id}>
                {inSat && (
                  <circle cx={s.x} cy={s.y} r={R + 6} fill={isFresh ? highlight!.color : 'none'}
                    fillOpacity={isFresh ? 0.25 : 0} stroke={highlight!.color}
                    strokeWidth={isFresh ? 5 : 3.5} />
                )}
                {s.isInitial && (
                  <path d={`M ${s.x - R - 26} ${s.y - R - 12} L ${s.x - R + 3} ${s.y - R + 15}`}
                    stroke="#333" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
                )}
                <circle cx={s.x} cy={s.y} r={R} fill="#fff"
                  stroke={s.id === selectedStateId ? '#2b6cb0' : '#333'}
                  strokeWidth={s.id === selectedStateId ? 3 : s.isInitial ? 2.5 : 1.5} />
                <text x={s.x} y={s.y - 2} textAnchor="middle" fontSize={13} fontWeight={600}
                  style={{ userSelect: 'none' }}>{s.name}</text>
                <text x={s.x} y={s.y + 13} textAnchor="middle" fontSize={11} fill="#2b6cb0"
                  style={{ userSelect: 'none' }}>{s.propositions.join(',')}</text>
                {deadlocks.has(s.id) && (
                  <text x={s.x + R - 4} y={s.y - R + 4} fontSize={14} fill="#dd6b20"
                    style={{ userSelect: 'none' }}>⚠</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="canvas-help">
        click empty: add state · drag center: move · drag rim: transition · double-click: rename · Del: delete
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`. Expected: the Reset-system example renders — three labeled circles, arrows (curved where opposite pairs exist), a self-loop on `work`, an initial-state arrow into `work`. `npm test` still passes.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Canvas.tsx
git commit -m "feat: SVG canvas rendering — states, transitions, self-loops, highlights, evidence overlay"
```

---

### Task 9: Canvas interactions (editing, pan/zoom)

**Files:**
- Modify: `src/ui/Canvas.tsx`

- [ ] **Step 1: Add interaction logic**

In `src/ui/Canvas.tsx`, replace the component body (keep `R`, `edgePath`, interfaces) with:

```tsx
type Drag =
  | { type: 'move'; stateId: string; offX: number; offY: number; moved: boolean }
  | { type: 'edge'; from: string }
  | { type: 'pan'; startX: number; startY: number; origTx: number; origTy: number; moved: boolean };

export default function Canvas(props: CanvasProps) {
  const { model, onChange, selectedStateId, onSelectState, highlight, evidence, deadlocks } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 });
  const [tempEdge, setTempEdge] = useState<{ from: string; x: number; y: number } | null>(null);
  const drag = useRef<Drag | null>(null);

  function toWorld(e: { clientX: number; clientY: number }) {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.tx) / view.scale,
      y: (e.clientY - r.top - view.ty) / view.scale,
    };
  }

  function stateAt(x: number, y: number): KripkeState | undefined {
    return model.states.find((s) => Math.hypot(s.x - x, s.y - y) <= R);
  }

  function addStateAt(x: number, y: number) {
    let n = 0;
    while (model.states.some((s) => s.id === `s${n}`)) n++;
    const st: KripkeState = {
      id: `s${n}`, name: `s${n}`, propositions: [],
      isInitial: model.states.length === 0, x, y,
    };
    onChange({ ...model, states: [...model.states, st] });
    onSelectState(st.id);
  }

  function onStatePointerDown(e: PointerEvent, s: KripkeState) {
    e.stopPropagation();
    const p = toWorld(e);
    const dist = Math.hypot(p.x - s.x, p.y - s.y);
    if (dist > R - 9) {
      drag.current = { type: 'edge', from: s.id };
      setTempEdge({ from: s.id, x: p.x, y: p.y });
    } else {
      drag.current = { type: 'move', stateId: s.id, offX: p.x - s.x, offY: p.y - s.y, moved: false };
    }
  }

  function onBackgroundPointerDown(e: PointerEvent) {
    drag.current = {
      type: 'pan', startX: e.clientX, startY: e.clientY,
      origTx: view.tx, origTy: view.ty, moved: false,
    };
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.type === 'move') {
      const p = toWorld(e);
      d.moved = true;
      onChange({
        ...model,
        states: model.states.map((s) =>
          s.id === d.stateId ? { ...s, x: p.x - d.offX, y: p.y - d.offY } : s),
      });
    } else if (d.type === 'edge') {
      const p = toWorld(e);
      setTempEdge({ from: d.from, x: p.x, y: p.y });
    } else {
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      setView((v) => ({ ...v, tx: d.origTx + dx, ty: d.origTy + dy }));
    }
  }

  function onPointerUp(e: PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setTempEdge(null);
    if (!d) return;
    if (d.type === 'edge') {
      const p = toWorld(e);
      const target = stateAt(p.x, p.y);
      if (target && !model.transitions.some((t) => t.from === d.from && t.to === target.id)) {
        onChange({ ...model, transitions: [...model.transitions, { from: d.from, to: target.id }] });
      }
    } else if (d.type === 'move' && !d.moved) {
      onSelectState(d.stateId);
    } else if (d.type === 'pan' && !d.moved) {
      const p = toWorld(e);
      addStateAt(p.x, p.y);
    }
  }

  function onWheel(e: WheelEvent) {
    const factor = Math.exp(-e.deltaY * 0.001);
    setView((v) => {
      const scale = Math.min(3, Math.max(0.3, v.scale * factor));
      const r = svgRef.current!.getBoundingClientRect();
      const cx = e.clientX - r.left, cy = e.clientY - r.top;
      // keep the point under the cursor fixed while zooming
      const wx = (cx - v.tx) / v.scale, wy = (cy - v.ty) / v.scale;
      return { scale, tx: cx - wx * scale, ty: cy - wy * scale };
    });
  }

  function rename(s: KripkeState) {
    const name = window.prompt('State name', s.name);
    if (name !== null && name.trim() !== '') {
      onChange({
        ...model,
        states: model.states.map((x) => (x.id === s.id ? { ...x, name: name.trim() } : x)),
      });
    }
  }

  const hasReverse = (from: string, to: string) =>
    model.transitions.some((t) => t.from === to && t.to === from);

  const evidencePairs: [KripkeState, KripkeState][] = [];
  if (evidence) {
    for (let i = 0; i + 1 < evidence.path.length; i++) {
      const a = stateById(model, evidence.path[i]);
      const b = stateById(model, evidence.path[i + 1]);
      if (a && b) evidencePairs.push([a, b]);
    }
  }

  const tempFrom = tempEdge ? stateById(model, tempEdge.from) : undefined;

  return (
    <>
      <svg
        ref={svgRef} className="canvas-svg"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
          </marker>
          <marker id="arrow-ev" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={EVIDENCE_COLOR} />
          </marker>
        </defs>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
          {model.transitions.map((t) => {
            const a = stateById(model, t.from), b = stateById(model, t.to);
            if (!a || !b) return null;
            return (
              <path key={`${t.from}->${t.to}`}
                d={edgePath(a, b, t.from !== t.to && hasReverse(t.from, t.to))}
                fill="none" stroke="#555" strokeWidth={1.5} markerEnd="url(#arrow)" />
            );
          })}
          {tempFrom && tempEdge && (
            <line x1={tempFrom.x} y1={tempFrom.y} x2={tempEdge.x} y2={tempEdge.y}
              stroke="#2b6cb0" strokeWidth={2} strokeDasharray="6 4" />
          )}
          {evidencePairs.map(([a, b], i) => (
            <path key={`ev-${i}`} className="evidence-path"
              d={edgePath(a, b, a.id !== b.id && hasReverse(a.id, b.id))}
              fill="none" stroke={EVIDENCE_COLOR} strokeWidth={4} opacity={0.85}
              markerEnd="url(#arrow-ev)" />
          ))}
          {model.states.map((s) => {
            const inSat = highlight?.sat.has(s.id);
            const isFresh = highlight?.fresh.has(s.id);
            return (
              <g key={s.id}
                onPointerDown={(e) => onStatePointerDown(e, s)}
                onDoubleClick={(e) => { e.stopPropagation(); rename(s); }}
                style={{ cursor: 'pointer' }}
              >
                {inSat && (
                  <circle cx={s.x} cy={s.y} r={R + 6} fill={isFresh ? highlight!.color : 'none'}
                    fillOpacity={isFresh ? 0.25 : 0} stroke={highlight!.color}
                    strokeWidth={isFresh ? 5 : 3.5} />
                )}
                {s.isInitial && (
                  <path d={`M ${s.x - R - 26} ${s.y - R - 12} L ${s.x - R + 3} ${s.y - R + 15}`}
                    stroke="#333" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />
                )}
                <circle cx={s.x} cy={s.y} r={R} fill="#fff"
                  stroke={s.id === selectedStateId ? '#2b6cb0' : '#333'}
                  strokeWidth={s.id === selectedStateId ? 3 : s.isInitial ? 2.5 : 1.5} />
                <text x={s.x} y={s.y - 2} textAnchor="middle" fontSize={13} fontWeight={600}
                  style={{ userSelect: 'none' }}>{s.name}</text>
                <text x={s.x} y={s.y + 13} textAnchor="middle" fontSize={11} fill="#2b6cb0"
                  style={{ userSelect: 'none' }}>{s.propositions.join(',')}</text>
                {deadlocks.has(s.id) && (
                  <text x={s.x + R - 4} y={s.y - R + 4} fontSize={14} fill="#dd6b20"
                    style={{ userSelect: 'none' }}>⚠</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="canvas-help">
        click empty: add state · drag center: move · drag rim: transition · double-click: rename · Del: delete · wheel: zoom
      </div>
    </>
  );
}
```

Also update the imports at the top of the file to:

```tsx
import { useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { KripkeStructure, KripkeState, stateById } from '../core/kripke';
import { Evidence } from '../core/evidence';
import { EVIDENCE_COLOR } from './colors';
```

(These `PointerEvent`/`WheelEvent` are React's synthetic event types, imported explicitly because the `React` namespace is not in scope with the `react-jsx` transform.)

(`KripkeStructure` is used by `CanvasProps`; keep the existing `Highlight`/`CanvasProps`/`R`/`edgePath` definitions above the component.)

- [ ] **Step 2: Verify manually**

Run: `npm run dev`. Check each interaction:
- Click empty canvas → new state appears, selected.
- Drag a state's center → it moves; drag its rim to another state → transition; rim-drag back onto itself → self-loop.
- Double-click → rename prompt. Delete key → state and incident transitions gone. Escape → deselect.
- Wheel zooms around the cursor; dragging the background pans (small click still adds a state; a real drag does not).
- Verdicts in the left panel update live as you edit.

`npm test` still passes.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Canvas.tsx
git commit -m "feat: canvas editing — add/move/rename/delete states, draw transitions, pan/zoom"
```

---

### Task 10: Inspector

**Files:**
- Modify: `src/ui/Inspector.tsx` (replace stub)

- [ ] **Step 1: Implement**

Replace `src/ui/Inspector.tsx` entirely:

```tsx
import { useState } from 'react';
import { KripkeStructure, allPropositions, stateById } from '../core/kripke';
import { CTLNode, pretty } from '../core/ctl-parser';
import { Analysis, Selection } from './types';
import { colorForNode } from './colors';

export interface InspectorProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selection: Selection;
  analysis: Analysis | null;
  selectedNodeId: number | null;
  onSelectNode: (id: number | null) => void;
  stepIndex: number | null;
  onStepIndex: (i: number | null) => void;
  showEvidence: boolean;
  onShowEvidence: (b: boolean) => void;
}

const GLOSS: Record<string, string> = {
  AG: 'on every path, at every step',
  EG: 'on some path, at every step',
  AF: 'on every path, eventually',
  EF: 'on some path, eventually',
  AX: 'in every next state',
  EX: 'in some next state',
  AU: 'on every path, the left holds until the right does',
  EU: 'on some path, the left holds until the right does',
  and: 'both hold', or: 'at least one holds', not: 'does not hold',
  implies: 'if the left holds, so does the right', iff: 'both or neither',
  prop: 'atomic proposition', true: 'holds everywhere', false: 'holds nowhere',
};

function childrenOf(n: CTLNode): CTLNode[] {
  if ('child' in n) return [n.child];
  if ('left' in n) return [n.left, n.right];
  return [];
}

function labelOf(n: CTLNode): string {
  switch (n.kind) {
    case 'prop': return n.name;
    case 'true': case 'false': return n.kind;
    case 'not': return '¬';
    case 'and': return '∧';
    case 'or': return '∨';
    case 'implies': return '→';
    case 'iff': return '↔';
    case 'EU': return 'E[· U ·]';
    case 'AU': return 'A[· U ·]';
    default: return n.kind;
  }
}

function NodeTree(props: {
  node: CTLNode; depth: number;
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
        <span>{labelOf(node)}</span>
        <span className="muted">{pretty(node)}</span>
      </div>
      {childrenOf(node).map((c) => (
        <NodeTree key={c.id} node={c} depth={depth + 1}
          selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
      ))}
    </div>
  );
}

export default function Inspector(props: InspectorProps) {
  const {
    model, onChange, selection, analysis,
    selectedNodeId, onSelectNode, stepIndex, onStepIndex,
    showEvidence, onShowEvidence,
  } = props;
  const [newProp, setNewProp] = useState('');

  if (selection?.kind === 'state') {
    const s = stateById(model, selection.id);
    if (!s) return <div className="muted">State no longer exists.</div>;
    const props_ = allPropositions(model);
    const toggleProp = (p: string, on: boolean) => onChange({
      ...model,
      states: model.states.map((x) => x.id !== s.id ? x : {
        ...x,
        propositions: on ? [...x.propositions, p] : x.propositions.filter((q) => q !== p),
      }),
    });
    return (
      <div>
        <div className="section-title">State</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{s.name}</div>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <input type="checkbox" checked={s.isInitial}
            onChange={(e) => onChange({
              ...model,
              states: model.states.map((x) => x.id === s.id ? { ...x, isInitial: e.target.checked } : x),
            })} /> initial state
        </label>
        <div className="section-title">Propositions</div>
        {props_.map((p) => (
          <label key={p} style={{ display: 'block' }}>
            <input type="checkbox" checked={s.propositions.includes(p)}
              onChange={(e) => toggleProp(p, e.target.checked)} /> {p}
          </label>
        ))}
        <input
          className="formula-input" placeholder="new proposition + Enter" value={newProp}
          style={{ marginTop: 6 }}
          onChange={(e) => setNewProp(e.target.value)}
          onKeyDown={(e) => {
            const name = newProp.trim();
            if (e.key === 'Enter' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
              && !['true', 'false', 'A', 'E', 'U'].includes(name) && !/^[A-Z]{2}$/.test(name)) {
              toggleProp(name, true);
              setNewProp('');
            }
          }}
        />
        {analysis?.record && analysis.ast && (
          <>
            <div className="section-title">Holds here (current formula)</div>
            {(function list(n: CTLNode): JSX.Element[] {
              const here = analysis.record!.results.get(n.id)!.sat.has(s.id);
              return [
                <div key={n.id} className="muted">
                  {here ? '✓' : '✗'} {pretty(n)}
                </div>,
                ...childrenOf(n).flatMap(list),
              ];
            })(analysis.ast)}
          </>
        )}
      </div>
    );
  }

  if (selection?.kind === 'formula' && analysis) {
    if (analysis.error) {
      return (
        <div>
          <div className="section-title">Parse error</div>
          <div className="parse-error">
            {analysis.error.message} (at position {analysis.error.pos})
          </div>
          {analysis.error.hint && <div className="hint">💡 {analysis.error.hint}</div>}
        </div>
      );
    }
    const { ast, record } = analysis;
    if (!ast || !record) return null;
    const selectedResult = selectedNodeId !== null ? record.results.get(selectedNodeId) : undefined;
    const selectedNode = selectedNodeId !== null
      ? (function find(n: CTLNode): CTLNode | undefined {
          if (n.id === selectedNodeId) return n;
          for (const c of childrenOf(n)) { const r = find(c); if (r) return r; }
        })(ast)
      : undefined;
    const iterCount = selectedResult?.iterations.length ?? 0;
    const shownStep = stepIndex === null ? iterCount - 1 : Math.min(stepIndex, iterCount - 1);
    const initials = model.states.filter((st) => st.isInitial);
    const rootSat = record.results.get(ast.id)!.sat;
    return (
      <div>
        <div className="section-title">Subformulas — click to color states</div>
        <NodeTree node={ast} depth={0} selectedNodeId={selectedNodeId}
          onSelectNode={(id) => onSelectNode(id === selectedNodeId ? null : id)} />
        {selectedNode && <div className="gloss">{GLOSS[selectedNode.kind]}</div>}
        {selectedResult && iterCount > 1 && (
          <>
            <div className="section-title">Fixpoint iterations</div>
            <div className="stepper">
              <button onClick={() => onStepIndex(0)} disabled={shownStep === 0}>⏮</button>
              <button onClick={() => onStepIndex(Math.max(0, shownStep - 1))} disabled={shownStep === 0}>◀</button>
              <span>step {shownStep + 1} / {iterCount}</span>
              <button onClick={() => onStepIndex(Math.min(iterCount - 1, shownStep + 1))}
                disabled={shownStep === iterCount - 1}>▶</button>
              <button onClick={() => onStepIndex(null)} disabled={stepIndex === null}>⏭</button>
            </div>
            <div className="muted">
              {selectedResult.iterations[shownStep].size} state(s) in this approximation
            </div>
          </>
        )}
        <div className="section-title">Verdict per initial state</div>
        {initials.length === 0 && (
          <div className="muted">No initial states — mark one to get a verdict.</div>
        )}
        {initials.map((st) => (
          <div key={st.id} className="muted">
            {rootSat.has(st.id) ? '✓' : '✗'} {st.name}
          </div>
        ))}
        <div className="section-title">Evidence</div>
        <label>
          <input type="checkbox" checked={showEvidence}
            onChange={(e) => onShowEvidence(e.target.checked)} /> show witness / counterexample
        </label>
        {record.deadlocks.length > 0 && (
          <>
            <div className="section-title">Warnings</div>
            <div className="hint">
              ⚠ Deadlock state(s): {record.deadlocks.map((d) => stateById(model, d)?.name ?? d).join(', ')}.
              CTL semantics assume every state has a successor; A-quantified formulas hold
              vacuously in deadlocks.
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="muted">
      Select a formula to explore its subformulas, or a state to edit its propositions.
    </div>
  );
}
```

Note: if `JSX.Element` is not found under the current React types, use `React.ReactElement` (`import type React from 'react'`) — either satisfies the compiler; pick whichever builds.

- [ ] **Step 2: Verify manually**

Run: `npm run dev`. Check:
- Select `AG EF r` → subformula tree shows AG / EF / r rows; clicking `EF r` colors all three states; clicking again un-colors.
- With `EF r` selected, the stepper shows steps; ⏮ then ▶ walks the set growing backwards from `reset`; fresh states are filled.
- Select a state → name, initial checkbox, proposition checkboxes; adding a proposition updates canvas labels and verdicts.
- `AF r` shows ✗; toggling "show witness / counterexample" draws the animated orange self-loop lasso on `work`.
- Enter `FG p` in the formula input → ⚠ row; selecting it shows the LTL hint.

`npm test` still passes.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Inspector.tsx
git commit -m "feat: inspector — subformula tree, fixpoint stepper, glosses, state editor, evidence toggle"
```

---

### Task 11: End-to-end polish + README

**Files:**
- Create: `README.md`
- Modify: anything surfaced by the walkthrough below

- [ ] **Step 1: Full manual walkthrough**

Run: `npm run dev` and walk through every spec behavior:

1. Load each of the three examples; verify formulas, verdicts, deadlock badge on `stuck` (Deadlock demo), and the deadlock warning in the inspector when a formula is selected.
2. Build a model from scratch on an empty canvas (use Export → hand-edit is not needed; just Delete all states first): first added state becomes initial automatically; formulas show `–` (no verdict) when no initial state exists — verify by unchecking `initial`.
3. `AG EF r` on Reset system: step through the inner `EF r` fixpoint; verify colors match `[reset] → [error, reset] → [work, error, reset]`.
4. Witnesses: `EF r` ✓ (path work→error→reset), `AF r` ✗ (lasso on work), `AG w` ✗ (path to error).
5. Export the model, reload the page (persistence), Import the file, and Import a garbage file (expect a friendly alert).
6. Reload the browser: model and formulas restored from localStorage.

Fix anything broken; keep fixes small and commit them individually with descriptive messages.

- [ ] **Step 2: Run the full test suite and build**

Run: `npm test && npm run build` — Expected: both pass.

- [ ] **Step 3: Write README**

`README.md`:

```markdown
# Temporal Logic Explorer

A client-side playground for exploring temporal logic formulas against Kripke
structures — built to learn CTL (and eventually LTL and CTL*) by seeing it.

## Run

    npm install
    npm run dev

## Use

- **Canvas:** click empty space to add a state, drag a state's center to move it,
  drag its rim to another state (or itself) to add a transition, double-click to
  rename, Delete to remove, mouse wheel to zoom.
- **Formulas (left):** type CTL, press Enter. ASCII syntax: `! & | -> <->`,
  `AX EX AF EF AG EG`, `A[p U q]`, `E[p U q]`.
- **Inspector (right):** select a formula and click a subformula to color the
  states satisfying it; step through fixpoint iterations; toggle
  witness/counterexample paths. Select a state to edit its propositions.

Everything is checked live on every edit and saved to localStorage.

## Roadmap

LTL on lasso traces → LTL over the structure (Büchi) → CTL*. See
`docs/superpowers/specs/` for the design.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with usage and roadmap"
```
