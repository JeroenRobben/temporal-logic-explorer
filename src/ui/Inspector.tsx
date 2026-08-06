import { KripkeStructure } from '../core/kripke';
import { Analysis, Selection } from './types';

export interface InspectorProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selection: Selection;
  analysis: Analysis | null;
  selectedNodeId: number | null;
  onSelectNode: (id: number | null) => void;
  stepIndex: number | null;
  onStepIndex: (i: number | null) => void;
  showEvidence: boolean;
  onShowEvidence: (b: boolean) => void;
}

export default function Inspector(_props: InspectorProps) {
  return <div className="muted">inspector coming in Task 10</div>;
}
