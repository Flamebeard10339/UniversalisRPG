import { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import type { ContentBundle, UniversePlayState } from '../game/types';
import { TravelEdge } from './TravelEdge';

type WorldMapProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  onTravel: (locationId: string) => void;
  t: (key: string, fallback?: string) => string;
};

const edgeTypes = {
  travel: TravelEdge,
};

export const WorldMap = ({ bundle, playState, onTravel, t }: WorldMapProps) => {
  const nodes = useMemo<Node[]>(
    () =>
      bundle.locations.map((location) => {
        const isCurrent = location.id === playState.currentLocationId;
        const isDiscovered = playState.discoveredLocationIds.includes(location.id);

        return {
          id: location.id,
          position: location.position,
          data: {
            label: (
              <button
                className={`grid min-h-20 w-44 gap-1 rounded border px-3 py-2 text-left transition ${
                  isCurrent
                    ? 'border-cyan-300 bg-cyan-950 text-cyan-50 shadow-lg shadow-cyan-950/50'
                    : 'border-slate-600 bg-slate-900 text-slate-100 hover:border-cyan-500'
                } ${isDiscovered ? '' : 'opacity-70'}`}
                onClick={() => onTravel(location.id)}
                type="button"
              >
                <span className="text-sm font-semibold">{t(location.titleKey)}</span>
                <span className="line-clamp-2 text-xs text-slate-300">{t(location.descriptionKey)}</span>
              </button>
            ),
          },
          draggable: false,
        };
      }),
    [bundle.locations, onTravel, playState.currentLocationId, playState.discoveredLocationIds, t],
  );

  const edges = useMemo<Edge[]>(
    () =>
      bundle.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'travel',
        animated: false,
        data: {
          label: `${edge.travelTimeSeconds}s`,
        },
      })),
    [bundle.edges],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      edgeTypes={edgeTypes}
      fitView
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#334155" gap={24} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};
