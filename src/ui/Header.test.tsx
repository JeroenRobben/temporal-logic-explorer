import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';
import { validateSavedState } from './storage';

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
