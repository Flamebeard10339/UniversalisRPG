import type { Answer, Localized } from '../runtime/localized';
import type { PlayView } from '../runtime/session';
import type { LabelId } from './labels';
import type { GraphNode, PlaneGraph, Standing } from './planeGraph';

// What the panel above the plane says, decided apart from how it is drawn. Every
// act it offers is a value the engine published, found by what that value says
// it acts on — so this file joins a node to a move and never spells one.

type Option = PlayView['modals'][number]['options'][number];
export type Choice = NonNullable<Option['values']>[number];

// What a standing is worth to a player holding points, rather than what the
// plane calls it: where the next point may go, where one has already gone, and
// the two ways a node is out of reach.
export const STANDING: Record<Standing, LabelId> = {
  allocated: 'spent',
  available: 'ready',
  unreached: 'locked',
  blocked: 'dead',
};

export interface PanelView {
  // The node the panel is about, or null when it is about the copy itself —
  // which is what the plane says when nothing on it is pressed.
  node: GraphNode | null;
  // How to name the node where the jewel gave it no name of its own: a socket
  // is a socket, and a position the jewel left blank is its number.
  called: LabelId | null;
  standing: LabelId | null;
  // The one move onto this node, where the engine published one: the move that
  // acts on it and brings nothing.
  acts: Choice | null;
  // What a socket will take, each named by the copy it brings.
  jewels: readonly Choice[];
  // What the copy itself can be fed, which is the one growth that is the copy's
  // rather than one node of it.
  feeds: readonly Choice[];
  // The way out: the one published value that neither acts on a node nor brings
  // anything to one.
  leaves: Choice | null;
  // The cluster the pressed node stands in, where pressing it has to go there
  // first because the screen publishes nothing about a cluster it is not on.
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

// The name the panel puts at the top, given whatever the node was published
// under and the shell's own word for the two things a jewel leaves unnamed.
export function nameOf(panel: PanelView, words: (id: LabelId, params?: Record<string, Localized | number>) => Localized): Localized | null {
  if (panel.node === null) return null;
  if (panel.called === null) return panel.node.title;
  return panel.called === 'socket' ? words('socket') : words('position', { position: panel.node.position });
}
