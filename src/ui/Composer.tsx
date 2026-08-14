import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { KripkeStructure, allPropositions } from '../core/kripke';
import { parseCTL, ParseError, CTLNode } from '../core/ctl-parser';
import { parseLTL, LTLNode } from '../core/ltl-parser';
import { parseCTLStar, StarNode } from '../core/ctlstar-parser';
import { pretty as prettyCTL } from '../core/ctl-parser';
import { pretty as prettyLTL } from '../core/ltl-parser';
import { pretty as prettyStar } from '../core/ctlstar-parser';
import { Logic, LOGIC_LABEL } from './types';
import { tokenize } from './highlight';
import { glossify } from './gloss';
import { REF_BY_PALETTE } from '../learn/content';
import PatternPicker from './PatternPicker';
import BuilderView from './BuilderView';

type ParsedState = { ast: CTLNode | LTLNode | StarNode } | { error: ParseError } | null;

interface ComposerProps {
  logic: Logic;
  model: KripkeStructure;
  editing: { id: string; text: string; logic: Logic } | null;
  onSave: (text: string) => void;
  onCancelEdit: () => void;
  onSwitchLogic: (l: Logic) => void;
  onOpenLearn: (id: string) => void;
}

const HOLE = '▢';

interface PaletteEntry { label: string; insert: string; gloss: string; template?: boolean }

function palette(logic: Logic): PaletteEntry[] {
  const bool: PaletteEntry[] = [
    { label: '∧', insert: `(${HOLE} & ${HOLE})`, template: true, gloss: 'both hold' },
    { label: '∨', insert: `(${HOLE} | ${HOLE})`, template: true, gloss: 'at least one holds' },
    { label: '¬', insert: '!', gloss: 'does not hold' },
    { label: '→', insert: `(${HOLE} -> ${HOLE})`, template: true, gloss: 'if the left holds, so does the right' },
    { label: '↔', insert: `(${HOLE} <-> ${HOLE})`, template: true, gloss: 'both or neither' },
  ];
  if (logic === 'ctl') {
    return [
      { label: 'AG', insert: 'AG ', gloss: 'on every path, at every step' },
      { label: 'EF', insert: 'EF ', gloss: 'on some path, eventually' },
      { label: 'AF', insert: 'AF ', gloss: 'on every path, eventually' },
      { label: 'EG', insert: 'EG ', gloss: 'on some path, at every step' },
      { label: 'AX', insert: 'AX ', gloss: 'in every next state' },
      { label: 'EX', insert: 'EX ', gloss: 'in some next state' },
      { label: 'A[▢U▢]', insert: `A[${HOLE} U ${HOLE}]`, template: true, gloss: 'on every path, left holds until right does' },
      { label: 'E[▢U▢]', insert: `E[${HOLE} U ${HOLE}]`, template: true, gloss: 'on some path, left holds until right does' },
      ...bool,
    ];
  }
  if (logic === 'ltl') {
    return [
      { label: 'G', insert: 'G ', gloss: 'at every step from here on' },
      { label: 'F', insert: 'F ', gloss: 'eventually' },
      { label: 'X', insert: 'X ', gloss: 'in the next step' },
      { label: '▢U▢', insert: `(${HOLE} U ${HOLE})`, template: true, gloss: 'left holds until right does' },
      ...bool,
    ];
  }
  return [
    { label: 'A', insert: 'A ', gloss: 'on every path from here' },
    { label: 'E', insert: 'E ', gloss: 'on some path from here' },
    { label: 'G', insert: 'G ', gloss: 'at every step from here on' },
    { label: 'F', insert: 'F ', gloss: 'eventually' },
    { label: 'X', insert: 'X ', gloss: 'in the next step' },
    { label: '▢U▢', insert: `(${HOLE} U ${HOLE})`, template: true, gloss: 'left holds until right does' },
    ...bool,
  ];
}

/** logic-dispatched pretty-printer; kept as a plain switch (rather than a
 * generic-typed helper) so it compiles cleanly under strict mode — the three
 * parsers' node types are structurally disjoint enough that a shared generic
 * signature isn't worth the `as` gymnastics it would need at the call site. */
function prettyOf(logic: Logic, ast: unknown): string {
  if (logic === 'ctl') return prettyCTL(ast as Parameters<typeof prettyCTL>[0]);
  if (logic === 'ltl') return prettyLTL(ast as Parameters<typeof prettyLTL>[0]);
  return prettyStar(ast as Parameters<typeof prettyStar>[0]);
}

