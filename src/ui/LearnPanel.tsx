import { Fragment, ReactNode } from 'react';
import { LearnView, Tutorial } from '../learn/types';
import { REFERENCES, referenceById } from '../learn/content';
import { stepKind } from '../learn/engine';
import { LOGIC_LABEL, Logic } from './types';

interface Props {
  refId: string | null;                              // reference view when set (and no tutorial)
  tutorial: { def: Tutorial; step: number } | null;  // tutorial view when set (wins)
  view: LearnView | null;                            // for live checkpoint status
  onOpenRef: (id: string | null) => void;
  onStartTutorial: (id: string) => void;
  onExitTutorial: () => void;
  onNext: () => void;
  onBack: () => void;
  onShowMe: () => void;
}

/** Markdown-lite: **bold** and `code` only. */
function md(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const GROUP_ORDER: (Logic | 'shared' | 'pattern')[] = ['shared', 'ctl', 'ltl', 'ctlstar', 'pattern'];

function groupLabel(g: Logic | 'shared' | 'pattern'): string {
  if (g === 'shared') return 'Shared';
  if (g === 'pattern') return 'Patterns (Dwyer)';
  return LOGIC_LABEL[g];
}

export default function LearnPanel(props: Props) {
  const { refId, tutorial, view } = props;

  if (tutorial) {
    const { def, step } = tutorial;
    const s = def.steps[step];
    const isTask = stepKind(s) === 'task';
    const done = isTask && view !== null && s.checkpoint!(view);
    const isLast = step === def.steps.length - 1;
    return (
      <div className="learn-panel">
        <h3>{def.title}</h3>
        <div className="muted">step {step + 1} / {def.steps.length}</div>
        <p className="learn-step-text">{md(s.text)}</p>
        {isTask ? (
          <div className="learn-task-status">
            <span className={done ? 'learn-done' : 'muted'}>
              {done ? '✓ done — advancing…' : '… waiting for you'}
            </span>
            <button onClick={props.onShowMe}>Show me</button>
          </div>
        ) : (
          <div className="learn-nav">
            {step > 0 && <button onClick={props.onBack}>◂ Back</button>}
            <button onClick={props.onNext}>{isLast ? 'Finish ✓' : 'Next ▸'}</button>
          </div>
        )}
        <button className="learn-exit" onClick={props.onExitTutorial}>Exit tutorial</button>
      </div>
    );
  }

  if (refId !== null) {
    const r = referenceById(refId);
    if (!r) {
      return (
        <div className="learn-panel">
          <button className="learn-back" onClick={() => props.onOpenRef(null)}>← All operators</button>
          <p className="muted">Unknown reference.</p>
        </div>
      );
    }
    return (
      <div className="learn-panel">
        <button className="learn-back" onClick={() => props.onOpenRef(null)}>← All operators</button>
        <h3>{r.name}</h3>
        <div className="learn-symbol">{r.symbol}</div>
        <div className="section-title">Meaning</div>
        <p>{r.informal}</p>
        <div className="section-title">Formal rule</div>
        <p><code>{r.formal}</code></p>
        {r.equivalences.length > 0 && (
          <>
            <div className="section-title">Equivalences</div>
            <ul>{r.equivalences.map((e) => <li key={e}><code>{e}</code></li>)}</ul>
          </>
        )}
        {r.patterns.length > 0 && (
          <>
            <div className="section-title">Patterns</div>
            <ul>
              {r.patterns.map((p) => (
                <li key={p.formula}><code>{p.formula}</code> — {p.reading}</li>
              ))}
            </ul>
          </>
        )}
        {r.pitfalls.length > 0 && (
          <>
            <div className="section-title">Pitfalls</div>
            <ul>{r.pitfalls.map((p) => <li key={p}>{p}</li>)}</ul>
          </>
        )}
        {r.tutorialId && (
          <button className="learn-start" onClick={() => props.onStartTutorial(r.tutorialId!)}>
            Start tutorial ▸
          </button>
        )}
        <div className="muted learn-bookref">{r.bookRef}</div>
      </div>
    );
  }

  // Index view
  return (
    <div className="learn-panel">
      {GROUP_ORDER.map((g) => {
        const refs = REFERENCES.filter((r) => r.logic === g);
        if (refs.length === 0) return null;
        return (
          <div key={g} className="learn-ref-section">
            <div className="section-title">{groupLabel(g)}</div>
            {refs.map((r) => (
              <div key={r.id} className="learn-row" onClick={() => props.onOpenRef(r.id)}>
                <span className="learn-symbol">{r.symbol}</span>
                <span className="learn-name">{r.name}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
