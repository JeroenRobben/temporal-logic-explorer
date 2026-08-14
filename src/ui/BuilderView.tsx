import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KripkeStructure, allPropositions } from '../core/kripke';
import { Logic } from './types';
import {
  HNode, OpId, Path, ARITY,
  fromAst, toText, replaceAt, wrapAt, deleteAt,
} from '../builder/htree';
import { optionsFor } from '../builder/catalog';

interface BuilderViewProps {
  logic: Logic;
  model: KripkeStructure;
  initialText: string;
  onChange: (text: string) => void;
  onNotice?: (msg: string) => void;
}

const HOLE = '▢';

/** Display glyph per op, used for palette buttons and node labels. */
const OP_LABEL: Record<OpId, string> = {
  not: '¬', and: '∧', or: '∨', implies: '→', iff: '↔',
  X: 'X', F: 'F', G: 'G', U: 'U',
  AX: 'AX', EX: 'EX', AF: 'AF', EF: 'EF', AG: 'AG', EG: 'EG',
  AU: 'A[▢U▢]', EU: 'E[▢U▢]',
  A: 'A', E: 'E',
};

/** Existing token classes color the operator labels the same as text mode. */
const OP_TOKEN: Record<OpId, string> = {
  not: 'tok-connective', and: 'tok-connective', or: 'tok-connective',
  implies: 'tok-connective', iff: 'tok-connective',
  X: 'tok-temporal', F: 'tok-temporal', G: 'tok-temporal', U: 'tok-temporal',
  AX: 'tok-quantifier', EX: 'tok-quantifier', AF: 'tok-quantifier', EF: 'tok-quantifier',
  AG: 'tok-quantifier', EG: 'tok-quantifier', AU: 'tok-quantifier', EU: 'tok-quantifier',
  A: 'tok-quantifier', E: 'tok-quantifier',
};

const IMPORT_NOTICE = 'draft could not be imported — starting from a blank hole';

type Popover = { path: Path; kind: 'palette' | 'menu' };

function opWithHoles(op: OpId): HNode {
  const children: HNode[] = [];
  for (let i = 0; i < ARITY[op]; i++) children.push({ kind: 'hole' });
  return { kind: 'op', op, children };
}

/**
 * Hole-driven visual formula builder. Owns an HNode tree seeded once from
 * `initialText` (the composer remounts it — keyed — whenever a reseed is
 * wanted, so seeding only in the initializer is deliberate); every edit
 * pretty-prints into the draft via `onChange`.
 */
