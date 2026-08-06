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
