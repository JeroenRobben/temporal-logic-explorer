import { KripkeStructure } from '../../core/kripke';

/** MCS Exercise 5.5.1 / p.147 running example: s0{p,q} ⇄ s1{q,r}, both → s2{r}, s2 self-loop. */
export const M_BOOK: KripkeStructure = {
  states: [
    { id: 's0', name: 's0', propositions: ['p', 'q'], isInitial: true,  x: 200, y: 70 },
    { id: 's1', name: 's1', propositions: ['q', 'r'], isInitial: false, x: 110, y: 220 },
    { id: 's2', name: 's2', propositions: ['r'],      isInitial: false, x: 300, y: 220 },
  ],
  transitions: [
    { from: 's0', to: 's1' }, { from: 's1', to: 's0' },
    { from: 's0', to: 's2' }, { from: 's1', to: 's2' }, { from: 's2', to: 's2' },
  ],
};

/** MCS Fig 5.12: s{} (self-loop, edge to t), t{p} (self-loop). AG EF p holds at s; delete s→t and it fails. */
export const M_REACH: KripkeStructure = {
  states: [
    { id: 's', name: 's', propositions: [],    isInitial: true,  x: 140, y: 140 },
    { id: 't', name: 't', propositions: ['p'], isInitial: false, x: 320, y: 140 },
  ],
  transitions: [{ from: 's', to: 's' }, { from: 's', to: 't' }, { from: 't', to: 't' }],
};

/** M_REACH with s→t removed (solution model for the "cut the edge" tasks). */
export const M_REACH_CUT: KripkeStructure = {
  ...M_REACH,
  transitions: M_REACH.transitions.filter((t) => !(t.from === 's' && t.to === 't')),
};

/** MCS Fig 5.5 / Example 5.2.1: a{p} self-loop with an exit to b{} (self-loop). EG p vs AG p. */
export const M_ESCAPE: KripkeStructure = {
  states: [
    { id: 'a', name: 'a', propositions: ['p'], isInitial: true,  x: 140, y: 140 },
    { id: 'b', name: 'b', propositions: [],    isInitial: false, x: 320, y: 140 },
  ],
  transitions: [{ from: 'a', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'b' }],
};

/** Deadlock teaching model: d0{p} → d1{} with NO outgoing edges (deadlock). */
export const M_DEAD: KripkeStructure = {
  states: [
    { id: 'd0', name: 'd0', propositions: ['p'], isInitial: true,  x: 140, y: 140 },
    { id: 'd1', name: 'd1', propositions: [],    isInitial: false, x: 320, y: 140 },
  ],
  transitions: [{ from: 'd0', to: 'd1' }],
};
