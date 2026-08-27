import { useEffect, useMemo, useRef, useState } from 'react';
import type { Answer } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import { DragSheet, useSheetHold } from './DragSheet';
import { signed, tidy } from './format';
import { arrivalDelay, newlyDrawn, NODE_SIZE, planeGraph, type GraphEdge, type GraphNode, type Plane, type PlaneGraph, type Standing } from './planeGraph';
import { Modal, ModalCard } from './Modal';
import type { Declared } from './modalManner';
import { nameOf, panelFor } from './planePanel';
import { NAME } from './sheetLayout';
import { useTestSurface } from './useTestSurface';
import { playedAfter, useMoment } from './transient';
import { panOnto, tapTarget } from './viewport';
import type { Words } from './words';

type Option = PlayView['modals'][number]['options'][number];
type Choice = NonNullable<Option['values']>[number];
type Payload = GraphNode['payloads'][number];
type Contribution = Plane['contributions'][number];

// The jewel picker belongs to the lattice it is picking for, so it stays inside it rather than
// taking the app: the node the player just pressed is still there to look at behind it.
const PICKER: Declared = { over: 'pane' };

const RING: Record<Standing, string> = {
  allocated: 'border-accent bg-accent-strong text-accent-text',
  available: 'border-accent bg-panel text-accent',
  unreached: 'border-border bg-panel text-text-subtle',
  blocked: 'border-border bg-surface text-text-subtle opacity-60',
};

function magnitude(bonus: Payload['effective']): string {
  if (bonus.percent) return `${signed(bonus.amount)}%`;
  const { min, max } = bonus.amount;
  return min === max ? signed(min) : `${signed(min)}-${tidy(Math.abs(max))}`;
}

function Paid({ payloads }: { payloads: readonly Payload[] }): JSX.Element | null {
  if (payloads.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {payloads.map((payload) => (
        <li key={payload.statId} className="flex items-baseline gap-1 text-sm">
          <span className="tabular-nums text-accent">{magnitude(payload.effective)}</span>
          <span>{payload.statTitle}</span>
          {payload.scale === 1 ? null : <span className="tabular-nums text-text-subtle">×{tidy(payload.scale)}</span>}
          {payload.perTitle == null ? null : <span className="text-text-subtle">per {payload.perTitle}</span>}
        </li>
      ))}
    </ul>
  );
}

function Fold({ contributions }: { contributions: readonly Contribution[] }): JSX.Element {
  return (
    <ul className="mt-2 flex flex-col gap-0.5">
      {contributions.map((each) => (
        <li key={each.statId} className="flex items-baseline gap-1 text-sm">
          <span className="tabular-nums text-accent">
            {each.added.min === each.added.max ? signed(each.added.min) : `${signed(each.added.min)}-${tidy(each.added.max)}`}
            {each.increased === 0 ? '' : ` ${signed(each.increased)}%`}
          </span>
          <span>{each.statTitle}</span>
        </li>
      ))}
    </ul>
  );
}

function Points({ remaining, denied, words }: { remaining: number; denied: boolean; words: Words }): JSX.Element {
  const refused = useMoment('deny', denied);

  return (
    <div className={`flex items-baseline gap-1 rounded px-1 ${refused}`}>
      <dt className="text-xs uppercase tracking-wide text-text-subtle">{words('points')}</dt>
      <dd className="text-sm tabular-nums">{tidy(remaining)}</dd>
    </div>
  );
}

