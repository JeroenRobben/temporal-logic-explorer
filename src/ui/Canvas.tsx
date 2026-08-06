import { KripkeStructure } from '../core/kripke';
import { Evidence } from '../core/evidence';

export interface Highlight {
  sat: Set<string>;
  fresh: Set<string>;
  color: string;
}

export interface CanvasProps {
  model: KripkeStructure;
  onChange: (m: KripkeStructure) => void;
  selectedStateId: string | null;
  onSelectState: (id: string | null) => void;
  highlight: Highlight | null;
  evidence: Evidence | null;
  deadlocks: Set<string>;
}

export default function Canvas(_props: CanvasProps) {
  return <div className="canvas-help">canvas coming in Task 8</div>;
}
