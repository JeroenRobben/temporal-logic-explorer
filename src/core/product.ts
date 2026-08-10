import { KripkeStructure, stateById, successors } from './kripke';
import { BuchiAutomaton, Literal } from './buchi';

export interface ProductState {
  id: string; // `${modelStateId}×${buchiName}`
  modelStateId: string;
  buchiStateId: number;
  accepting: boolean;
  initial: boolean;
}

export interface ProductGraph {
  states: ProductState[];
  edges: { from: string; to: string }[];
}

function satisfies(props: string[], guard: Literal[]): boolean {
  return guard.every((l) => (l.negated ? !props.includes(l.prop) : props.includes(l.prop)));
}

/** Synchronous product of a Kripke structure with a Büchi automaton.
 *  Only states reachable from the initial set are materialized.
 *  `initialIds` overrides which model states seed the product (default: the
 *  model's isInitial states) — used by the CTL* checker for per-state checks. */
export function buildProduct(
  model: KripkeStructure,
  aut: BuchiAutomaton,
  initialIds?: string[],
): ProductGraph {
  const nameOf = new Map(aut.states.map((q) => [q.id, q.name]));
  const acceptingOf = new Map(aut.states.map((q) => [q.id, q.accepting]));
  const outgoing = new Map<number, { to: number; guard: Literal[] }[]>();
  for (const t of aut.transitions) {
    const arr = outgoing.get(t.from) ?? [];
    arr.push({ to: t.to, guard: t.guard });
    outgoing.set(t.from, arr);
  }

  const pid = (s: string, q: number) => `${s}×${nameOf.get(q)}`;
  const states = new Map<string, ProductState>();
  const edgeSet = new Set<string>();
  const edges: { from: string; to: string }[] = [];
  const queue: ProductState[] = [];

  const seeds = initialIds !== undefined
    ? model.states.filter((x) => initialIds.includes(x.id))
    : model.states.filter((x) => x.isInitial);
  for (const s of seeds) {
    for (const q of aut.states.filter((x) => x.initial)) {
      if (!satisfies(s.propositions, q.entryGuard)) continue;
      const ps: ProductState = {
        id: pid(s.id, q.id), modelStateId: s.id, buchiStateId: q.id,
        accepting: q.accepting, initial: true,
      };
      if (!states.has(ps.id)) { states.set(ps.id, ps); queue.push(ps); }
    }
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const modelSucc = successors(model, cur.modelStateId);
    for (const { to, guard } of outgoing.get(cur.buchiStateId) ?? []) {
      for (const sTo of modelSucc) {
        const sState = stateById(model, sTo)!;
        if (!satisfies(sState.propositions, guard)) continue;
        const id = pid(sTo, to);
        if (!states.has(id)) {
          const ps: ProductState = {
            id, modelStateId: sTo, buchiStateId: to,
            accepting: acceptingOf.get(to)!, initial: false,
          };
          states.set(id, ps);
          queue.push(ps);
        }
        const ek = `${cur.id}->${id}`;
        if (!edgeSet.has(ek)) { edgeSet.add(ek); edges.push({ from: cur.id, to: id }); }
      }
    }
  }

  return { states: [...states.values()], edges };
}
