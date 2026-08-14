import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveTheme, applyTheme, cyclePref, loadPref, detachThemeListener } from './theme';

// jsdom has no matchMedia — a tiny stub with listener capture.
type Listener = (e: { matches: boolean }) => void;

function installMatchMedia(dark: boolean) {
  const listeners: Listener[] = [];
  const mql = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t: string, l: Listener) => { listeners.push(l); },
    removeEventListener: (_t: string, l: Listener) => {
      const i = listeners.indexOf(l);
      if (i !== -1) listeners.splice(i, 1);
    },
  };
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
  return {
    mql,
    listeners,
    fire(matches: boolean) {
      mql.matches = matches;
      [...listeners].forEach((l) => l({ matches }));
    },
  };
}

const originalMatchMedia = window.matchMedia;

describe('theme.ts', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    detachThemeListener();
    window.matchMedia = originalMatchMedia;
  });

  describe('resolveTheme', () => {
    it("resolves 'auto' from the system preference", () => {
      expect(resolveTheme('auto', true)).toBe('dark');
      expect(resolveTheme('auto', false)).toBe('light');
    });

    it('passes explicit prefs through regardless of system', () => {
      expect(resolveTheme('light', true)).toBe('light');
      expect(resolveTheme('light', false)).toBe('light');
      expect(resolveTheme('dark', true)).toBe('dark');
      expect(resolveTheme('dark', false)).toBe('dark');
    });
  });

  describe('cyclePref', () => {
    it('cycles auto → light → dark → auto', () => {
      expect(cyclePref('auto')).toBe('light');
      expect(cyclePref('light')).toBe('dark');
      expect(cyclePref('dark')).toBe('auto');
    });
  });

  describe('loadPref', () => {
    it("defaults to 'auto' when nothing is stored", () => {
      expect(loadPref()).toBe('auto');
    });

    it('returns a stored valid pref', () => {
      localStorage.setItem('tle-theme', 'dark');
      expect(loadPref()).toBe('dark');
    });

    it("falls back to 'auto' on a bad stored value", () => {
      localStorage.setItem('tle-theme', 'blorp');
      expect(loadPref()).toBe('auto');
    });
  });

  describe('applyTheme', () => {
    it('sets data-theme to the RESOLVED value and persists the PREF', () => {
      installMatchMedia(true);
      applyTheme('auto');
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(localStorage.getItem('tle-theme')).toBe('auto');

      applyTheme('light');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(localStorage.getItem('tle-theme')).toBe('light');
    });

    it('auto attaches a matchMedia change listener that re-applies', () => {
      const mm = installMatchMedia(false);
      applyTheme('auto');
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(mm.listeners.length).toBe(1);

      mm.fire(true);
      expect(document.documentElement.dataset.theme).toBe('dark');
      mm.fire(false);
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('switching pref away from auto removes the system listener', () => {
      const mm = installMatchMedia(false);
      applyTheme('auto');
      expect(mm.listeners.length).toBe(1);

      applyTheme('dark');
      expect(mm.listeners.length).toBe(0);
      // A stale system flip must not override the explicit pref.
      mm.fire(false);
      expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('re-applying auto does not stack listeners', () => {
      const mm = installMatchMedia(false);
      applyTheme('auto');
      applyTheme('auto');
      expect(mm.listeners.length).toBe(1);
    });

    it('detachThemeListener removes the listener', () => {
      const mm = installMatchMedia(false);
      applyTheme('auto');
      detachThemeListener();
      expect(mm.listeners.length).toBe(0);
      mm.fire(true);
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('survives environments without matchMedia (jsdom default)', () => {
      // @ts-expect-error - simulating jsdom without matchMedia
      delete window.matchMedia;
      expect(() => applyTheme('auto')).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(() => applyTheme('dark')).not.toThrow();
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });
});
