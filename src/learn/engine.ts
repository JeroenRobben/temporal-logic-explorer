import { parseCTL, pretty as prettyCTL } from '../core/ctl-parser';
import { parseLTL, pretty as prettyLTL } from '../core/ltl-parser';
import { parseCTLStar, pretty as prettyStar } from '../core/ctlstar-parser';
import { Logic } from '../ui/types';
import { TutorialStep } from './types';

type AnyNode = { id: number; kind: string };

export function parseForLogic(logic: Logic, text: string): unknown | null {
  try {
    if (logic === 'ctl') return parseCTL(text);
    if (logic === 'ltl') return parseLTL(text);
    return parseCTLStar(text);
  } catch { return null; }
}

export function prettyForLogic(logic: Logic, node: unknown): string {
  if (logic === 'ctl') return prettyCTL(node as never);
  if (logic === 'ltl') return prettyLTL(node as never);
  return prettyStar(node as never);
}

/** Generic AST walk: every node is a plain object with numeric `id` and `kind`. */
function collectNodes(n: unknown, out: AnyNode[]): void {
  if (n === null || typeof n !== 'object') return;
  const o = n as Record<string, unknown>;
  if (typeof o.id === 'number' && typeof o.kind === 'string') out.push(o as unknown as AnyNode);
  for (const v of Object.values(o)) {
    if (Array.isArray(v)) v.forEach((x) => collectNodes(x, out));
    else if (v !== null && typeof v === 'object') collectNodes(v, out);
  }
}

export function findNodeByPretty(logic: Logic, text: string, target: string): number | null {
  const ast = parseForLogic(logic, text);
  if (ast === null) return null;
  const nodes: AnyNode[] = [];
  collectNodes(ast, nodes);
  const hit = nodes.find((n) => prettyForLogic(logic, n) === target);
  return hit ? hit.id : null;
}

export function prettyOfNode(logic: Logic, text: string, nodeId: number): string | null {
  const ast = parseForLogic(logic, text);
  if (ast === null) return null;
  const nodes: AnyNode[] = [];
  collectNodes(ast, nodes);
  const hit = nodes.find((n) => n.id === nodeId);
  return hit ? prettyForLogic(logic, hit) : null;
}

export function stepKind(step: TutorialStep): 'task' | 'info' {
  return step.checkpoint ? 'task' : 'info';
}
