import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import type { LabelId } from './labels';
import type { GraphNode, PlaneGraph, Standing } from './planeGraph';

type Option = PlayView['modals'][number]['options'][number];
export type Choice = NonNullable<Option['values']>[number];

export const STANDING: Record<Standing, LabelId> = {
  allocated: 'spent',
  available: 'ready',
  unreached: 'locked',
  blocked: 'dead',
};

export interface PanelView {
  node: GraphNode | null;
  called: LabelId | null;
  standing: LabelId | null;
  acts: Choice | null;
  jewels: readonly Choice[];
  feeds: readonly Choice[];
  leaves: Choice | null;
  walks: Choice | null;
}

const actsOn = (choice: Choice, key: Answer | undefined): boolean => choice.on === key && key !== undefined;

export function panelFor(graph: PlaneGraph, chosen: Answer | null, choices: readonly Choice[]): PanelView {
  const node = graph.nodes.find((each) => each.key === chosen) ?? null;

  return {
    node,
    called: node === null ? null : node.socket ? 'socket' : node.title === null ? 'position' : null,
    standing: node === null ? null : node.free ? 'free' : STANDING[node.standing],
    acts: choices.find((choice) => actsOn(choice, node?.key) && choice.subject === undefined) ?? null,
    jewels: choices.filter((choice) => actsOn(choice, node?.key) && choice.subject !== undefined),
    feeds: choices.filter((choice) => choice.on === undefined && choice.subject !== undefined),
    leaves: choices.find((choice) => choice.on === undefined && choice.subject === undefined) ?? null,
    walks: choices.find((choice) => actsOn(choice, node?.hex)) ?? null,
  };
}

export function nameOf(panel: PanelView, words: (id: LabelId, params?: Record<string, Localized | number>) => Localized): Localized | null {
  if (panel.node === null) return null;
  if (panel.called === null) return panel.node.title;
  return panel.called === 'socket' ? words('socket') : words('position', { position: panel.node.position });
}