export default function Composer({ logic, model, editing, onSave, onCancelEdit, onSwitchLogic, onOpenLearn }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const preEditDraft = useRef<string>('');
  const pendingSelect = useRef<{ start: number; end: number } | null>(null);
  const prevEditingId = useRef<string | null>(null);

  // Entering edit mode loads the text; leaving restores the old draft. Only
  // stash the draft on a fresh edit session (null -> editing); switching
  // directly between two edits must not clobber the original stash with the
  // first edit's unsaved in-progress text.
  const editingId = editing?.id ?? null;
  useEffect(() => {
    if (editing) {
      if (prevEditingId.current === null) preEditDraft.current = draft;
      setDraft(editing.text);
      taRef.current?.focus();
    } else {
      setDraft(preEditDraft.current);
    }
    prevEditingId.current = editingId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (pendingSelect.current && taRef.current) {
      taRef.current.focus();
      taRef.current.setSelectionRange(pendingSelect.current.start, pendingSelect.current.end);
      pendingSelect.current = null;
    }
  }, [draft]);

  const hasHoles = draft.includes(HOLE);

  // While editing, the row being edited carries its own logic, which may
  // differ from the header tab's current entry logic — validate and render
  // against the ROW's logic so an LTL row edited from the CTL tab still
  // parses (and saves) as LTL.
  const effLogic: Logic = editing?.logic ?? logic;

  const parsed = useMemo<ParsedState>(() => {
    const text = draft.trim();
    if (text === '' || hasHoles) return null;
    try {
      const ast = effLogic === 'ctl' ? parseCTL(text) : effLogic === 'ltl' ? parseLTL(text) : parseCTLStar(text);
      return { ast };
    } catch (e) {
      if (e instanceof ParseError) return { error: e };
      throw e;
    }
  }, [draft, effLogic, hasHoles]);

  function selectHole(from: number, backwards = false) {
    const positions: number[] = [];
    for (let i = 0; i < draft.length; i++) if (draft[i] === HOLE) positions.push(i);
    if (positions.length === 0) return;
    let target: number | undefined;
    if (backwards) {
      target = [...positions].reverse().find((p) => p < from - 1) ?? positions[positions.length - 1];
    } else {
      target = positions.find((p) => p >= from) ?? positions[0];
    }
    taRef.current?.focus();
    taRef.current?.setSelectionRange(target, target + 1);
  }

  function insertAtCaret(text: string, template = false) {
    const ta = taRef.current;
    const start = ta ? ta.selectionStart : draft.length;
    const end = ta ? ta.selectionEnd : draft.length;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const needsLeft = before !== '' && !/[\s([]$/.test(before);
    const needsRight = after !== '' && !/^[\s)\]]/.test(after) && !text.endsWith(' ');
    const glued = (needsLeft ? ' ' : '') + text + (needsRight ? ' ' : '');
    const next = before + glued + after;
    if (template) {
      const holeInInsert = glued.indexOf(HOLE);
      pendingSelect.current = { start: start + holeInInsert, end: start + holeInInsert + 1 };
    } else {
      const caret = start + (needsLeft ? 1 : 0) + text.length;
      pendingSelect.current = { start: caret, end: caret };
    }
    setDraft(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab' && hasHoles) {
      e.preventDefault();
      selectHole(taRef.current?.selectionEnd ?? 0, e.shiftKey);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = draft.trim();
      // Only holes block a save (unlexable, would corrupt the stored formula);
      // a parse error does not — the row is added/updated with its error shown
      // inline, same as the pre-Composer bare-input behavior the rest of the
      // app (analyses, verdict badges) already handles.
      if (text === '' || hasHoles) return;
      onSave(text);
      if (!editing) setDraft('');
      return;
    }
    if (e.key === 'Escape' && editing) {
      e.preventDefault();
      onCancelEdit();
    }
  }

  const crossLogicTarget: Logic | null = useMemo(() => {
    if (!parsed || !('error' in parsed)) return null;
    const blob = `${parsed.error.message} ${parsed.error.hint ?? ''}`;
    if (effLogic !== 'ctl' && /CTL(?!\*)/.test(blob) && /bracket|path quantifier — that's CTL/.test(blob)) return 'ctl';
    if (effLogic === 'ctl' && /path formula/.test(blob)) return 'ltl';
    return null;
  }, [parsed, effLogic]);

  return (
    <div className="composer">
      {editing && <div className="editing-banner">editing — Enter saves, Esc cancels</div>}
      <div className="composer-top">
        <div className="composer-input-wrap" data-learn="palette-input">
          <div className="composer-highlight" ref={hlRef} aria-hidden="true">
            {tokenize(draft, effLogic).map((t, i) => (
              <span key={i} className={t.cls === 'space' ? undefined : `tok-${t.cls}`}>{t.text}</span>
            ))}
          </div>
          <textarea
            ref={taRef} rows={1} className="composer-textarea" spellCheck={false}
            placeholder={`Add ${LOGIC_LABEL[effLogic]} formula — press Enter`}
            value={draft} readOnly={builderOpen}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={() => { if (hlRef.current && taRef.current) hlRef.current.scrollLeft = taRef.current.scrollLeft; }}
          />
        </div>
        <button className="builder-toggle" aria-pressed={builderOpen}
          title="Build the formula structurally"
          onClick={() => setBuilderOpen((o) => !o)}>
          ⌗ Builder
        </button>
      </div>
      {builderOpen && (
        // Keyed so a logic change (or entering/leaving row editing) remounts
        // the builder, reseeding it from the current draft; reopening the
        // toggle reseeds the same way via unmount/remount.
        <BuilderView key={`${effLogic}:${editingId ?? ''}`}
          logic={effLogic} model={model} initialText={draft} onChange={setDraft} />
      )}
      <div className="composer-status">
        {(() => {
          if (draft.trim() === '') return null;
          if (hasHoles) return <span className="muted">fill the holes — Tab jumps to the next</span>;
          const err = parsed && 'error' in parsed ? parsed.error : null;
          if (err) {
            const fix = err.fix;
            return (
              <>
                <div className="parse-error">
                  {err.message}
                  <div className="composer-caret-marker">{' '.repeat(Math.min(err.pos, 200))}▲</div>
                </div>
                {err.hint && <div className="hint">💡 {err.hint}</div>}
                <div className="composer-row">
                  {fix && (
                    <button className="fix-btn" onClick={() => {
                      pendingSelect.current = { start: fix.replacement.length, end: fix.replacement.length };
                      setDraft(fix.replacement);
                    }}>{fix.label}</button>
                  )}
                  {crossLogicTarget && !fix && !editing && (
                    <button className="fix-btn" onClick={() => onSwitchLogic(crossLogicTarget)}>
                      Switch to {LOGIC_LABEL[crossLogicTarget]}
                    </button>
                  )}
                </div>
              </>
            );
          }
          const ast = parsed && 'ast' in parsed ? parsed.ast : null;
          if (ast) {
            return <span className="ok">✓ {prettyOf(effLogic, ast)} — “{glossify(ast, effLogic)}”</span>;
          }
          return null;
        })()}
      </div>
      <div className="composer-row">
        {allPropositions(model).map((p) => (
          <button key={p} className="prop-chip" onClick={() => insertAtCaret(p)}>{p}</button>
        ))}
        {allPropositions(model).length === 0 && <span className="muted">no propositions yet</span>}
      </div>
      <div className="composer-row">
        {palette(effLogic).map((entry) => {
          const refId = REF_BY_PALETTE[entry.label];
          return (
            <Fragment key={entry.label}>
              <button className="op-btn" title={entry.gloss}
                onClick={() => insertAtCaret(entry.insert, entry.template)}>
                {entry.label}
              </button>
              {refId && (
                <button className="learn-q" title="What is this?"
                  data-learn={`palette-${entry.label}`}
                  onClick={() => onOpenLearn(refId)}>?</button>
              )}
            </Fragment>
          );
        })}
      </div>
      {!editing && (
        <PatternPicker model={model} logic={logic}
          onInsert={(text, l) => {
            if (l !== logic) onSwitchLogic(l);
            // Same post-update mechanism as insertAtCaret: stash the target
            // selection, let the [draft] effect focus + select once React
            // commits. First hole if any, else caret at the end.
            const hole = text.indexOf(HOLE);
            if (text === draft) {
              // setDraft would bail (same value) and the [draft] effect never
              // runs — select immediately instead of leaving a stale pending
              // selection to yank the caret on the next unrelated edit.
              const ta = taRef.current;
              if (ta) {
                ta.focus();
                if (hole >= 0) ta.setSelectionRange(hole, hole + 1);
              }
              return;
            }
            pendingSelect.current = hole >= 0
              ? { start: hole, end: hole + 1 }
              : { start: text.length, end: text.length };
            setDraft(text);
          }} />
      )}
    </div>
  );
}
