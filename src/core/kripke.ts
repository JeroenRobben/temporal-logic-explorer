export interface KripkeState {
  id: string;
  name: string;
  propositions: string[];
  isInitial: boolean;
  x: number; // UI-only metadata; core algorithms ignore position
  y: number;
}

export interface Transition {
  from: string;
  to: string;
}

export interface KripkeStructure {
  states: KripkeState[];
  transitions: Transition[];
}

export function successors(k: KripkeStructure, stateId: string): string[] {
  return k.transitions.filter((t) => t.from === stateId).map((t) => t.to);
}

export function stateById(k: KripkeStructure, id: string): KripkeState | undefined {
  return k.states.find((s) => s.id === id);
}

export function deadlockStates(k: KripkeStructure): string[] {
  return k.states.filter((s) => successors(k, s.id).length === 0).map((s) => s.id);
}

export function allPropositions(k: KripkeStructure): string[] {
  return [...new Set(k.states.flatMap((s) => s.propositions))];
}