function Node({
  node,
  scale,
  arrived,
  delay,
  chosen,
  held,
  onPress,
  dragged,
}: {
  node: GraphNode;
  scale: number;
  arrived: boolean;
  delay: number;
  chosen: boolean;
  held: (element: HTMLButtonElement | null) => void;
  onPress: (node: GraphNode) => void;
  dragged: () => boolean;
}): JSX.Element {
  const sprout = useMoment('sprout', arrived, node.key);

  return (
    <button
      ref={held}
      data-drive="plane.press"
      type="button"
      data-node={node.key}
      data-standing={node.standing}
      data-socket={node.socket ? 'yes' : undefined}
      data-chosen={chosen ? 'yes' : undefined}
      onClick={() => void (dragged() || onPress(node))}
      style={{ left: node.at.x, top: node.at.y, width: NODE_SIZE, height: NODE_SIZE, ...(arrived ? playedAfter(delay) : {}) }}
      className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border p-0 text-[10px] font-semibold ${sprout} ${RING[node.standing]} ${
        node.socket ? 'rotate-45' : 'rounded-full'
      } ${chosen ? 'ring-2 ring-accent-strong' : ''}`}
    >
      <span data-tap-target className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: tapTarget(scale), height: tapTarget(scale) }} />
      <span className={node.socket ? '-rotate-45' : ''}>{node.socket ? '' : node.position}</span>
    </button>
  );
}

function Line({ edge, arrived, delay }: { edge: GraphEdge; arrived: boolean; delay: number }): JSX.Element {
  const sprout = useMoment('sprout', arrived, edge.key);

  return (
    <line
      x1={edge.from.x}
      y1={edge.from.y}
      x2={edge.to.x}
      y2={edge.to.y}
      style={arrived ? playedAfter(delay) : undefined}
      className={`${sprout} ${edge.live ? 'stroke-accent' : 'stroke-text-subtle'}`}
      strokeWidth={edge.live ? 5 : 3}
      strokeLinecap="round"
    />
  );
}

function useSprouts(graph: PlaneGraph): { nodes: ReadonlySet<Answer>; edges: ReadonlySet<string>; generation: number } {
  const seen = useRef<PlaneGraph | null>(graph);
  const [sprouted, setSprouted] = useState({ nodes: new Set<Answer>(), edges: new Set<string>(), generation: 0 });
  const shape = `${graph.nodes.map((node) => node.key).join('|')}#${graph.edges.map((edge) => edge.key).join('|')}`;

  useEffect(() => {
    const fresh = newlyDrawn(seen.current, graph);
    seen.current = graph;
    if (fresh.nodes.length + fresh.edges.length === 0) return;
    setSprouted((held) => ({ nodes: new Set(fresh.nodes), edges: new Set(fresh.edges), generation: held.generation + 1 }));
  }, [shape]);

  return sprouted;
}

export function PlaneModal({
  plane,
  option,
  manner,
  words,
  onAnswer,
}: {
  plane: Plane;
  option: Option;
  manner: Declared;
  words: Words;
  onAnswer: (key: string, value: string) => void;
}): JSX.Element {
  const buttons = useRef<Array<HTMLElement | null>>([]);
  const [chosen, setChosen] = useState<Answer | null>(null);
  const [picking, setPicking] = useState(false);
  const [denied, setDenied] = useState(0);
  const dispatched = useRef<number | null>(null);
  const graph = useMemo(() => planeGraph(plane), [plane]);
  const sprouted = useSprouts(graph);
  const hold = useSheetHold(graph.points, buttons, String(graph.nodes.length));

  const choices: readonly Choice[] = option.values ?? [];
  const panel = panelFor(graph, chosen, choices);
  const { node, acts: acting, jewels, leaves: leaving } = panel;

  const press = (pressed: GraphNode): void => {
    setChosen(pressed.key);
    setPicking(false);
    const walk = panelFor(graph, pressed.key, choices).walks;
    if (walk) onAnswer(option.key, walk.value);
  };

  const grow = (value: Answer): void => {
    dispatched.current = plane.spent;
    onAnswer(option.key, value);
  };

  const opened = useRef(false);
  useEffect(() => {
    const root = graph.nodes.find((each) => each.standing === 'allocated') ?? graph.nodes[0];
    if (opened.current || !root) return;
    opened.current = true;
    hold.settle(panOnto(root.at, 1), 1);
  }, [graph]);

  useEffect(() => {
    const was = dispatched.current;
    dispatched.current = null;
    if (was !== null && plane.spent === was) setDenied((held) => held + 1);
  }, [plane]);

  useTestSurface('plane', { plane, graph, chosen, picking, controls: { press: (key) => press(graph.nodes.find((each) => each.key === key)!), pick: setPicking, settle: hold.settle } });

  const name = nameOf(panel, words);
  const leave = leaving === null ? undefined : () => onAnswer(option.key, leaving.value);

  return (
    <Modal manner={manner} subject={plane.instance} onDismiss={leave}>
      <div className="unbarred flex min-h-0 basis-[30%] flex-col overflow-y-auto border-b border-border bg-surface-raised px-4 py-2">
        <div className="mx-auto flex w-full max-w-2xl flex-col">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`min-w-0 text-base font-semibold ${NAME}`}>{plane.name}</p>
            {leaving === null ? null : (
              <button
                data-drive="answer"
                type="button"
                onClick={leave}
                className="shrink-0 rounded-xl border border-border bg-panel px-3 text-xs text-text-subtle transition-transform duration-75 active:scale-[0.97] active:text-accent"
              >
                {leaving.shown}
              </button>
            )}
          </div>
          <dl className="flex flex-wrap gap-x-4">
            <div className="flex items-baseline gap-1">
              <dt className="text-xs uppercase tracking-wide text-text-subtle">{words('level')}</dt>
              <dd className="text-sm tabular-nums">{tidy(plane.level)}</dd>
            </div>
            <Points key={denied} remaining={plane.remaining} denied={denied > 0} words={words} />
          </dl>
          <hr className="my-2 border-border" />
          {node === null ? (
            <Fold contributions={plane.contributions} />
          ) : (
            <>
              <p className="text-sm font-semibold">{name}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-text-subtle">{words(panel.standing!)}</p>
              <Paid payloads={node.payloads} />
              {node.holds === null ? null : <p className="mt-1 text-sm">{node.holds}</p>}
              {acting === null ? null : (
                <button
                  data-drive="answer"
                  type="button"
                  onClick={() => grow(acting.value)}
                  className="mt-3 self-start rounded-xl border border-accent bg-panel px-4 text-sm font-semibold text-accent transition-transform duration-75 active:scale-[0.98] active:bg-accent-strong active:text-accent-text"
                >
                  {words(panel.actsAs!)}
                </button>
              )}
              {jewels.length === 0 ? null : (
                <button
                  data-drive="plane.pick"
                  type="button"
                  onClick={() => setPicking(true)}
                  className="mt-3 self-start rounded-xl border border-accent bg-panel px-4 text-sm font-semibold text-accent transition-transform duration-75 active:scale-[0.98] active:bg-accent-strong active:text-accent-text"
                >
                  {words('insert')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <DragSheet hold={hold} onGround={() => void (setChosen(null), setPicking(false))}>
        <svg className="pointer-events-none absolute overflow-visible" width={1} height={1}>
          {graph.edges.map((edge, at) => (
            <Line key={`${edge.key}-${sprouted.edges.has(edge.key) ? sprouted.generation : 0}`} edge={edge} arrived={sprouted.edges.has(edge.key)} delay={arrivalDelay(at)} />
          ))}
        </svg>
        {graph.nodes.map((each, at) => (
          <Node
            key={`${each.key}-${sprouted.nodes.has(each.key) ? sprouted.generation : 0}`}
            node={each}
            scale={hold.zoom}
            arrived={sprouted.nodes.has(each.key)}
            delay={arrivalDelay(at)}
            chosen={each.key === chosen}
            held={(element) => void (buttons.current[at] = element)}
            onPress={press}
            dragged={hold.dragged}
          />
        ))}
      </DragSheet>

      {picking && node !== null ? (
        <Modal manner={PICKER} subject={node.key} onDismiss={() => setPicking(false)}>
          <ModalCard subject={node.key} title={words('insert')}>
            <div className="unbarred flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {jewels.map((choice) => (
                <button
                  key={choice.value}
                  data-drive="answer"
                  type="button"
                  onClick={() => void (setPicking(false), grow(choice.value))}
                  className="w-full rounded-xl border border-border bg-panel px-4 py-2 text-left transition-transform duration-75 active:scale-[0.99] active:bg-accent-strong active:text-accent-text"
                >
                  {choice.subject}
                </button>
              ))}
            </div>
          </ModalCard>
        </Modal>
      ) : null}
    </Modal>
  );
}
