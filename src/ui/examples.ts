import { KripkeStructure } from '../core/kripke';
import { FormulaEntry } from './types';

export interface Example {
  name: string;
  model: KripkeStructure;
  formulas: FormulaEntry[];
}

export const EXAMPLES: Example[] = [
  {
    name: 'Reset system (AG EF)',
    model: {
      states: [
        { id: 's0', name: 'work', propositions: ['w'], isInitial: true, x: 160, y: 140 },
        { id: 's1', name: 'error', propositions: [], isInitial: false, x: 380, y: 140 },
        { id: 's2', name: 'reset', propositions: ['r'], isInitial: false, x: 270, y: 320 },
      ],
      transitions: [
        { from: 's0', to: 's0' }, { from: 's0', to: 's1' },
        { from: 's1', to: 's2' }, { from: 's2', to: 's0' },
      ],
    },
    formulas: [
      { id: 'f1', text: 'AG EF r', logic: 'ctl' }, // true: reset is reachable from everywhere
      { id: 'f2', text: 'AF r', logic: 'ctl' }, // false: work can self-loop forever
      { id: 'f3', text: 'AG (w -> EX true)', logic: 'ctl' }, // true: work states have successors
      { id: 'f4', text: 'G F r', logic: 'ltl' }, // '–' until you build a trace; true iff reset is in the loop
    ],
  },
  {
    name: 'Mutual exclusion',
    model: {
      states: [
        { id: 'n', name: 'idle', propositions: [], isInitial: true, x: 270, y: 120 },
        { id: 'c1', name: 'crit1', propositions: ['c1'], isInitial: false, x: 140, y: 300 },
        { id: 'c2', name: 'crit2', propositions: ['c2'], isInitial: false, x: 400, y: 300 },
      ],
      transitions: [
        { from: 'n', to: 'c1' }, { from: 'n', to: 'c2' },
        { from: 'c1', to: 'n' }, { from: 'c2', to: 'n' },
      ],
    },
    formulas: [
      { id: 'f1', text: 'AG !(c1 & c2)', logic: 'ctl' }, // true: never both critical
      { id: 'f2', text: 'AG EF c1', logic: 'ctl' }, // true: crit1 stays reachable
      { id: 'f3', text: 'E[!c2 U c1]', logic: 'ctl' }, // true: some path keeps ¬c2 until c1
    ],
  },
  {
    name: 'Deadlock demo',
    model: {
      states: [
        { id: 's0', name: 'alive', propositions: ['p'], isInitial: true, x: 180, y: 200 },
        { id: 's1', name: 'stuck', propositions: [], isInitial: false, x: 400, y: 200 },
      ],
      transitions: [
        { from: 's0', to: 's0' }, { from: 's0', to: 's1' },
      ],
    },
    formulas: [
      { id: 'f1', text: 'AG EF p', logic: 'ctl' }, // false: 'stuck' cannot reach p
      { id: 'f2', text: 'AX false', logic: 'ctl' }, // false at 'alive' (has successors); vacuously true at 'stuck'
    ],
  },
];
