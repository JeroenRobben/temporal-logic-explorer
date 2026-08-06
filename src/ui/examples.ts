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
      { id: 'f1', text: 'AG EF r' },
      { id: 'f2', text: 'AF r' },
      { id: 'f3', text: 'AG (w -> EX true)' },
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
      { id: 'f1', text: 'AG !(c1 & c2)' },
      { id: 'f2', text: 'AG EF c1' },
      { id: 'f3', text: 'A[!c2 U c1]' },
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
      { id: 'f1', text: 'AG EF p' },
      { id: 'f2', text: 'AX false' },
    ],
  },
];
