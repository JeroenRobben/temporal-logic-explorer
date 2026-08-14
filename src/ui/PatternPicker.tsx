import { useMemo, useState } from 'react';
import { KripkeStructure, allPropositions } from '../core/kripke';
import { PATTERNS, instantiate, SlotName, PatternCell } from '../patterns/patterns';
import { parseForLogic } from '../learn/engine';
import { glossify } from './gloss';
import { Logic, LOGIC_LABEL } from './types';

type Scope = 'globally' | 'before' | 'after';

const SCOPE_LABEL: Record<Scope, string> = { globally: 'Globally', before: 'Before r', after: 'After q' };
const SLOT_ROLE: Record<SlotName, string> = {
  P: 'P — the behavior',
  S: 'S — the trigger/response',
  q: 'q — scope opens',
  r: 'r — scope closes',
};

interface PatternPickerProps {
  model: KripkeStructure;
  logic: Logic;
  onInsert: (text: string, logic: Logic) => void;
}

/** Slots the current template actually mentions: the pattern's own slots plus
 *  the scope delimiter (r for Before, q for After). */
function slotsFor(patternSlots: SlotName[], scope: Scope): SlotName[] {
  if (scope === 'before') return [...patternSlots, 'r'];
  if (scope === 'after') return [...patternSlots, 'q'];
  return patternSlots;
}

export default function PatternPicker({ model, logic, onInsert }: PatternPickerProps) {
  const [patternId, setPatternId] = useState(PATTERNS[0].id);
  const [scope, setScope] = useState<Scope>('globally');
  // CTL only exists under Globally; a CTL entry tab still gets a valid default.
  const [logicChoice, setLogicChoice] = useState<Logic>(logic);
  const [fills, setFills] = useState<Partial<Record<SlotName, string>>>({});

  const pattern = PATTERNS.find((p) => p.id === patternId)!;
  const cell: PatternCell = pattern.scopes[scope];
  const slots = slotsFor(pattern.slots, scope);
  const template = logicChoice === 'ctl' ? cell.ctl! : logicChoice === 'ltl' ? cell.ltl : cell.ctlstar;
  const text = instantiate(template, fills);
  const props = allPropositions(model);

  const gloss = useMemo(() => {
    if (text.includes('▢')) return null;
    const ast = parseForLogic(logicChoice, text);
    return ast === null ? null : glossify(ast as Parameters<typeof glossify>[0], logicChoice);
  }, [text, logicChoice]);

  function changeScope(next: Scope) {
    setScope(next);
    if (next !== 'globally' && logicChoice === 'ctl') setLogicChoice('ltl');
  }

  return (
    <div className="pattern-picker">
      <div className="composer-row">
        <select aria-label="Pattern" value={patternId}
          onChange={(e) => { setPatternId(e.target.value); setFills({}); }}>
          {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Scope" value={scope}
          onChange={(e) => changeScope(e.target.value as Scope)}>
          {(Object.keys(SCOPE_LABEL) as Scope[]).map((s) => (
            <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
          ))}
        </select>
        {(['ctl', 'ltl', 'ctlstar'] as Logic[]).map((l) => (
          <button key={l} className="pattern-logic-btn"
            disabled={l === 'ctl' && scope !== 'globally'}
            aria-pressed={logicChoice === l}
            onClick={() => setLogicChoice(l)}>
            {LOGIC_LABEL[l]}
          </button>
        ))}
      </div>
      <div className="pattern-intent muted">{pattern.intent}</div>
      <div className="composer-row pattern-slots">
        {slots.map((s) => (
          <span key={s} className="pattern-slot" title={SLOT_ROLE[s]}>
            <span className="pattern-slot-label">{fills[s] !== undefined ? `${s} = ${fills[s]}` : s}</span>
            {props.map((p) => (
              <button key={p} className="prop-chip"
                onClick={() => setFills((f) => ({ ...f, [s]: p }))}>{p}</button>
            ))}
            {fills[s] !== undefined && (
              <button className="pattern-slot-clear" title="Clear"
                onClick={() => setFills((f) => { const n = { ...f }; delete n[s]; return n; })}>×</button>
            )}
          </span>
        ))}
      </div>
      <div className="composer-row">
        <code className="pattern-preview">{text}</code>
        <button className="pattern-insert" onClick={() => onInsert(text, logicChoice)}>Insert</button>
      </div>
      {gloss && <div className="pattern-gloss muted">“{gloss}”</div>}
    </div>
  );
}
