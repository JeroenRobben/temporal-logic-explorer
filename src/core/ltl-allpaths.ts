import { KripkeStructure } from './kripke';
import { LTLNode } from './ltl-parser';
import { Lasso } from './trace';
import { AutomatonTooLarge, BuchiAutomaton, ltlToBuchi } from './buchi';
import { ProductGraph, buildProduct } from './product';
import { findAcceptingLasso } from './emptiness';

export type AllPathsResult =
  | { kind: 'holds'; automaton: BuchiAutomaton; product: ProductGraph }
  | { kind: 'fails'; counterexample: Lasso; automaton: BuchiAutomaton; product: ProductGraph }
  | { kind: 'too-large' }
  | { kind: 'no-initial' };

/** M ⊨ ∀φ iff the language of M × A(¬φ) is empty. */
export function checkLTLAllPaths(model: KripkeStructure, root: LTLNode): AllPathsResult {
  if (!model.states.some((s) => s.isInitial)) return { kind: 'no-initial' };
  let automaton: BuchiAutomaton;
  try {
    automaton = ltlToBuchi({ id: -1, kind: 'not', child: root });
  } catch (e) {
    if (e instanceof AutomatonTooLarge) return { kind: 'too-large' };
    throw e;
  }
  const product = buildProduct(model, automaton);
  const lasso = findAcceptingLasso(product);
  if (lasso === null) return { kind: 'holds', automaton, product };
  const byId = new Map(product.states.map((s) => [s.id, s]));
  const counterexample: Lasso = {
    stateIds: lasso.path.map((id) => byId.get(id)!.modelStateId),
    loopIndex: lasso.loopIndex,
  };
  return { kind: 'fails', counterexample, automaton, product };
}
