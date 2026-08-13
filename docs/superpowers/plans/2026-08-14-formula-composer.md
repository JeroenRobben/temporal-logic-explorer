# Formula Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assistive formula entry — live errors with one-click fixes, proposition chips, logic-aware operator palette with snippet holes, live pretty+gloss preview, syntax highlighting, edit-in-place, and wrap/swap gestures on inspector trees.

**Architecture:** Three new pure modules (`highlight`, `gloss`, `formulaEdits`), a `ParseError.fix` extension populated at deterministic-rewrite throw sites in all three parsers, a new `Composer` component (overlay-textarea highlighting, hole navigation, status line) slotted into FormulaPanel, and an inspector gesture row wired through a new `onUpdateFormula` path in App.

**Tech Stack:** Existing React 18 + TS + Vite + Vitest. No new dependencies. Tests ONLY via `npm test`.

**Spec:** `docs/superpowers/specs/2026-08-14-formula-composer-design.md`
**Baseline:** branch `feature/formula-composer`, 296 tests passing.

---

## File map

```
src/core/ctl-parser.ts        — MODIFY: ParseError.fix field; fix at LTL-glued site? (no deterministic fix in CTL — hint only; ParseError class lives here)
src/core/ltl-parser.ts        — MODIFY: fixes (glued FG→F G; quantifier-drop AG p→G p)
src/core/ctlstar-parser.ts    — MODIFY: fixes (glued AG→A G; bracket A[..]→A (..); glued FG→F G)
src/core/*-parser.test.ts     — MODIFY: fix-field tests
src/ui/highlight.ts(.test.ts) — NEW: coloring tokenizer
src/ui/gloss.ts(.test.ts)     — NEW: English paraphrase
src/ui/formulaEdits.ts(.test.ts) — NEW: wrap/swap AST surgery
src/ui/Composer.tsx           — NEW: the composer
src/ui/FormulaPanel.tsx       — MODIFY: use Composer; ✎ edit; editing state
src/ui/App.tsx                — MODIFY: onUpdateFormula, gesture handler + notice, pass model/onSwitchLogic
src/ui/Inspector.tsx          — MODIFY: gesture row
src/styles.css                — MODIFY: composer/token/gesture styles
src/ui/Composer.test.tsx      — NEW: integration tests
src/ui/App.test.tsx           — MODIFY: gesture/edit integration + re-anchor if needed
README.md                     — MODIFY (Task 5)
```

---

### Task 1: ParseError.fix + parser fix sites

**Files:**
- Modify: `src/core/ctl-parser.ts`, `src/core/ltl-parser.ts`, `src/core/ctlstar-parser.ts`
- Test: `src/core/ltl-parser.test.ts`, `src/core/ctlstar-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/core/ltl-parser.test.ts`:

```ts
describe('ParseError.fix', () => {
  it('glued FG offers a spacing fix that reparses', () => {
    try {
      parseLTL('FG p');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      expect(fix.replacement).toBe('F G p');
      expect(() => parseLTL(fix.replacement)).not.toThrow();
    }
  });
  it('CTL-quantified token offers a drop-the-quantifier fix', () => {
    try {
      parseLTL('AG p');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      expect(fix.replacement).toBe('G p');
      expect(() => parseLTL(fix.replacement)).not.toThrow();
    }
  });
  it('fix preserves surrounding text', () => {
    try {
      parseLTL('p & FG q');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).fix!.replacement).toBe('p & F G q');
    }
  });
});
```

Append to `src/core/ctlstar-parser.test.ts`:

```ts
describe('ParseError.fix', () => {
  it('glued CTL token offers a spacing fix', () => {
    try {
      parseCTLStar('AG p');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      expect(fix.replacement).toBe('A G p');
      expect(() => parseCTLStar(fix.replacement)).not.toThrow();
    }
  });
  it('bracket syntax offers a parenthesized rewrite', () => {
    try {
      parseCTLStar('A[p U q]');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      expect(fix.replacement).toBe('A (p U q)');
      expect(() => parseCTLStar(fix.replacement)).not.toThrow();
    }
  });
  it('bracket fix handles nested brackets', () => {
    try {
      parseCTLStar('E[p U A[q U r]]');
      expect.fail('should throw');
    } catch (e) {
      const fix = (e as ParseError).fix!;
      // outer bracket rewritten; inner remains (will error again with its own fix on next parse)
      expect(fix.replacement).toBe('E (p U A[q U r])');
    }
  });
  it('glued LTL token offers a spacing fix', () => {
    try {
      parseCTLStar('A FG p');
      expect.fail('should throw');
    } catch (e) {
      expect((e as ParseError).fix!.replacement).toBe('A F G p');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL (`fix` undefined). 296 existing pass.

- [ ] **Step 3: Implement**

1. `src/core/ctl-parser.ts` — extend the class (all parsers share it):

```ts
export class ParseError extends Error {
  constructor(
    message: string,
    public pos: number,
    public hint?: string,
    /** Machine-applicable one-click rewrite of the WHOLE input, when deterministic. */
    public fix?: { label: string; replacement: string },
  ) {
    super(message);
    this.name = 'ParseError';
  }
}
```

2. `src/core/ltl-parser.ts` — the Parser needs the raw input for replacements. Change construction: `class Parser { constructor(private tokens: Token[], private input: string) {} }` and `parseLTL`: `new Parser(lex(input), input).parse()`. Add a helper in the class:

```ts
  private replaceToken(t: Token, replacement: string): string {
    return this.input.slice(0, t.pos) + replacement + this.input.slice(t.pos + t.text.length);
  }
