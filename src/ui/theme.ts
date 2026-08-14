// Theme switching: system-following ('auto') with a persisted manual override.
// Spec: docs/superpowers/specs/2026-08-15-workbench-darkmode-design.md
//
// `data-theme` on <html> only ever holds the RESOLVED value ('light'|'dark');
// the PREF (which may be 'auto') is what persists under `tle-theme`.

export type ThemePref = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'tle-theme';
const QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(pref: ThemePref, systemDark: boolean): ResolvedTheme {
  if (pref === 'auto') return systemDark ? 'dark' : 'light';
  return pref;
}

export function cyclePref(pref: ThemePref): ThemePref {
  return pref === 'auto' ? 'light' : pref === 'light' ? 'dark' : 'auto';
}

export function loadPref(): ThemePref {
  // Storage can throw (private mode, blocked embedded contexts) and this runs
  // during Header render — degrade to 'auto', never crash. Same policy as storage.ts.
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return stored === 'light' || stored === 'dark' || stored === 'auto' ? stored : 'auto';
}

// Singleton system-preference listener (only active while pref === 'auto').
let active: {
  mql: MediaQueryList;
  handler: (e: MediaQueryListEvent) => void;
} | null = null;

export function detachThemeListener(): void {
  if (active) {
    active.mql.removeEventListener('change', active.handler);
    active = null;
  }
}

/** Persist `pref`, set the resolved theme on <html>, and (for 'auto') follow the system. */
export function applyTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* preference just won't persist */
  }
  detachThemeListener();

  let systemDark = false;
  // jsdom lacks matchMedia — guard so mount-time applyTheme never crashes.
  if (typeof window.matchMedia === 'function') {
    const mql = window.matchMedia(QUERY);
    systemDark = mql.matches;
    if (pref === 'auto') {
      const handler = (e: MediaQueryListEvent) => {
        document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
      };
      mql.addEventListener('change', handler);
      active = { mql, handler };
    }
  }
  document.documentElement.dataset.theme = resolveTheme(pref, systemDark);
}
