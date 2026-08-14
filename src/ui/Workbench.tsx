import { useEffect, type ReactNode } from 'react';

export type WorkbenchMode = 'builder' | 'patterns';

interface WorkbenchProps {
  mode: WorkbenchMode;
  /** Live pretty (or raw) draft, shown in the header; null hides the slot. */
  pretty: string | null;
  /** Patterns is unavailable while editing a row — hides the mode switch. */
  allowPatterns: boolean;
  onMode: (m: WorkbenchMode) => void;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Drawer shell for the builder/patterns workbench: backdrop + elevated panel
 * inset in the center pane, header with mode switch, live draft and ✕.
 * Content (BuilderView / PatternPicker) is supplied by the composer, which
 * portals this whole shell into the center pane's slot — all draft/coherence
 * state stays in the composer.
 */
export default function Workbench({ mode, pretty, allowPatterns, onMode, onClose, children }: WorkbenchProps) {
  // Esc closes the drawer — unless a builder popover is open, in which case
  // the popover's own document listener consumes the press (layered dismiss;
  // the DOM still contains the popover while both listeners run).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.builder-popover')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="workbench">
      <div className="workbench-backdrop" onClick={onClose} />
      <div className="workbench-panel" role="dialog" aria-label="Workbench">
        <div className="workbench-header">
          <div className="workbench-modes">
            <button className="workbench-mode" aria-pressed={mode === 'builder'}
              onClick={() => onMode('builder')}>Builder</button>
            {allowPatterns && (
              <button className="workbench-mode" aria-pressed={mode === 'patterns'}
                onClick={() => onMode('patterns')}>Patterns</button>
            )}
          </div>
          {pretty !== null && <code className="workbench-pretty">{pretty}</code>}
          <button className="workbench-close" title="Close" onClick={onClose}>✕</button>
        </div>
        <div className="workbench-body">{children}</div>
      </div>
    </div>
  );
}