```

At the CTL-quantified throw site, append the 4th arg:

```ts
          throw new ParseError(
            `'${t.text}' uses a path quantifier — that's CTL, not LTL`,
            t.pos,
            'In LTL, drop the A/E: write G p, F p, X p, or p U q.',
            /^[AE][XFG]$/.test(t.text)
              ? { label: `Drop the quantifier: ${t.text[1]} …`, replacement: this.replaceToken(t, t.text[1]) }
              : undefined,
          );
```

(No fix for `A[`-bracket in LTL — dropping the quantifier from an until needs judgment.) At the glued-spacing throw site:

```ts
          throw new ParseError(
            `'${t.text}' — LTL operators need spaces between them`,
            t.pos,
            `Write ${t.text.split('').join(' ')} p.`,
            { label: `Insert spaces: ${t.text.split('').join(' ')}`, replacement: this.replaceToken(t, t.text.split('').join(' ')) },
          );
```

3. `src/core/ctlstar-parser.ts` — same `input` plumbing + `replaceToken` helper. Glued-CTL site:

```ts
          throw new ParseError(
            `'${t.text}' — in CTL* the quantifier and operator are separate`,
            t.pos,
            `Write ${t.text[0]} ${t.text[1]} p.`,
            { label: `Insert space: ${t.text[0]} ${t.text[1]}`, replacement: this.replaceToken(t, `${t.text[0]} ${t.text[1]}`) },
          );
```

Glued-LTL site: same pattern as the LTL parser's spacing fix. Bracket site — rewrite `X[…]` to `X (…)` by scanning for the MATCHING `]` from the `[` (nesting-aware):

```ts
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
```

CAREFUL: verify the nested-bracket test — `E[p U A[q U r]]`: open at index 1, matching close is the LAST `]` (depth-aware ✓), giving `E (p U A[q U r])`. The inner bracket stays; reparse of the replacement throws again with its own fix — that's the intended progressive-fix behavior; the test asserts the replacement string only for the nested case (not reparse-clean).

Also update the plain lex()-call sites in both files (`parseLTL`/`parseCTLStar`) to pass `input`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (296 + 7 = 303). The nested-bracket case does NOT assert reparse-clean (documented above); all other fixes must reparse cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/core/ctl-parser.ts src/core/ltl-parser.ts src/core/ctlstar-parser.ts src/core/ltl-parser.test.ts src/core/ctlstar-parser.test.ts
git commit -m "feat: machine-applicable quick fixes on parse errors"
```

---

### Task 2: highlight.ts + gloss.ts

**Files:**
- Create: `src/ui/highlight.ts`, `src/ui/gloss.ts`
- Test: `src/ui/highlight.test.ts`, `src/ui/gloss.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/ui/highlight.test.ts`:

```ts
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
```

`src/ui/gloss.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCTL } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';
import { glossify } from './gloss';

describe('glossify', () => {
  it('renders CTL operators', () => {
    expect(glossify(parseCTL('AG EF r'), 'ctl'))
      .toBe('on every path, at every step, on some path, eventually r');
    expect(glossify(parseCTL('A[p U q]'), 'ctl'))
      .toBe('on every path, p until q');
  });
  it('renders LTL operators', () => {
    expect(glossify(parseLTL('G (p -> F q)'), 'ltl'))
      .toBe('at every step, if p then eventually q');
    expect(glossify(parseLTL('X p'), 'ltl')).toBe('in the next step, p');
  });
  it('renders CTL* quantifiers', () => {
    expect(glossify(parseCTLStar('A G (E F p)'), 'ctlstar'))
      .toBe('on every path, at every step, on some path, eventually p');
  });
  it('renders booleans', () => {
    expect(glossify(parseCTL('p & !q'), 'ctl')).toBe('p and not q');
    expect(glossify(parseLTL('p <-> q'), 'ltl')).toBe('p exactly when q');
  });
  it('bounds depth at 3 with ellipsis', () => {
    const g = glossify(parseLTL('G (F (X (p U q)))'), 'ltl');
    expect(g.startsWith('at every step, eventually, in the next step')).toBe(true);
    expect(g.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./highlight` / `./gloss`.

- [ ] **Step 3: Implement**

`src/ui/highlight.ts`:

```ts
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
```

`src/ui/gloss.ts`:

```ts
import { CTLNode } from '../core/ctl-parser';
import { LTLNode } from '../core/ltl-parser';
import { StarNode } from '../core/ctlstar-parser';
import { Logic } from './types';

type AnyNode = CTLNode | LTLNode | StarNode;

const MAX_DEPTH = 3;

/** Bounded-depth English paraphrase of a formula. Depth counts operator
 *  nesting; structure below MAX_DEPTH renders as an ellipsis. */
export function glossify(node: AnyNode, logic: Logic): string {
  void logic; // kinds are disjoint enough that the node shape determines the phrase
  return go(node as AnyNode, 0);
}

function go(n: AnyNode, depth: number): string {
  if (depth >= MAX_DEPTH && n.kind !== 'prop' && n.kind !== 'true' && n.kind !== 'false') {
    return '…';
  }
  const d = depth + 1;
  switch (n.kind) {
    case 'true': return 'true';
    case 'false': return 'false';
    case 'prop': return n.name;
    case 'not': return `not ${go(n.child, d)}`;
    case 'and': return `${go(n.left, d)} and ${go(n.right, d)}`;
    case 'or': return `${go(n.left, d)} or ${go(n.right, d)}`;
    case 'implies': return `if ${go(n.left, d)} then ${go(n.right, d)}`;
    case 'iff': return `${go(n.left, d)} exactly when ${go(n.right, d)}`;
    // CTL
    case 'AG': return `on every path, at every step, ${go(n.child, d)}`;
    case 'EG': return `on some path, at every step, ${go(n.child, d)}`;
    case 'AF': return `on every path, eventually ${go(n.child, d)}`;
    case 'EF': return `on some path, eventually ${go(n.child, d)}`;
    case 'AX': return `in every next state, ${go(n.child, d)}`;
    case 'EX': return `in some next state, ${go(n.child, d)}`;
    case 'AU': return `on every path, ${go(n.left, d)} until ${go(n.right, d)}`;
    case 'EU': return `on some path, ${go(n.left, d)} until ${go(n.right, d)}`;
    // LTL / CTL* path operators
    case 'G': return `at every step, ${go(n.child, d)}`;
    case 'F': return `eventually ${go(n.child, d)}`;
    case 'X': return `in the next step, ${go(n.child, d)}`;
    case 'U': return `${go(n.left, d)} until ${go(n.right, d)}`;
    // CTL* quantifiers
    case 'A': return `on every path, ${go(n.child, d)}`;
    case 'E': return `on some path, ${go(n.child, d)}`;
  }
}
```

