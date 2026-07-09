import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactFlow, { Background, Controls, Handle, Position, type Edge, type Node, type NodeProps } from 'reactflow';
import type { ContentBundle, UniversePlayState } from '../game/types';
import { locationTitleKey } from '../game/contentIds';
import { useNow } from '../hooks/useNow';
import { getVisibleTravelGraph } from '../game/travel';
import { TravelEdge } from './TravelEdge';

const locationZ = (location: { position: { x: number; y: number; z?: number } }) => location.position.z ?? 0;

type WorldMapProps = {
  bundle: ContentBundle;
  playState: UniversePlayState;
  onTravel: (locationId: string) => void;
  t: (key: string, fallback?: string) => string;
};

const edgeTypes = {
  travel: TravelEdge,
};

type LocationNodeData = { label: ReactNode };

// Edges route via manually computed data.sourcePoint/targetPoint (see
// getRectBoundaryPoint below), not React Flow's own handle geometry — but a
// source/target Handle must still exist on the node or React Flow can't
// resolve handle bounds for it and silently skips rendering every edge that
// touches it, even though the edges prop itself has perfectly valid data
// (mirrors ContributionMapEditor.tsx's identical node type/comment).
// `display: 'block'` overrides this app's global `.react-flow__handle {
// display: none}` (index.css) — without it the handle isn't just invisible,
// it's removed from layout entirely and unmeasurable, which is the actual
// bug; `visibility: 'hidden'` alone keeps it invisible without that problem.
const locationNodeTypes = {
  location: ({ data }: NodeProps<LocationNodeData>) => (
    <>
      <Handle position={Position.Left} style={{ display: 'block', visibility: 'hidden' }} type="target" />
      {data.label}
      <Handle position={Position.Right} style={{ display: 'block', visibility: 'hidden' }} type="source" />
    </>
  ),
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
// Locations are now a grid of small integer cells (see travel.ts); scale each
// cell up to a comfortable pixel spacing for the ReactFlow canvas.
const GRID_CELL_PIXELS = 220;

type Point = {
  x: number;
  y: number;
};

const toPixelPosition = (position: Point): Point => ({
  x: position.x * GRID_CELL_PIXELS,
  y: position.y * GRID_CELL_PIXELS,
});

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
  const actionContext = useMemo(() => ({
    manifest: bundle.manifest,
    actions: bundle.actions,
    skills: bundle.skills,
    stats: bundle.stats,
    locations: bundle.locations,
    entities: bundle.entities,
    items: bundle.items,
    flags: bundle.flags,
    resourceDefinitions: bundle.resourceDefinitions,
    effects: bundle.effects,
    interactionTypes: bundle.interactionTypes,
    enemies: bundle.enemies,
    dropTables: bundle.dropTables,
    dialogues: bundle.dialogues,
  }), [bundle]);
  const currentLocation = bundle.locations.find((location) => location.id === playState.currentLocationId);
  const currentZ = locationZ(currentLocation ?? { position: { x: 0, y: 0 } });
  const [zLayer, setZLayer] = useState(currentZ);
  // Follow the player to whichever layer they actually travel to, so the map
  // doesn't keep showing a stale layer after arriving somewhere new — the
  // dropdown is for peeking at an already-discovered layer, not a fixed view.
  useEffect(() => setZLayer(currentZ), [currentZ]);
  const discoveredZLayers = useMemo(
    () => Array.from(new Set(
      bundle.locations
        .filter((location) => playState.discoveredLocationIds.includes(location.id))
        .map(locationZ),
    )).sort((a, b) => a - b),
    [bundle.locations, playState.discoveredLocationIds],
  );
  const visibleGraph = useMemo(
    () => getVisibleTravelGraph(bundle, playState, actionContext, zLayer),
    [actionContext, bundle, playState, zLayer],
  );
  const mapExtent = useMemo(() => {
    const xs = visibleGraph.locations.map((location) => toPixelPosition(location.position).x);
    const ys = visibleGraph.locations.map((location) => toPixelPosition(location.position).y);
    const margin = 420;

    return [
      [Math.min(...xs, 0) - margin, Math.min(...ys, 0) - margin],
      [Math.max(...xs, 0) + margin, Math.max(...ys, 0) + margin],
    ] as [[number, number], [number, number]];
  }, [visibleGraph.locations]);

  const nodes = useMemo<Node[]>(
    () =>
      visibleGraph.locations.map((location) => {
        const isCurrent = location.id === playState.currentLocationId;
        const isDiscovered = playState.discoveredLocationIds.includes(location.id);
        const activePath = playState.activeTravel?.pathLocationIds ?? [];
        const isCurrentSegmentTarget = location.id === playState.activeTravel?.toLocationId;
        const isDestination = location.id === playState.activeTravel?.finalLocationId;
        const isIntermediate = activePath.includes(location.id) && !isCurrent && !isDestination && !isCurrentSegmentTarget;

        return {
          id: location.id,
          type: 'location',
          position: toPixelPosition(location.position),
          data: {
            label: (
              <button
                className={`grid h-14 w-40 cursor-pointer place-items-center rounded border px-3 text-center transition ${
                  isCurrent
                    ? 'border-cyan-300 bg-cyan-950 text-cyan-50 shadow-lg shadow-cyan-950/50'
                    : isCurrentSegmentTarget
                      ? 'border-amber-300 bg-amber-950 text-amber-50'
                      : isDestination
                        ? 'border-fuchsia-300 bg-fuchsia-950 text-fuchsia-50'
                        : isIntermediate
                          ? 'border-teal-300 bg-teal-950 text-teal-50'
                      : 'border-slate-600 bg-slate-900 text-slate-100 hover:border-cyan-500'
                } ${isDiscovered ? '' : 'opacity-70'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onTravel(location.id);
                }}
                type="button"
              >
                <span className="text-sm font-semibold">
                  {isDiscovered ? t(locationTitleKey(location.id), location.id) : t('map.undiscoveredLocation', '???')}
                </span>
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
    [onTravel, playState.activeTravel, playState.currentLocationId, playState.discoveredLocationIds, t, visibleGraph.locations],
  );

  const edges = useMemo<Edge[]>(
    () =>
      visibleGraph.edges.map((edge) => {
        const sourceLocation = visibleGraph.locations.find((location) => location.id === edge.source);
        const targetLocation = visibleGraph.locations.find((location) => location.id === edge.target);
        const sourceCenter = getNodeCenter(toPixelPosition(sourceLocation?.position ?? { x: 0, y: 0 }));
        const targetCenter = getNodeCenter(toPixelPosition(targetLocation?.position ?? { x: 0, y: 0 }));
        const active = playState.activeTravel?.actionId === edge.action.id;
        const pathIndex = playState.activeTravel?.pathActionIds.indexOf(edge.action.id) ?? -1;
        const inPath = pathIndex >= 0;
        const isCompletePathSegment = Boolean(playState.activeTravel && inPath && pathIndex < playState.activeTravel.pathIndex);
        const isFuturePathSegment = Boolean(playState.activeTravel && inPath && pathIndex > playState.activeTravel.pathIndex);
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

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'travel',
          animated: false,
          data: {
            active,
            inPath,
            isCompletePathSegment,
            isFuturePathSegment,
            progress: rawProgress,
            sourcePoint: getRectBoundaryPoint(sourceCenter, targetCenter),
            targetPoint: getRectBoundaryPoint(targetCenter, sourceCenter),
          },
        };
      }),
    [now, playState.activeTravel, visibleGraph.edges, visibleGraph.locations],
  );

  return (
    <div className="relative h-full w-full">
      {discoveredZLayers.length > 1 && (
        <label className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300">
          {t('map.zLayer', 'Layer')}
          <select
            className="rounded bg-slate-950 px-2 py-1 text-sm text-slate-100"
            data-testid="map-z-layer-select"
            onChange={(event) => setZLayer(Number(event.target.value))}
            value={zLayer}
          >
            {discoveredZLayers.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        edgeTypes={edgeTypes}
        fitView
        maxZoom={1.35}
        minZoom={0.45}
        nodeExtent={mapExtent}
        nodeTypes={locationNodeTypes}
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
    </div>
  );
};
