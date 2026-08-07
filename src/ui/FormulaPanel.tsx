import { useState } from 'react';
import { pretty as prettyCTL } from '../core/ctl-parser';
import { pretty as prettyLTL } from '../core/ltl-parser';
import { Analysis, Logic } from './types';

interface FormulaPanelProps {
  analyses: Analysis[];
  selectedFormulaId: string | null;
  onSelect: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  entryLogic: Logic;
}

export default function FormulaPanel({
  analyses, selectedFormulaId, onSelect, onAdd, onRemove, entryLogic,
}: FormulaPanelProps) {
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
        placeholder={`Add ${entryLogic.toUpperCase()} formula — press Enter`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <div style={{ marginTop: 8 }}>
        {analyses.map((a) => {
          const verdict = a.error ? '⚠'
            : a.verdict === true ? '✓'
            : a.verdict === false ? '✗' : '–';
          const cls = a.verdict === true ? 'true'
            : a.verdict === false ? 'false' : 'none';
          const text = a.ast ? prettyCTL(a.ast) : a.ltlAst ? prettyLTL(a.ltlAst) : a.entry.text;
          return (
            <div
              key={a.entry.id}
              className={`formula-row ${a.entry.id === selectedFormulaId ? 'selected' : ''}`}
              onClick={() => onSelect(a.entry.id)}
              title={a.verdict === null && !a.error && a.entry.logic === 'ltl'
                ? 'Build a trace to evaluate LTL formulas' : undefined}
            >
              <span className={`badge ${a.entry.logic}`}>{a.entry.logic.toUpperCase()}</span>
              <span className={`verdict ${cls}`}>{verdict}</span>
              <span className="text">{text}</span>
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
