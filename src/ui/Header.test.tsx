import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { validateSavedState } from './storage';

type MMListener = (e: { matches: boolean }) => void;

function installMatchMedia(dark: boolean) {
  const listeners: MMListener[] = [];
  const mql = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_t: string, l: MMListener) => { listeners.push(l); },
    removeEventListener: (_t: string, l: MMListener) => {
      const i = listeners.indexOf(l);
      if (i !== -1) listeners.splice(i, 1);
    },
  };
  window.matchMedia = vi.fn(() => mql) as unknown as typeof window.matchMedia;
}

describe('Header theme toggle', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    installMatchMedia(false);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('shows ◑ for the default auto pref and applies the resolved theme at mount', () => {
    render(<App />);
    const btn = screen.getByTitle('Theme: auto');
    expect(btn.textContent).toBe('◑');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('click cycles auto → light → dark → auto, applying + persisting each step', () => {
    render(<App />);
    const btn = screen.getByTitle('Theme: auto');

    fireEvent.click(btn);
    expect(screen.getByTitle('Theme: light').textContent).toBe('☀');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('tle-theme')).toBe('light');

    fireEvent.click(screen.getByTitle('Theme: light'));
    expect(screen.getByTitle('Theme: dark').textContent).toBe('☾');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('tle-theme')).toBe('dark');

    fireEvent.click(screen.getByTitle('Theme: dark'));
    expect(screen.getByTitle('Theme: auto').textContent).toBe('◑');
    expect(document.documentElement.dataset.theme).toBe('light'); // system is light in stub
    expect(localStorage.getItem('tle-theme')).toBe('auto');
  });

  it('honors a stored dark pref at mount', () => {
    localStorage.setItem('tle-theme', 'dark');
    render(<App />);
    expect(screen.getByTitle('Theme: dark').textContent).toBe('☾');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('Header export/import round-trip', () => {
  beforeEach(() => localStorage.clear());

  it('Export produces a valid, matching model JSON blob', async () => {
    let captured: Blob | null = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return 'blob:mock'; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    try {
      render(<App />);
      fireEvent.click(screen.getByText('Export'));
      expect(captured).not.toBeNull();
      const text = await (captured as unknown as Blob).text();
      const parsed = JSON.parse(text);
      expect(validateSavedState(parsed)).toBe(true);
      expect(parsed.model.states.length).toBe(3);
      expect(parsed.formulas.length).toBe(4);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('Import round-trips: same JSON file loaded back shows the same formula rows', async () => {
    let captured: Blob | null = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return 'blob:mock'; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
    try {
      render(<App />);
      fireEvent.click(screen.getByText('Export'));
      const text = await (captured as unknown as Blob).text();

      const before = [...document.querySelectorAll('.formula-row .text')].map((n) => n.textContent);

      const file = new File([text], 'model.json', { type: 'application/json' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);

      await waitFor(() => {
        const after = [...document.querySelectorAll('.formula-row .text')].map((n) => n.textContent);
        expect(after).toEqual(before);
      });
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('malformed import alerts and leaves state unchanged', async () => {
    render(<App />);
    const before = [...document.querySelectorAll('.formula-row .text')].map((n) => n.textContent);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    try {
      const file = new File(['not json'], 'bad.json', { type: 'application/json' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      fireEvent.change(input);

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      const after = [...document.querySelectorAll('.formula-row .text')].map((n) => n.textContent);
      expect(after).toEqual(before);
    } finally {
      alertSpy.mockRestore();
    }
  });
});
