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
