import { useState } from 'react';
import { pretty as prettyCTL } from '../core/ctl-parser';
import { pretty as prettyLTL } from '../core/ltl-parser';
import { pretty as prettyStar } from '../core/ctlstar-parser';
import { KripkeStructure } from '../core/kripke';
import { Analysis, Logic, LOGIC_LABEL } from './types';
import Composer from './Composer';
import { WorkbenchMode } from './Workbench';

interface FormulaPanelProps {
  analyses: Analysis[];
  selectedFormulaId: string | null;
  onSelect: (id: string) => void;
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
  entryLogic: Logic;
  model: KripkeStructure;
  onUpdate: (id: string, text: string) => void;
  onSwitchLogic: (l: Logic) => void;
  onOpenLearn: (id: string) => void;
  /** Drawer state pass-through (optional: the composer self-manages without it). */
  workbench?: WorkbenchMode | null;
  onOpenWorkbench?: (m: WorkbenchMode | null) => void;
}

export default function FormulaPanel({
  analyses, selectedFormulaId, onSelect, onAdd, onRemove, entryLogic, model, onUpdate, onSwitchLogic, onOpenLearn,
  workbench, onOpenWorkbench,
}: FormulaPanelProps) {
  const [editing, setEditing] = useState<{ id: string; text: string; logic: Logic } | null>(null);

  return (
    <div>
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
        onOpenLearn={onOpenLearn}
        workbench={workbench}
        onOpenWorkbench={onOpenWorkbench}
      />
      <div style={{ marginTop: 8 }}>
        {analyses.map((a) => {
          const verdict = a.error ? '⚠'
            : a.starTooLarge ? '⚠'
            : a.verdict === true ? '✓'
            : a.verdict === false ? '✗' : '–';
          const cls = a.verdict === true ? 'true'
            : a.verdict === false ? 'false' : 'none';
          const text = a.ast ? prettyCTL(a.ast)
            : a.ltlAst ? prettyLTL(a.ltlAst)
            : a.starAst ? prettyStar(a.starAst)
            : a.entry.text;
          const ap = a.entry.logic === 'ltl' && !a.error ? a.allPaths : undefined;
          const apMark = !ap ? null
            : ap.kind === 'holds' ? { text: '∀✓', cls: 'true', title: 'holds on all infinite paths' }
            : ap.kind === 'fails' ? { text: '∀✗', cls: 'false', title: 'fails on some path — counterexample available' }
            : ap.kind === 'too-large' ? { text: '∀⚠', cls: 'none', title: 'automaton too large — simplify the formula' }
            : { text: '∀–', cls: 'none', title: 'no initial states' };
          return (
            <div
              key={a.entry.id}
              className={`formula-row ${
                a.entry.id === selectedFormulaId || editing?.id === a.entry.id ? 'selected' : ''
              }`}
              onClick={() => onSelect(a.entry.id)}
              title={a.starTooLarge
                ? 'automaton too large — simplify the formula'
                : a.verdict === null && !a.error && a.entry.logic === 'ltl'
                ? 'Build a trace to evaluate LTL formulas' : undefined}
            >
              <span className={`badge ${a.entry.logic}`}>{LOGIC_LABEL[a.entry.logic]}</span>
              <span className={`verdict ${cls}`} title={a.entry.logic === 'ltl' ? 'on the current trace' : undefined}>{verdict}</span>
              {apMark && <span className={`verdict ${apMark.cls}`} title={apMark.title}>{apMark.text}</span>}
              <span className="text">{text}</span>
              <button
                className="remove"
                title="Edit"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing({ id: a.entry.id, text: a.entry.text, logic: a.entry.logic });
                  onSwitchLogic(a.entry.logic);
                }}
              >✎</button>
              <button
                className="remove"
                title="Remove"
                onClick={(e) => {
                  e.stopPropagation();
                  if (editing?.id === a.entry.id) setEditing(null);
                  onRemove(a.entry.id);
                }}
              >×</button>
            </div>
          );
        })}
        {analyses.length === 0 && <div className="muted">No formulas yet.</div>}
      </div>
    </div>
  );
}
