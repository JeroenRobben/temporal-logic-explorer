import { KripkeStructure, deadlockStates } from './kripke';
import { StarNode, classify, pretty as prettyStar } from './ctlstar-parser';
import { LTLNode } from './ltl-parser';
import { BuchiAutomaton, ltlToBuchi } from './buchi';
import { buildProduct } from './product';
import { findAcceptingLasso } from './emptiness';
import { Lasso } from './trace';

export interface QuantifierInfo {
  /** The automaton the checker ran: ¬ψ′ for A-nodes, ψ′ for E-nodes. */
  automaton: BuchiAutomaton;
  /** Model with propositions extended by pseudo-props for state subformulas. */
  labeledModel: KripkeStructure;
  /** pseudo-prop name → pretty-printed state subformula. */
  legend: Map<string, string>;
}

export interface CTLStarResult {
  /** Satisfying state sets — state-level nodes only. */
  sat: Map<number, Set<string>>;
  /** All initial states satisfy the root; null when there are no initials. */
  verdict: boolean | null;
  quantifiers: Map<number, QuantifierInfo>;
  /** States with no outgoing transitions. */
  deadlocks: string[];
}

/**
 * Standard recursive CTL* model checking: bottom-up over state-formula
 * structure; each A/E node's path formula has its maximal state subformulas
 * replaced by pseudo-propositions (labeled into a cloned model from
 * already-computed sat sets), then A ψ is decided per state via Büchi
 * emptiness of labeledModel × A(¬ψ′) seeded at that state; E ψ dually via
 * non-emptiness of labeledModel × A(ψ′).
 */
export function checkCTLStar(
  model: KripkeStructure,
  root: StarNode,
  maxStates = 500,
): CTLStarResult {
  const cls = classify(root);
  const allIds = model.states.map((s) => s.id);
  const sat = new Map<number, Set<string>>();
  const quantifiers = new Map<number, QuantifierInfo>();

  function evalState(n: StarNode): Set<string> {
    let r: Set<string>;
    switch (n.kind) {
      case 'true': r = new Set(allIds); break;
      case 'false': r = new Set(); break;
      case 'prop':
        r = new Set(model.states.filter((s) => s.propositions.includes(n.name)).map((s) => s.id));
        break;
      case 'not': {
        const c = evalState(n.child);
        r = new Set(allIds.filter((x) => !c.has(x)));
        break;
      }
      case 'and': {
        const l = evalState(n.left), rr = evalState(n.right);
        r = new Set([...l].filter((x) => rr.has(x)));
        break;
      }
      case 'or': {
        const l = evalState(n.left), rr = evalState(n.right);
        r = new Set([...l, ...rr]);
        break;
      }
      case 'implies': {
        const l = evalState(n.left), rr = evalState(n.right);
        r = new Set(allIds.filter((x) => !l.has(x) || rr.has(x)));
        break;
      }
      case 'iff': {
        const l = evalState(n.left), rr = evalState(n.right);
        r = new Set(allIds.filter((x) => l.has(x) === rr.has(x)));
        break;
      }
      case 'A': r = evalQuantifier(n, false); break;
      case 'E': r = evalQuantifier(n, true); break;
      default:
        throw new Error(`internal: evalState reached path node ${n.kind}`);
    }
    sat.set(n.id, r);
    return r;
  }

  function evalQuantifier(n: Extract<StarNode, { child: StarNode }>, existential: boolean): Set<string> {
    const { ltl, legend, labeledModel } = substitute(n.child);
    // A ψ at s  ⟺ no path from s satisfies ¬ψ  ⟺ product with A(¬ψ′) empty at s.
    // E ψ at s  ⟺ some path from s satisfies ψ ⟺ product with A(ψ′) NON-empty at s.
    const target: LTLNode = existential ? ltl : { id: -1, kind: 'not', child: ltl };
    const automaton = ltlToBuchi(target, maxStates);
    quantifiers.set(n.id, { automaton, labeledModel, legend });
    const result = new Set<string>();
    for (const s of allIds) {
      const empty = findAcceptingLasso(buildProduct(labeledModel, automaton, [s])) === null;
      if (existential ? !empty : empty) result.add(s);
    }
    return result;
  }

  /** Replace maximal state-level subnodes of a path formula with pseudo-props
   *  (bare props/true/false pass through for readable guards), building the
   *  LTL formula and the pseudo-prop-labeled model. */
  function substitute(pathChild: StarNode): {
    ltl: LTLNode; legend: Map<string, string>; labeledModel: KripkeStructure;
  } {
    const legend = new Map<string, string>();
    const pseudoSat = new Map<string, Set<string>>();
    let nextId = 0;
    const fresh = () => nextId++;

    function conv(n: StarNode): LTLNode {
      if (cls.get(n.id) === 'state') {
        const s = evalState(n); // records sat for every state-level node
        if (n.kind === 'prop') return { id: fresh(), kind: 'prop', name: n.name };
        if (n.kind === 'true' || n.kind === 'false') return { id: fresh(), kind: n.kind };
        const name = `#${n.id}`;
        legend.set(name, prettyStar(n));
        pseudoSat.set(name, s);
        return { id: fresh(), kind: 'prop', name };
      }
      switch (n.kind) {
        case 'not': case 'X': case 'F': case 'G':
          return { id: fresh(), kind: n.kind, child: conv(n.child) };
        case 'and': case 'or': case 'implies': case 'iff': case 'U':
          return { id: fresh(), kind: n.kind, left: conv(n.left), right: conv(n.right) };
        default:
          throw new Error(`internal: conv reached unexpected node ${n.kind}`);
      }
    }

    const ltl = conv(pathChild);
    const labeledModel: KripkeStructure = {
      states: model.states.map((s) => ({
        ...s,
        propositions: [
          ...s.propositions,
          ...[...pseudoSat.entries()].filter(([, set]) => set.has(s.id)).map(([name]) => name),
        ],
      })),
      transitions: model.transitions,
    };
    return { ltl, legend, labeledModel };
  }

  const rootSat = evalState(root);
  const initials = model.states.filter((s) => s.isInitial);
  const verdict = initials.length === 0 ? null : initials.every((s) => rootSat.has(s.id));
  return { sat, verdict, quantifiers, deadlocks: deadlockStates(model) };
}

/**
 * Top-level evidence: failing root A ψ → counterexample lasso from a violating
 * initial state; holding root E ψ → witness lasso from a satisfying initial
 * state. Both are paths of the REAL model (the labeled model shares its graph).
 */
export function findStarEvidence(
  model: KripkeStructure,
  root: StarNode,
  result: CTLStarResult,
): { lasso: Lasso; kind: 'witness' | 'counterexample' } | null {
  if (root.kind !== 'A' && root.kind !== 'E') return null;
  const q = result.quantifiers.get(root.id);
  const rootSat = result.sat.get(root.id);
  if (!q || !rootSat) return null;
  const initials = model.states.filter((s) => s.isInitial);
  const from = root.kind === 'A'
    ? initials.find((s) => !rootSat.has(s.id))   // violating initial
    : initials.find((s) => rootSat.has(s.id));   // satisfying initial
  if (!from) return null;
  const product = buildProduct(q.labeledModel, q.automaton, [from.id]);
  const productLasso = findAcceptingLasso(product);
  if (!productLasso) return null;
  const byId = new Map(product.states.map((s) => [s.id, s]));
  const lasso: Lasso = {
    stateIds: productLasso.path.map((id) => byId.get(id)!.modelStateId),
    loopIndex: productLasso.loopIndex,
  };
  return { lasso, kind: root.kind === 'A' ? 'counterexample' : 'witness' };
}
