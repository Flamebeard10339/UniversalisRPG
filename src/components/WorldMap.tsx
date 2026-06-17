import { useMemo } from 'react';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import type { ContentBundle, UniversePlayState } from '../game/types';
import { useNow } from '../hooks/useNow';
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

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;

type Point = {
  x: number;
  y: number;
};

const getNodeCenter = (position: Point): Point => ({
  x: position.x + NODE_WIDTH / 2,
  y: position.y + NODE_HEIGHT / 2,
});

const getRectBoundaryPoint = (from: Point, to: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (dx === 0 && dy === 0) {
    return from;
  }

  const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : NODE_WIDTH / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : NODE_HEIGHT / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: from.x + dx * scale,
    y: from.y + dy * scale,
  };
};

export const WorldMap = ({ bundle, playState, onTravel, t }: WorldMapProps) => {
  const now = useNow(Boolean(playState.activeTravel), 16);
  const mapExtent = useMemo(() => {
    const xs = bundle.locations.map((location) => location.position.x);
    const ys = bundle.locations.map((location) => location.position.y);
    const margin = 420;

    return [
      [Math.min(...xs, 0) - margin, Math.min(...ys, 0) - margin],
      [Math.max(...xs, 0) + margin, Math.max(...ys, 0) + margin],
    ] as [[number, number], [number, number]];
  }, [bundle.locations]);

  const nodes = useMemo<Node[]>(
    () =>
      bundle.locations.map((location) => {
        const isCurrent = location.id === playState.currentLocationId;
        const isDiscovered = playState.discoveredLocationIds.includes(location.id);
        const isDestination = location.id === playState.activeTravel?.toLocationId;

        return {
          id: location.id,
          position: location.position,
          data: {
            label: (
              <button
                className={`grid h-14 w-40 cursor-pointer place-items-center rounded border px-3 text-center transition ${
                  isCurrent
                    ? 'border-cyan-300 bg-cyan-950 text-cyan-50 shadow-lg shadow-cyan-950/50'
                    : isDestination
                      ? 'border-amber-300 bg-amber-950 text-amber-50'
                      : 'border-slate-600 bg-slate-900 text-slate-100 hover:border-cyan-500'
                } ${isDiscovered ? '' : 'opacity-70'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTravel(location.id);
                }}
                type="button"
              >
                <span className="text-sm font-semibold">{t(location.titleKey)}</span>
              </button>
            ),
          },
          draggable: false,
          style: {
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            height: NODE_HEIGHT,
            padding: 0,
            width: NODE_WIDTH,
          },
        };
      }),
    [bundle.locations, onTravel, playState.activeTravel?.toLocationId, playState.currentLocationId, playState.discoveredLocationIds, t],
  );

  const edges = useMemo<Edge[]>(
    () =>
      bundle.edges.map((edge) => {
        const sourceLocation = bundle.locations.find((location) => location.id === edge.source);
        const targetLocation = bundle.locations.find((location) => location.id === edge.target);
        const sourceCenter = getNodeCenter(sourceLocation?.position ?? { x: 0, y: 0 });
        const targetCenter = getNodeCenter(targetLocation?.position ?? { x: 0, y: 0 });
        const active = playState.activeTravel?.edgeId === edge.id;
        const reverse =
          active &&
          playState.activeTravel?.fromLocationId === edge.target &&
          playState.activeTravel.toLocationId === edge.source;
        const rawProgress =
          active && playState.activeTravel
            ? Math.min(
                1,
                Math.max(
                  0,
                  (now - playState.activeTravel.startedAt) /
                    (playState.activeTravel.completesAt - playState.activeTravel.startedAt),
                ),
              )
            : 0;
        const progress = reverse ? 1 - rawProgress : rawProgress;

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'travel',
          animated: false,
          data: {
            active,
            progress,
            sourcePoint: getRectBoundaryPoint(sourceCenter, targetCenter),
            targetPoint: getRectBoundaryPoint(targetCenter, sourceCenter),
          },
        };
      }),
    [bundle.edges, bundle.locations, now, playState.activeTravel],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      edgeTypes={edgeTypes}
      fitView
      maxZoom={1.35}
      minZoom={0.45}
      nodeExtent={mapExtent}
      nodesDraggable={false}
      nodesConnectable={false}
      onNodeClick={(_, node) => onTravel(node.id)}
      panOnDrag
      panOnScroll
      proOptions={{ hideAttribution: true }}
      translateExtent={mapExtent}
    >
      <Background color="#334155" gap={24} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
};
