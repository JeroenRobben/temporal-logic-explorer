import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Drift guard for the design-token architecture (spec:
// docs/superpowers/specs/2026-08-15-workbench-darkmode-design.md).
// styles.css must define every semantic token in a `:root` light block,
// provide a `:root[data-theme='dark']` block (empty until Task 2), and
// name NO raw colors anywhere outside those two token blocks.

const cssPath = resolve(process.cwd(), 'src/styles.css');
const css = readFileSync(cssPath, 'utf8');

// Normative token names from the spec — surfaces/text, semantics, scale.
const SURFACE_TOKENS = [
  '--bg', '--panel', '--panel-raised', '--border', '--border-strong',
  '--text', '--text-dim', '--backdrop',
];
const SEMANTIC_TOKENS = [
  '--accent', '--pass', '--fail', '--warn', '--hole', '--evidence',
  '--trace', '--selection', '--deadlock',
  '--tok-quantifier', '--tok-temporal', '--tok-prop', '--tok-connective',
];
const SCALE_TOKENS = [
  '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6',
  '--fs-0', '--fs-1', '--fs-2', '--fs-3',
  '--radius-1', '--radius-2',
  '--shadow-1', '--shadow-2',
];
// Companion color tokens Task 1 added beyond the spec list.
const COMPANION_TOKENS = [
  '--text-faint', '--hover', '--on-accent', '--warn-bg', '--hole-bg',
];
const ALL_TOKENS = [...SURFACE_TOKENS, ...SEMANTIC_TOKENS, ...SCALE_TOKENS, ...COMPANION_TOKENS];

// Every color-carrying token must get a dark value (dimension tokens —
// space/fs/radius — are theme-independent; shadows/backdrop are not).
const DARK_REQUIRED_TOKENS = [
  ...SURFACE_TOKENS, ...SEMANTIC_TOKENS, ...COMPANION_TOKENS,
  '--shadow-1', '--shadow-2',
];

const DARK_SELECTOR = ":root[data-theme='dark']";

/** Slice out `{ ... }` body of the first block whose selector starts at `selector`. */
function extractBlock(source: string, selector: string): { body: string; start: number; end: number } | null {
  const selStart = source.indexOf(selector);
  if (selStart === -1) return null;
  const open = source.indexOf('{', selStart);
  if (open === -1) return null;
  const close = source.indexOf('}', open);
  if (close === -1) return null;
  return { body: source.slice(open + 1, close), start: selStart, end: close + 1 };
}

// `:root {` for the light block — must not accidentally match the dark selector.
function lightBlock() {
  const withoutDark = css.replace(DARK_SELECTOR, '@@dark@@');
  return extractBlock(withoutDark, ':root');
}

describe('design token foundation (styles.css)', () => {
  it('has a :root light block defining every spec token', () => {
    const block = lightBlock();
    expect(block, 'styles.css must contain a `:root { ... }` token block').not.toBeNull();
    const missing = ALL_TOKENS.filter(
      (t) => !new RegExp(`${t}\\s*:`).test(block!.body),
    );
    expect(missing, `tokens missing from :root block: ${missing.join(', ')}`).toEqual([]);
  });

  it("has a :root[data-theme='dark'] block overriding every color token", () => {
    expect(css.includes(DARK_SELECTOR), `styles.css must contain \`${DARK_SELECTOR}\``).toBe(true);
    const dark = extractBlock(css, DARK_SELECTOR);
    expect(dark).not.toBeNull();
    const missing = DARK_REQUIRED_TOKENS.filter(
      (t) => !new RegExp(`${t}\\s*:`).test(dark!.body),
    );
    expect(missing, `tokens missing from dark block: ${missing.join(', ')}`).toEqual([]);
  });

  it('dark block uses no pure #000/#fff surfaces or text', () => {
    const dark = extractBlock(css, DARK_SELECTOR)!;
    const pure = dark.body.match(/#(?:000|fff|000000|ffffff)\b/gi) ?? [];
    expect(pure, `pure black/white in dark block: ${pure.join(', ')}`).toEqual([]);
  });

  it('names no raw colors outside the two token blocks', () => {
    // Remove both token blocks, then scan the remainder.
    let rest = css;
    const dark = extractBlock(rest, DARK_SELECTOR);
    if (dark) rest = rest.slice(0, dark.start) + rest.slice(dark.end);
    const light = extractBlock(rest, ':root {');
    if (light) rest = rest.slice(0, light.start) + rest.slice(light.end);

    const hexes = rest.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes, `raw hex colors outside token blocks: ${hexes.join(', ')}`).toEqual([]);

    const rgbs = rest.match(/\brgba?\(/g) ?? [];
    expect(rgbs, 'rgb()/rgba() outside token blocks').toEqual([]);
  });
});