CAREFUL with the depth test: `G (F (X (p U q)))` — G at depth 0→children at 1, F→2, X→3; at depth 3 the `U` node returns '…'. Output: `at every step, eventually, in the next step, …`. The test asserts startsWith + endsWith — verify comma placement (`eventually` glosses append the child straight after a space: "eventually, in the next step" needs `eventually` to be rendered as `eventually ${child}` — for an X child that yields "eventually in the next step, …" WITHOUT the comma after "eventually". Re-check the test's startsWith string: 'at every step, eventually, in the next step' — that expects a comma after "eventually" which the code does NOT produce. FIX THE TEST, not the code: assert `.toBe('at every step, eventually in the next step, …')` — hand-verify at implementation time and pin the exact actual string (report it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (303 + 11 = 314, exact gloss strings pinned per the note above).

- [ ] **Step 5: Commit**

```bash
git add src/ui/highlight.ts src/ui/highlight.test.ts src/ui/gloss.ts src/ui/gloss.test.ts
git commit -m "feat: coloring tokenizer and English gloss for formulas"
```

---

### Task 3: formulaEdits.ts

**Files:**
- Create: `src/ui/formulaEdits.ts`
- Test: `src/ui/formulaEdits.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/ui/formulaEdits.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wrapNode, swapQuantifier } from './formulaEdits';
import { parseCTL, pretty as prettyCTL } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';

// node ids are deterministic: re-parse the text to find target ids
function ctlNodeId(text: string, pick: (k: string) => boolean): number {
  const ast = parseCTL(text);
  let found = -1;
  (function walk(n: import('../core/ctl-parser').CTLNode) {
    if (found === -1 && pick(n.kind === 'prop' ? n.name : n.kind)) found = n.id;
    if ('child' in n) walk(n.child);
    if ('left' in n) { walk(n.left); walk(n.right); }
  })(ast);
  return found;
}

describe('wrapNode', () => {
  it('wraps a CTL subformula and re-emits the whole formula', () => {
    const id = ctlNodeId('p & q', (k) => k === 'q');
    expect(wrapNode('ctl', 'p & q', id, 'AG')).toBe('p ∧ AG q');
  });
  it('wraps the root', () => {
    const id = ctlNodeId('EF r', (k) => k === 'EF');
    expect(wrapNode('ctl', 'EF r', id, 'AG')).toBe('AG EF r');
  });
  it('negates', () => {
    const id = ctlNodeId('p', (k) => k === 'p');
    expect(wrapNode('ctl', 'p', id, 'not')).toBe('¬p');
  });
  it('LTL wrap', () => {
    const ast = parseLTL('F p');
    expect(wrapNode('ltl', 'F p', ast.id, 'G')).toBe('G F p');
  });
  it('CTL* wrap of an inner state node', () => {
    // wrap the E F p subtree of 'A G (E F p)' with another A — still parses
    const star = parseCTLStar('A G (E F p)');
    // find the E node
    let eId = -1;
    (function walk(n: import('../core/ctlstar-parser').StarNode) {
      if (n.kind === 'E') eId = n.id;
      if ('child' in n) walk(n.child);
      if ('left' in n) { walk(n.left); walk(n.right); }
    })(star);
    const out = wrapNode('ctlstar', 'A G (E F p)', eId, 'A')!;
    expect(() => parseCTLStar(out)).not.toThrow();
    expect(out).toContain('A E F p');
  });
  it('rejects a CTL* wrap that would make the root path-level', () => {
    const star = parseCTLStar('p');
    expect(wrapNode('ctlstar', 'p', star.id, 'G')).toBe(null);
  });
  it('returns null for an unknown node id', () => {
    expect(wrapNode('ctl', 'p', 999, 'AG')).toBe(null);
  });
  it('result reparses and contains the original subtree (property, spot cases)', () => {
    for (const [logic, text, kind, wrapper] of [
      ['ctl', 'A[p U q]', 'AU', 'EF'],
      ['ltl', '(p U q)', 'U', 'G'],
      ['ctlstar', 'A (p U q)', 'A', 'E'],
    ] as const) {
      const parse = logic === 'ctl' ? parseCTL : logic === 'ltl' ? parseLTL : parseCTLStar;
      const ast = parse(text) as { id: number; kind: string };
      let target = -1;
      (function walk(n: { id: number; kind: string; child?: unknown; left?: unknown; right?: unknown }) {
        if (n.kind === kind) target = n.id;
        if (n.child) walk(n.child as never);
        if (n.left) { walk(n.left as never); walk(n.right as never); }
      })(ast as never);
      const out = wrapNode(logic, text, target, wrapper);
      expect(out).not.toBe(null);
      expect(() => parse(out!)).not.toThrow();
    }
  });
});

describe('swapQuantifier', () => {
  it('swaps CTL quantifier pairs', () => {
    const id = ctlNodeId('AG EF r', (k) => k === 'AG');
    expect(swapQuantifier('ctl', 'AG EF r', id)).toBe('EG EF r');
    const id2 = ctlNodeId('AG EF r', (k) => k === 'EF');
    expect(swapQuantifier('ctl', 'AG EF r', id2)).toBe('AG AF r');
  });
  it('swaps CTL* A/E', () => {
    const star = parseCTLStar('A F p');
    expect(swapQuantifier('ctlstar', 'A F p', star.id)).toBe('E F p');
  });
  it('swaps CTL until quantifiers', () => {
    const id = ctlNodeId('A[p U q]', (k) => k === 'AU');
    expect(swapQuantifier('ctl', 'A[p U q]', id)).toBe('E[p U q]');
  });
  it('returns null for LTL and non-quantified nodes', () => {
    const ast = parseLTL('G p');
    expect(swapQuantifier('ltl', 'G p', ast.id)).toBe(null);
    const id = ctlNodeId('p', (k) => k === 'p');
    expect(swapQuantifier('ctl', 'p', id)).toBe(null);
  });
});
```

Note on the root-wrap test: `parseCTLStar('p')` returns the prop root; wrapping with `G` yields root `G p`, which the CTL* parser rejects (path-level root) → `wrapNode` must return null. Note on `'AG EF r'` id lookups: ids depend on parse order; the helper re-parses and walks — the SAME order `wrapNode` sees, so they align.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test` — Expected: FAIL, cannot resolve `./formulaEdits`.

- [ ] **Step 3: Implement**

`src/ui/formulaEdits.ts`:

```ts
import { CTLNode, parseCTL, pretty as prettyCTL } from '../core/ctl-parser';
import { LTLNode, parseLTL, pretty as prettyLTL } from '../core/ltl-parser';
import { StarNode, parseCTLStar, pretty as prettyStar } from '../core/ctlstar-parser';
import { Logic } from './types';

type AnyNode = CTLNode | LTLNode | StarNode;

const SWAP: Record<string, string> = {
  AG: 'EG', EG: 'AG', AF: 'EF', EF: 'AF', AX: 'EX', EX: 'AX', AU: 'EU', EU: 'AU',
  A: 'E', E: 'A',
};

function parseOf(logic: Logic, text: string): AnyNode {
  return logic === 'ctl' ? parseCTL(text) : logic === 'ltl' ? parseLTL(text) : parseCTLStar(text);
}
function prettyOf(logic: Logic, node: AnyNode): string {
  return logic === 'ctl'
    ? prettyCTL(node as CTLNode)
    : logic === 'ltl'
      ? prettyLTL(node as LTLNode)
      : prettyStar(node as StarNode);
}

/** Structurally clone `root`, applying `edit` to the node with `targetId`.
 *  Returns [newRoot, found]. */
function mapNode(root: AnyNode, targetId: number, edit: (n: AnyNode) => AnyNode): [AnyNode, boolean] {
  let found = false;
  function go(n: AnyNode): AnyNode {
    if (n.id === targetId) {
      found = true;
      return edit(n);
    }
    if ('child' in n) return { ...n, child: go(n.child as AnyNode) } as AnyNode;
    if ('left' in n) {
      return { ...n, left: go(n.left as AnyNode), right: go(n.right as AnyNode) } as AnyNode;
    }
    return n;
  }
  const out = go(root);
  return [out, found];
}

/** Wrap the identified subformula in a unary operator ('not', a temporal, or a
 *  quantifier legal for the logic) and re-emit the whole formula. Null when the
 *  node isn't found or the result would be invalid (e.g. CTL* path-level root). */
export function wrapNode(logic: Logic, text: string, nodeId: number, wrapper: string): string | null {
  try {
    const ast = parseOf(logic, text);
    const [wrapped, found] = mapNode(ast, nodeId, (n) => ({
      id: -1, kind: wrapper, child: n,
    } as unknown as AnyNode));
    if (!found) return null;
    const out = prettyOf(logic, wrapped);
    parseOf(logic, out); // validation: CTL* path-level roots throw here
    return out;
  } catch {
    return null;
  }
}

/** Swap A↔E on a quantified node (CTL operator pairs; CTL* A/E). Null for LTL,
 *  non-quantified nodes, or invalid results. */
export function swapQuantifier(logic: Logic, text: string, nodeId: number): string | null {
  if (logic === 'ltl') return null;
  try {
    const ast = parseOf(logic, text);
    let applicable = false;
    const [swapped, found] = mapNode(ast, nodeId, (n) => {
      const to = SWAP[n.kind];
      if (!to) return n;
      applicable = true;
      return { ...n, kind: to } as AnyNode;
    });
    if (!found || !applicable) return null;
    const out = prettyOf(logic, swapped);
    parseOf(logic, out);
    return out;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` — Expected: PASS (314 + 12 = 326). Verify the exact expected strings against actual pretty output (e.g. `'p ∧ AG q'`); if a string differs by parenthesization, hand-check which is correct per the pretty conventions and pin the ACTUAL correct output (report any adjustment).

- [ ] **Step 5: Commit**

```bash
git add src/ui/formulaEdits.ts src/ui/formulaEdits.test.ts
git commit -m "feat: wrap/negate/swap AST surgery over formula text"
```

---

### Task 4: Composer component + FormulaPanel/App integration

**Files:**
- Create: `src/ui/Composer.tsx`
- Modify: `src/ui/FormulaPanel.tsx`, `src/ui/App.tsx`, `src/styles.css`
- Test: `src/ui/Composer.test.tsx` (new)

- [ ] **Step 1: styles**

Append to `src/styles.css`:

```css
.composer { margin-bottom: 8px; }
.composer-input-wrap { position: relative; font-family: ui-monospace, monospace; font-size: 13px; }
.composer-highlight { position: absolute; inset: 0; padding: 6px; pointer-events: none;
  white-space: pre; overflow: hidden; }
.composer-textarea { position: relative; width: 100%; padding: 6px; resize: none;
  font: inherit; line-height: inherit; background: transparent; color: transparent;
  caret-color: #222; border: 1px solid #ccc; border-radius: 4px; white-space: pre; overflow-x: auto; }
.composer-textarea:focus { border-color: #2b6cb0; outline: none; }
.tok-quantifier { color: #97266d; font-weight: 600; }
.tok-temporal { color: #2b6cb0; font-weight: 600; }
.tok-prop { color: #2f855a; }
.tok-connective { color: #718096; }
.tok-paren { color: #a0aec0; }
.tok-hole { background: #feebc8; color: #975a16; border-radius: 2px; }
.tok-error { color: #c53030; text-decoration: underline wavy; }
.composer-status { min-height: 18px; font-size: 12px; margin: 4px 0; }
.composer-status .ok { color: #2f855a; }
.composer-caret-marker { font-family: ui-monospace, monospace; color: #c53030; white-space: pre; font-size: 11px; }
.composer-row { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; align-items: center; }
.prop-chip { border: 1px solid #cbd5e0; border-radius: 12px; padding: 0 8px; background: #fff;
  cursor: pointer; font-size: 12px; }
.op-btn { border: 1px solid #cbd5e0; border-radius: 4px; padding: 1px 7px; background: #fff;
  cursor: pointer; font-family: ui-monospace, monospace; font-size: 12px; }
.fix-btn { border: 1px solid #975a16; border-radius: 4px; padding: 1px 7px; background: #fffaf0;
  color: #975a16; cursor: pointer; font-size: 12px; }
.editing-banner { background: #ebf4ff; border: 1px solid #2b6cb0; border-radius: 4px;
  padding: 2px 8px; font-size: 12px; margin-bottom: 4px; }
.gesture-row { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
```

- [ ] **Step 2: Composer component**

`src/ui/Composer.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { KripkeStructure, allPropositions } from '../core/kripke';
import { parseCTL, ParseError } from '../core/ctl-parser';
import { parseLTL } from '../core/ltl-parser';
import { parseCTLStar } from '../core/ctlstar-parser';
import { pretty as prettyCTL } from '../core/ctl-parser';
import { pretty as prettyLTL } from '../core/ltl-parser';
import { pretty as prettyStar } from '../core/ctlstar-parser';
import { Logic, LOGIC_LABEL } from './types';
import { tokenize } from './highlight';
import { glossify } from './gloss';

interface ComposerProps {
  logic: Logic;
  model: KripkeStructure;
  editing: { id: string; text: string } | null;
  onSave: (text: string) => void;
  onCancelEdit: () => void;
  onSwitchLogic: (l: Logic) => void;
}

const HOLE = '▢';

interface PaletteEntry { label: string; insert: string; gloss: string; template?: boolean }

function palette(logic: Logic): PaletteEntry[] {
  const bool: PaletteEntry[] = [
    { label: '∧', insert: `(${HOLE} & ${HOLE})`, template: true, gloss: 'both hold' },
    { label: '∨', insert: `(${HOLE} | ${HOLE})`, template: true, gloss: 'at least one holds' },
    { label: '¬', insert: '!', gloss: 'does not hold' },
    { label: '→', insert: `(${HOLE} -> ${HOLE})`, template: true, gloss: 'if the left holds, so does the right' },
    { label: '↔', insert: `(${HOLE} <-> ${HOLE})`, template: true, gloss: 'both or neither' },
  ];
  if (logic === 'ctl') {
    return [
      { label: 'AG', insert: 'AG ', gloss: 'on every path, at every step' },
      { label: 'EF', insert: 'EF ', gloss: 'on some path, eventually' },
      { label: 'AF', insert: 'AF ', gloss: 'on every path, eventually' },
      { label: 'EG', insert: 'EG ', gloss: 'on some path, at every step' },
      { label: 'AX', insert: 'AX ', gloss: 'in every next state' },
      { label: 'EX', insert: 'EX ', gloss: 'in some next state' },
      { label: 'A[▢U▢]', insert: `A[${HOLE} U ${HOLE}]`, template: true, gloss: 'on every path, left holds until right does' },
      { label: 'E[▢U▢]', insert: `E[${HOLE} U ${HOLE}]`, template: true, gloss: 'on some path, left holds until right does' },
      ...bool,
    ];
  }
  if (logic === 'ltl') {
    return [
      { label: 'G', insert: 'G ', gloss: 'at every step from here on' },
      { label: 'F', insert: 'F ', gloss: 'eventually' },
      { label: 'X', insert: 'X ', gloss: 'in the next step' },
      { label: '▢U▢', insert: `(${HOLE} U ${HOLE})`, template: true, gloss: 'left holds until right does' },
      ...bool,
    ];
  }
  return [
    { label: 'A', insert: 'A ', gloss: 'on every path from here' },
    { label: 'E', insert: 'E ', gloss: 'on some path from here' },
    { label: 'G', insert: 'G ', gloss: 'at every step from here on' },
    { label: 'F', insert: 'F ', gloss: 'eventually' },
    { label: 'X', insert: 'X ', gloss: 'in the next step' },
    { label: '▢U▢', insert: `(${HOLE} U ${HOLE})`, template: true, gloss: 'left holds until right does' },
    ...bool,
  ];
}

export default function Composer({ logic, model, editing, onSave, onCancelEdit, onSwitchLogic }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const preEditDraft = useRef<string>('');
  const pendingSelect = useRef<{ start: number; end: number } | null>(null);

  // Entering edit mode loads the text; leaving restores the old draft.
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (editing) {
      preEditDraft.current = draft;
      setDraft(editing.text);
      taRef.current?.focus();
    } else {
      setDraft(preEditDraft.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (pendingSelect.current && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(pendingSelect.current.start, pendingSelect.current.end);
      pendingSelect.current = null;
    }
  }, [draft]);

  const hasHoles = draft.includes(HOLE);

  const parsed = useMemo(() => {
    const text = draft.trim();
    if (text === '' || hasHoles) return null;
    try {
      const ast = logic === 'ctl' ? parseCTL(text) : logic === 'ltl' ? parseLTL(text) : parseCTLStar(text);
      return { ast };
    } catch (e) {
      if (e instanceof ParseError) return { error: e };
      throw e;
    }
  }, [draft, logic, hasHoles]);

  function selectHole(from: number, backwards = false) {
    const positions: number[] = [];
    for (let i = 0; i < draft.length; i++) if (draft[i] === HOLE) positions.push(i);
    if (positions.length === 0) return;
    let target: number | undefined;
    if (backwards) {
      target = [...positions].reverse().find((p) => p < from - 1) ?? positions[positions.length - 1];
    } else {
      target = positions.find((p) => p >= from) ?? positions[0];
    }
    taRef.current?.focus();
    taRef.current?.setSelectionRange(target, target + 1);
  }

  function insertAtCaret(text: string, template = false) {
    const ta = taRef.current;
    const start = ta ? ta.selectionStart : draft.length;
    const end = ta ? ta.selectionEnd : draft.length;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const needsLeft = before !== '' && !/[\s([]$/.test(before);
    const glued = (needsLeft ? ' ' : '') + text;
    const next = before + glued + after;
    if (template) {
      const holeInInsert = glued.indexOf(HOLE);
      pendingSelect.current = { start: start + holeInInsert, end: start + holeInInsert + 1 };
    } else {
      pendingSelect.current = { start: start + glued.length, end: start + glued.length };
    }
    setDraft(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab' && hasHoles) {
      e.preventDefault();
      selectHole(taRef.current?.selectionEnd ?? 0, e.shiftKey);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = draft.trim();
      if (text === '' || hasHoles || !parsed || !('ast' in parsed)) return;
      onSave(text);
      if (!editing) setDraft('');
      return;
    }
    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      onCancelEdit();
    }
  }

  const crossLogicTarget: Logic | null = useMemo(() => {
    if (!parsed || !('error' in parsed)) return null;
    const blob = `${parsed.error.message} ${parsed.error.hint ?? ''}`;
    if (logic !== 'ctl' && /CTL(?!\*)/.test(blob) && /bracket|path quantifier — that's CTL/.test(blob)) return 'ctl';
    if (logic === 'ctl' && /path formula/.test(blob)) return 'ltl';
    return null;
  }, [parsed, logic]);

  const prettyOf = (ast: NonNullable<typeof parsed> extends { ast: infer T } ? T : never) =>
    logic === 'ctl' ? prettyCTL(ast as never) : logic === 'ltl' ? prettyLTL(ast as never) : prettyStar(ast as never);

  return (
    <div className="composer">
      {editing && <div className="editing-banner">editing — Enter saves, Esc cancels</div>}
      <div className="composer-input-wrap">
        <div className="composer-highlight" ref={hlRef} aria-hidden="true">
          {tokenize(draft, logic).map((t, i) => (
            <span key={i} className={t.cls === 'space' ? undefined : `tok-${t.cls}`}>{t.text}</span>
          ))}
        </div>
        <textarea
          ref={taRef} rows={1} className="composer-textarea" spellCheck={false}
          placeholder={`Add ${LOGIC_LABEL[logic]} formula — press Enter`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={() => { if (hlRef.current && taRef.current) hlRef.current.scrollLeft = taRef.current.scrollLeft; }}
        />
      </div>
      <div className="composer-status">
        {draft.trim() === '' ? null : hasHoles ? (
          <span className="muted">fill the holes — Tab jumps to the next</span>
        ) : parsed && 'error' in parsed ? (
          <>
            <div className="parse-error">
              {parsed.error.message}
              <div className="composer-caret-marker">{' '.repeat(Math.min(parsed.error.pos, 200))}▲</div>
            </div>
            {parsed.error.hint && <div className="hint">💡 {parsed.error.hint}</div>}
            <div className="composer-row">
              {parsed.error.fix && (
                <button className="fix-btn" onClick={() => {
                  pendingSelect.current = { start: parsed.error.fix!.replacement.length, end: parsed.error.fix!.replacement.length };
                  setDraft(parsed.error.fix!.replacement);
                }}>{parsed.error.fix.label}</button>
              )}
              {crossLogicTarget && (
                <button className="fix-btn" onClick={() => onSwitchLogic(crossLogicTarget)}>
                  Switch to {LOGIC_LABEL[crossLogicTarget]}
                </button>
              )}
            </div>
          </>
        ) : parsed && 'ast' in parsed ? (
          <span className="ok">✓ {prettyOf(parsed.ast as never)} — “{glossify(parsed.ast, logic)}”</span>
        ) : null}
      </div>
      <div className="composer-row">
        {allPropositions(model).map((p) => (
          <button key={p} className="prop-chip" onClick={() => insertAtCaret(p)}>{p}</button>
        ))}
        {allPropositions(model).length === 0 && <span className="muted">no propositions yet</span>}
      </div>
      <div className="composer-row">
        {palette(logic).map((entry) => (
          <button key={entry.label} className="op-btn" title={entry.gloss}
            onClick={() => insertAtCaret(entry.insert, entry.template)}>
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Note the `prettyOf` helper's type gymnastics — if TS balks, simplify to a plain switch returning `string` with `as never` casts at the call sites; behavior identical. Report whatever compiles cleanly.

- [ ] **Step 3: FormulaPanel integration**

`src/ui/FormulaPanel.tsx` changes:
1. Props: add `model: KripkeStructure`, `onUpdate: (id: string, text: string) => void`, `onSwitchLogic: (l: Logic) => void`.
2. Local state `const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);`
3. Replace the bare `<input className="formula-input" …>` with:

```tsx
      <Composer
        logic={entryLogic}
        model={model}
        editing={editing}
        onSave={(text) => {
          if (editing) { onUpdate(editing.id, text); setEditing(null); }
          else onAdd(text);
        }}
        onCancelEdit={() => setEditing(null)}
        onSwitchLogic={onSwitchLogic}
      />
```

4. Each row gains an ✎ button (before the remove ×):

```tsx
              <button className="remove" title="Edit"
                onClick={(e) => { e.stopPropagation(); setEditing({ id: a.entry.id, text: a.entry.text }); }}>✎</button>
```

and the row div gets `className={… ${editing?.id === a.entry.id ? 'selected' : ''}}` merged with the existing selected logic (editing highlight may coincide with selection highlight — acceptable).
5. Removing a row cancels an edit of that row: wrap the existing remove handler to `if (editing?.id === id) setEditing(null);` before `onRemove(id)`.

- [ ] **Step 4: App integration**

`src/ui/App.tsx`:
1. `onUpdateFormula`:

```tsx
  function updateFormula(id: string, text: string) {
    setFormulas((fs) => fs.map((f) => (f.id === id ? { ...f, text } : f)));
    if (activeFormulaId === id) { setSelectedNodeId(null); setStepIndex(null); }
  }
```

2. Pass to FormulaPanel: `model={model}`, `onUpdate={updateFormula}`, `onSwitchLogic={setEntryLogic}`.

- [ ] **Step 5: Composer integration tests**

`src/ui/Composer.test.tsx` (render `<App />` for full wiring; existing helpers/localStorage clearing conventions from App.test.tsx):

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

function composerInput(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(/add .*formula/i) as HTMLTextAreaElement;
}

describe('Composer', () => {
  beforeEach(() => localStorage.clear());

  it('shows a live parse error with hint while typing', () => {
    render(<App />);
    fireEvent.change(composerInput(), { target: { value: 'AG (w' } });
    expect(screen.getByText(/Expected '\)'/)).toBeTruthy();
  });

  it('shows pretty + gloss when the draft parses', () => {
    render(<App />);
    fireEvent.change(composerInput(), { target: { value: 'AG EF r' } });
    expect(screen.getByText(/on every path, at every step, on some path, eventually r/)).toBeTruthy();
  });

  it('proposition chips insert at the caret', () => {
    render(<App />);
    const ta = composerInput();
    fireEvent.change(ta, { target: { value: 'AG ' } });
    ta.setSelectionRange(3, 3);
    fireEvent.click(screen.getAllByText('r').find((el) => el.className === 'prop-chip')!);
    expect(ta.value).toBe('AG r');
  });

  it('template buttons insert holes; Enter refuses while holes remain', () => {
    render(<App />);
    fireEvent.click(screen.getByText('A[▢U▢]'));
    const ta = composerInput();
    expect(ta.value).toContain('▢');
    const rows = document.querySelectorAll('.formula-row').length;
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(document.querySelectorAll('.formula-row').length).toBe(rows); // refused
    expect(screen.getByText(/fill the holes/)).toBeTruthy();
  });

  it('quick-fix rewrites the draft', () => {
    render(<App />);
    fireEvent.click(screen.getByText('LTL')); // LTL entry mode
    const ta = composerInput();
    fireEvent.change(ta, { target: { value: 'AG w' } });
    fireEvent.click(screen.getByText(/Drop the quantifier/));
    expect(ta.value).toBe('G w');
  });

  it('cross-logic switch preserves the draft', () => {
    render(<App />);
    // CTL entry mode; type an LTL-ism
    const ta = composerInput();
    fireEvent.change(ta, { target: { value: 'FG w' } });
    fireEvent.click(screen.getByText('Switch to LTL'));
    expect((screen.getByPlaceholderText(/add ltl formula/i) as HTMLTextAreaElement).value).toBe('FG w');
  });

  it('edit-in-place saves under the same id', () => {
    render(<App />);
    const before = document.querySelectorAll('.formula-row').length;
    const row = [...document.querySelectorAll('.formula-row')]
      .find((r) => r.textContent!.includes('AF r'))!;
    fireEvent.click(row.querySelector('[title="Edit"]')!);
    const ta = composerInput();
    expect(ta.value).toBe('AF r');
    fireEvent.change(ta, { target: { value: 'AF w' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(document.querySelectorAll('.formula-row').length).toBe(before);
    expect(screen.getByText('AF w')).toBeTruthy();
    expect(screen.queryByText('AF r')).toBeNull();
  });
});
```

Mechanics: `screen.getByText('LTL')` matches the header tab (badges also say LTL but chips/badges only exist per formula row — the default example HAS an LTL badge; scope with `within(document.querySelector('.header')!)` if ambiguous). The quick-fix test needs `'AG w'` on the LTL tab to throw with the drop-quantifier fix (Task 1). Adjust mechanics only, never assertions.

- [ ] **Step 6: Verify**

`npm test` — existing App/Header tests query `getByPlaceholderText(/add .*formula/i)`: the Composer textarea keeps that placeholder pattern, so they should survive; `fireEvent.change`/`keyDown` on a textarea work identically. Report and mechanically fix any that anchor on `input` tag specifics. `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Composer.tsx src/ui/Composer.test.tsx src/ui/FormulaPanel.tsx src/ui/App.tsx src/styles.css
git commit -m "feat: formula composer — live errors, chips, palette with holes, preview, edit-in-place"
```

---

### Task 5: Inspector gesture row + final integration + README

**Files:**
- Modify: `src/ui/Inspector.tsx`, `src/ui/App.tsx`, `src/ui/App.test.tsx`, `README.md`

- [ ] **Step 1: App gesture handler**

In `src/ui/App.tsx`:

```tsx
  const [gestureNotice, setGestureNotice] = useState<string | null>(null);

  function applyFormulaEdit(action: { type: 'wrap'; wrapper: string } | { type: 'swap' }) {
    setGestureNotice(null);
    if (activeFormulaId === null || selectedNodeId === null) return;
    const entry = formulas.find((f) => f.id === activeFormulaId);
    if (!entry) return;
    const result = action.type === 'wrap'
      ? wrapNode(entry.logic, entry.text, selectedNodeId, action.wrapper)
      : swapQuantifier(entry.logic, entry.text, selectedNodeId);
    if (result === null) {
      setGestureNotice(action.type === 'wrap'
        ? 'That wrap would make the formula invalid here (CTL* roots need a path quantifier).'
        : 'Nothing to swap on this node.');
      return;
    }
    updateFormula(activeFormulaId, result);
  }
```

Imports: `import { wrapNode, swapQuantifier } from './formulaEdits';`. Clear `gestureNotice` in `selectFormula` and on node selection change (inside the `onSelectNode` wrapper). Pass to Inspector: `onFormulaEdit={applyFormulaEdit}` and `gestureNotice={gestureNotice}`.

- [ ] **Step 2: Inspector gesture row**

`src/ui/Inspector.tsx` — props:

```ts
  onFormulaEdit: (action: { type: 'wrap'; wrapper: string } | { type: 'swap' }) => void;
  gestureNotice: string | null;
```

Add a `GestureRow` helper rendered in ALL THREE formula branches (CTL/LTL/CTL*), directly under each branch's tree, only when `selectedNodeId !== null`:

```tsx
function GestureRow(props: {
  logic: import('./types').Logic;
  nodeKind: string | null;
  onFormulaEdit: (a: { type: 'wrap'; wrapper: string } | { type: 'swap' }) => void;
  notice: string | null;
}) {
  const { logic, nodeKind, onFormulaEdit, notice } = props;
  if (nodeKind === null) return null;
  const wraps = logic === 'ctl'
    ? ['AG', 'EF', 'AF', 'EG', 'AX', 'EX']
    : logic === 'ltl'
      ? ['G', 'F', 'X']
      : ['A', 'E', 'G', 'F', 'X'];
  const swappable = ['AG', 'EG', 'AF', 'EF', 'AX', 'EX', 'AU', 'EU', 'A', 'E'].includes(nodeKind);
  return (
    <>
      <div className="gesture-row">
        <button className="op-btn" title="negate" onClick={() => onFormulaEdit({ type: 'wrap', wrapper: 'not' })}>¬</button>
        {wraps.map((w) => (
          <button key={w} className="op-btn" title={`wrap in ${w}`}
            onClick={() => onFormulaEdit({ type: 'wrap', wrapper: w })}>{w}·</button>
        ))}
        {swappable && (
          <button className="op-btn" title="swap A↔E" onClick={() => onFormulaEdit({ type: 'swap' })}>A↔E</button>
        )}
      </div>
      {notice && <div className="hint">{notice}</div>}
    </>
  );
}
```

Each branch computes the selected node's kind (all three already locate the selected node — reuse those variables) and renders `<GestureRow logic={analysis.entry.logic} nodeKind={selectedKind} onFormulaEdit={onFormulaEdit} notice={gestureNotice} />` under the tree.

- [ ] **Step 3: Integration tests**

Append to `src/ui/App.test.tsx`:

```tsx
  it('wrap gesture rewrites the formula via the tree', () => {
    render(<App />);
    fireEvent.click(screen.getByText('AG EF r'));
    fireEvent.click(document.querySelectorAll('.node-row')[1]); // EF r
    fireEvent.click(screen.getByTitle('wrap in AG'));
    expect(screen.getByText('AG AG EF r')).toBeTruthy(); // row text updated
  });

  it('swap gesture flips a quantifier', () => {
    render(<App />);
    fireEvent.click(screen.getByText('AG EF r'));
    fireEvent.click(document.querySelectorAll('.node-row')[0]); // AG root
    fireEvent.click(screen.getByTitle('swap A↔E'));
    expect(screen.getByText('EG EF r')).toBeTruthy();
  });
```

(After the first test's wrap the formula list contains 'AG AG EF r' — each test renders fresh with cleared localStorage, so the fixtures reset. Verify the wrap-target expectation: wrapping the EF node of 'AG EF r' with AG yields pretty 'AG AG EF r' — hand-check against prettyCTL; report if parens differ and pin the actual.)

- [ ] **Step 4: Run everything**

`npm test` (report final count; expect roughly 326 + 7 + 2 ≈ 335 accounting for Task 4's suite), `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 5: README**

Update the Formulas bullet's opening:

```markdown
- **Formulas (left):** pick LTL / CTL / CTL* with the header tabs and compose with
  live feedback: syntax-highlighted input, errors with one-click fixes as you type,
  clickable proposition chips and operator palette (templates insert ▢ holes — Tab
  jumps between them), and a live plain-English reading of what you wrote. ✎ edits
  a formula in place; selecting a subformula in the inspector offers wrap/negate/
  A↔E-swap gestures.
```

(keep the rest of the existing bullet's syntax reference).

- [ ] **Step 6: Manual walkthrough**

`npm run dev`: full spec pass — typing errors live with caret marker, fixes (glued/bracket/drop-quantifier/cross-logic switch), chips at caret with smart spacing, all palette entries per tab, hole Tab-cycling incl. Shift+Tab wrap-around, Enter refusal with holes, pretty+gloss preview, edit-in-place (Enter/Escape/delete-cancels), highlighting classes per logic, wrap/swap gestures incl. the CTL* root-path rejection notice. Fix anything broken with small commits.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Inspector.tsx src/ui/App.tsx src/ui/App.test.tsx README.md
git commit -m "feat: inspector wrap/swap gestures; docs: composer usage"
```
