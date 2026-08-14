import { useRef, useState } from 'react';
import { EXAMPLES } from './examples';
import { SavedState, validateSavedState, normalizeSavedState } from './storage';
import { Logic } from './types';
import { ThemePref, applyTheme, cyclePref, loadPref } from './theme';

const THEME_ICONS: Record<ThemePref, string> = { auto: '◑', light: '☀', dark: '☾' };

interface HeaderProps {
  onLoadExample: (index: number) => void;
  onImport: (s: SavedState) => void;
  exportState: () => SavedState;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAutoLayout: () => void;
  entryLogic: Logic;
  onEntryLogic: (l: Logic) => void;
}

export default function Header({
  onLoadExample, onImport, exportState, onUndo, onRedo, canUndo, canRedo, onAutoLayout,
  entryLogic, onEntryLogic,
}: HeaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [themePref, setThemePref] = useState<ThemePref>(loadPref);

  function onThemeClick() {
    const next = cyclePref(themePref);
    setThemePref(next);
    applyTheme(next);
  }

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
        onImport(normalizeSavedState(parsed));
      } catch (e) {
        alert(`Import failed: ${e instanceof Error ? e.message : 'invalid JSON'}`);
      }
    });
  }

  return (
    <div className="header">
      <h1>Temporal Logic Explorer</h1>
      <div className="tabs">
        <button className={`tab ${entryLogic === 'ltl' ? 'active' : ''}`}
          onClick={() => onEntryLogic('ltl')} title="New formulas are LTL (evaluated on the trace)">LTL</button>
        <button className={`tab ${entryLogic === 'ctl' ? 'active' : ''}`}
          onClick={() => onEntryLogic('ctl')} title="New formulas are CTL (evaluated on the structure)">CTL</button>
        <button className={`tab ${entryLogic === 'ctlstar' ? 'active' : ''}`}
          onClick={() => onEntryLogic('ctlstar')}
          title="New formulas are CTL* (path quantifiers over arbitrary path formulas)">CTL*</button>
      </div>
      <div className="spacer" />
      <button onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">↩ Undo</button>
      <button onClick={onRedo} disabled={!canRedo} title="Ctrl+Shift+Z / Ctrl+Y">↪ Redo</button>
      <button onClick={onAutoLayout} title="Force-directed layout">Auto-layout</button>
      <select
        value=""
        onChange={(e) => { if (e.target.value !== '') onLoadExample(Number(e.target.value)); }}
      >
        <option value="">Load example…</option>
        {EXAMPLES.map((ex, i) => <option key={ex.name} value={i}>{ex.name}</option>)}
      </select>
      <button onClick={onThemeClick} title={`Theme: ${themePref}`}>{THEME_ICONS[themePref]}</button>
      <button onClick={doExport}>Export</button>
      <button onClick={() => fileRef.current?.click()}>Import</button>
      <input
        ref={fileRef} type="file" accept="application/json" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }}
      />
    </div>
  );
}