export default function BuilderView({ logic, model, initialText, onChange, onNotice }: BuilderViewProps) {
  const [seed] = useState<{ tree: HNode; failed: boolean }>(() => {
    const text = initialText.trim();
    if (text === '') return { tree: { kind: 'hole' }, failed: false };
    const imported = fromAst(logic, text);
    return imported !== null
      ? { tree: imported, failed: false }
      : { tree: { kind: 'hole' }, failed: true };
  });
  const [tree, setTree] = useState<HNode>(seed.tree);
  const [popover, setPopover] = useState<Popover | null>(null);
  const popRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (seed.failed) onNotice?.(IMPORT_NOTICE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One popover at a time (single state); Escape and outside-mousedown close it.
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setPopover(null); };
    const onDown = (e: MouseEvent) => {
      if (!(e.target instanceof Node) || !popRef.current?.contains(e.target)) setPopover(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [popover]);

  function commit(next: HNode) {
    setTree(next);
    setPopover(null);
    onChange(toText(next, logic));
  }

  function renderPalette(path: Path): ReactNode {
    const opts = optionsFor(logic, tree, path);
    return (
      <span className="builder-popover" ref={(el) => { popRef.current = el; }}>
        {opts.ops.map((op) => (
          <button key={op} className={`op-btn ${OP_TOKEN[op]}`}
            onClick={() => commit(replaceAt(tree, path, opWithHoles(op)))}>
            {OP_LABEL[op]}
          </button>
        ))}
        {opts.props && allPropositions(model).map((p) => (
          <button key={p} className="prop-chip"
            onClick={() => commit(replaceAt(tree, path, { kind: 'prop', name: p }))}>
            {p}
          </button>
        ))}
        {opts.consts && ([true, false] as const).map((v) => (
          <button key={String(v)} className="op-btn tok-connective"
            onClick={() => commit(replaceAt(tree, path, { kind: 'const', value: v }))}>
            {String(v)}
          </button>
        ))}
      </span>
    );
  }

  function renderMenu(path: Path): ReactNode {
    // A wrap is legal iff the wrapper op is offered at the wrapped node's own
    // position; only unary ops can wrap (the node becomes the single child).
    const wrapOps = optionsFor(logic, tree, path).ops.filter((op) => ARITY[op] === 1);
    return (
      <span className="builder-popover" ref={(el) => { popRef.current = el; }}>
        <button className="builder-menu-btn" onClick={() => setPopover({ path, kind: 'palette' })}>
          replace…
        </button>
        <span className="builder-menu-wrap">
          <span className="muted">wrap:</span>
          {wrapOps.map((op) => (
            <button key={op} className={`op-btn ${OP_TOKEN[op]}`}
              onClick={() => commit(wrapAt(tree, path, op))}>
              {OP_LABEL[op]}
            </button>
          ))}
        </span>
        <button className="builder-menu-btn" onClick={() => commit(deleteAt(tree, path))}>
          delete to hole
        </button>
      </span>
    );
  }

  function renderNode(node: HNode, path: Path): ReactNode {
    const key = path.join('.');
    const open = popover !== null && popover.path.join('.') === key;
    const pop = open ? (popover!.kind === 'palette' ? renderPalette(path) : renderMenu(path)) : null;

    if (node.kind === 'hole') {
      return (
        <span className="hnode-wrap" key={key}>
          <button className="hnode-hole" onClick={() => setPopover({ path, kind: 'palette' })}>
            {HOLE}
          </button>
          {pop}
        </span>
      );
    }
    if (node.kind === 'prop' || node.kind === 'const') {
      const label = node.kind === 'prop' ? node.name : String(node.value);
      const cls = node.kind === 'prop' ? 'tok-prop' : 'tok-connective';
      return (
        <span className="hnode-wrap" key={key}>
          <button className={`hnode-leaf ${cls}`} onClick={() => setPopover({ path, kind: 'menu' })}>
            {label}
          </button>
          {pop}
        </span>
      );
    }

    const labelBtn = (text: string) => (
      <button className={`hnode-label ${OP_TOKEN[node.op]}`}
        onClick={() => setPopover({ path, kind: 'menu' })}>
        {text}
      </button>
    );
    const kids = node.children.map((c, i) => renderNode(c, [...path, i]));
    let body: ReactNode;
    switch (node.op) {
      case 'and': case 'or': case 'implies': case 'iff': case 'U':
        body = <>{kids[0]}{labelBtn(OP_LABEL[node.op])}{kids[1]}</>;
        break;
      case 'AU': case 'EU':
        body = (
          <>
            {labelBtn(node.op === 'AU' ? 'A[' : 'E[')}
            {kids[0]}
            <span className="hnode-glue tok-temporal">U</span>
            {kids[1]}
            <span className="hnode-glue">]</span>
          </>
        );
        break;
      default: // unary: not, X/F/G, AX…EG, A/E
        body = <>{labelBtn(OP_LABEL[node.op])}{kids[0]}</>;
    }
    return (
      <span className="hnode" key={key}>
        {body}
        {pop}
      </span>
    );
  }

  return (
    <div className="builder-view">
      {seed.failed && <div className="builder-notice">{IMPORT_NOTICE}</div>}
      {renderNode(tree, [])}
    </div>
  );
}
