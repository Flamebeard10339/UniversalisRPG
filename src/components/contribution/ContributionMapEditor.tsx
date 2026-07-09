import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import { toKebabInput } from '../../game/contentIds';
import { getPureTravelDestination, travelEdgeId } from '../../game/travel';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, EntityDefinition, GameAction, LocationNode } from '../../game/types';
import { StructuredDataEditor, type StructuredValue } from '../structuredData/StructuredData';
import { actionSchema, locationSchema } from '../structuredData/contentSchemas';
import { locationLocalePatch, travelActionLocalePatch } from './contributionLocalization';

type ContributionMapEditorProps = {
  bundle: ContentBundle;
  onEntitiesChange: (entities: EntityDefinition[]) => void;
  onActionsChange: (actions: GameAction[]) => void;
  onLocationsChange: (locations: LocationNode[]) => void;
  onLocalesChange: (patch: Record<string, string>) => void;
  t: Translator;
};

type SimpleNodeData = {
  label: string;
  selected: boolean;
};

type TravelEdgeData = {
  actionId: string;
  selected: boolean;
  sourcePoint: { x: number; y: number };
  targetPoint: { x: number; y: number };
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 60;

const snap = (value: number, size: number) => Math.round(value / size) * size;

const uniqueId = (base: string, existingIds: Set<string>) => {
  let id = base;
  let index = 2;
  while (existingIds.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
};

const getNodeCenter = (position: { x: number; y: number }) => ({
  x: position.x + NODE_WIDTH / 2,
  y: position.y + NODE_HEIGHT / 2,
});

const getRectBoundaryPoint = (from: { x: number; y: number }, to: { x: number; y: number }) => {
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

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const upsertById = <T extends { id: string }>(items: T[], item: T) =>
  items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item];

const removeById = <T extends { id: string }>(items: T[], id: string) => items.filter((item) => item.id !== id);
const uniqueStrings = (items: string[]) => Array.from(new Set(items));

const createTravelAction = (bundle: ContentBundle, sourceId: string, targetId: string): GameAction => {
  const baseId = toKebabInput(`travel-${sourceId}-to-${targetId}`);
  const id = uniqueId(baseId, new Set(bundle.actions.map((action) => action.id)));

  return {
    id,
    locationId: sourceId,
    role: 'travel',
    durationSeconds: 10,
    rewards: [],
    results: [{ kind: 'relocate', locationId: targetId }],
  };
};

const createEntity = (id: string): EntityDefinition => ({
  id,
  actionIds: [],
});

const locationNodeTypes = {
  simple: ({ data }: NodeProps<SimpleNodeData>) => (
    <div
      className={`grid h-[60px] w-[176px] place-items-center rounded border px-3 text-center shadow transition ${
        data.selected
          ? 'border-cyan-300 bg-cyan-950 text-cyan-50 shadow-cyan-950/40'
          : 'border-slate-600 bg-slate-900 text-slate-100 hover:border-cyan-500'
      }`}
    >
      {/* Travel edges route via manually computed data.sourcePoint/targetPoint, not React Flow's handle
          geometry, but a source/target Handle must still exist or React Flow can't resolve handle bounds
          for this node and warns (and re-renders) continuously for every edge that touches it. */}
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      <span className="text-sm font-semibold">{data.label}</span>
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </div>
  ),
};

const travelEdgeTypes = {
  travel: ({ id, data }: EdgeProps<TravelEdgeData>) => {
    const sourcePoint = data?.sourcePoint ?? { x: 0, y: 0 };
    const targetPoint = data?.targetPoint ?? { x: 0, y: 0 };
    const stroke = data?.selected ? '#67e8f9' : '#64748b';
    const strokeWidth = data?.selected ? 3 : 2;

    return (
      <>
        <path
          d={`M ${sourcePoint.x},${sourcePoint.y} L ${targetPoint.x},${targetPoint.y}`}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <circle cx={targetPoint.x} cy={targetPoint.y} r="4" fill={stroke} />
      </>
    );
  },
};

const locationZ = (location: LocationNode) => location.position.z ?? 0;

export const ContributionMapEditor = ({ bundle, onEntitiesChange, onActionsChange, onLocationsChange, onLocalesChange, t }: ContributionMapEditorProps) => {
  const [snapSize, setSnapSize] = useState(8);
  const [editMode, setEditMode] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [edgeSourceId, setEdgeSourceId] = useState<string | null>(null);
  const [pendingLocation, setPendingLocation] = useState<{ id: string; point: { x: number; y: number }; travelFromCurrent: boolean; travelToCurrent: boolean } | null>(null);
  const [createEntityToLocation, setCreateEntityToLocation] = useState(true);
  const [newEntityId, setNewEntityId] = useState('');
  const [zLayer, setZLayer] = useState(() => {
    const starting = bundle.locations.find((location) => location.starting);
    return starting ? locationZ(starting) : 0;
  });
  const zLayerOptions = useMemo(
    () => Array.from(new Set([0, ...bundle.locations.map(locationZ)])).sort((a, b) => a - b),
    [bundle.locations],
  );
  const visibleLocations = useMemo(() => bundle.locations.filter((location) => locationZ(location) === zLayer), [bundle.locations, zLayer]);
  const [locationNodes, setLocationNodes] = useState<Node<SimpleNodeData>[]>(() =>
    visibleLocations.map((location) => ({
      id: location.id,
      type: 'simple',
      position: location.position,
      data: {
        label: location.id,
        selected: false,
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
    })),
  );

  useEffect(() => {
    setLocationNodes(
      visibleLocations.map((location) => ({
        id: location.id,
        type: 'simple',
        position: location.position,
        data: {
          label: location.id,
          selected: location.id === selectedLocationId,
        },
        draggable: editMode,
        style: {
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          height: NODE_HEIGHT,
          padding: 0,
          width: NODE_WIDTH,
        },
      })),
    );
  }, [visibleLocations, editMode, selectedLocationId]);

  const normalizedSnapSize = Math.max(1, Math.round(snapSize) || 1);
  const snapGrid = useMemo<[number, number]>(() => [normalizedSnapSize, normalizedSnapSize], [normalizedSnapSize]);
  const selectedLocation = selectedLocationId ? bundle.locations.find((location) => location.id === selectedLocationId) : undefined;
  const selectedAction = selectedActionId ? bundle.actions.find((action) => action.id === selectedActionId) : undefined;
  const travelEdges = useMemo<Edge<TravelEdgeData>[]>(() => {
    const locationsById = new Map(visibleLocations.map((location) => [location.id, location]));

    return bundle.actions.flatMap((action) => {
      const targetId = getPureTravelDestination(action);
      if (!targetId || !action.locationId) {
        return [];
      }

      const sourceLocation = locationsById.get(action.locationId);
      const targetLocation = locationsById.get(targetId);
      if (!sourceLocation || !targetLocation) {
        return [];
      }

      const sourceCenter = getNodeCenter(sourceLocation.position);
      const targetCenter = getNodeCenter(targetLocation.position);

      return [{
        id: travelEdgeId(action),
        source: action.locationId,
        target: targetId,
        type: 'travel',
        data: {
          actionId: action.id,
          selected: selectedActionId === action.id,
          sourcePoint: getRectBoundaryPoint(sourceCenter, targetCenter),
          targetPoint: getRectBoundaryPoint(targetCenter, sourceCenter),
        },
      }];
    });
  }, [bundle.actions, visibleLocations, selectedActionId]);

  const updateLocation = (patch: Partial<LocationNode>) => {
    if (!selectedLocation) {
      return;
    }

    onLocationsChange(upsertById(bundle.locations, { ...selectedLocation, ...patch }));
    if (patch.position && patch.position.z !== undefined && patch.position.z !== zLayer) setZLayer(patch.position.z);
  };

  const updateSelectedLocationZ = (z: number) => {
    if (!selectedLocation) return;
    updateLocation({ position: { ...selectedLocation.position, z } });
  };

  const removeSelectedLocation = () => {
    if (!selectedLocation) {
      return;
    }

    onLocationsChange(removeById(bundle.locations, selectedLocation.id));
    setSelectedLocationId(null);
    if (edgeSourceId === selectedLocation.id) {
      setEdgeSourceId(null);
    }
  };

  const commitNodePosition = (node: Node) => {
    const location = bundle.locations.find((candidate) => candidate.id === node.id);
    if (!location) {
      return;
    }

    onLocationsChange(
      upsertById(bundle.locations, {
        ...location,
        position: {
          ...location.position,
          x: snap(node.position.x, normalizedSnapSize),
          y: snap(node.position.y, normalizedSnapSize),
        },
      }),
    );
  };

  const queueLocationAtPoint = (point: { x: number; y: number }) => {
    const x = snap(point.x, normalizedSnapSize);
    const y = snap(point.y, normalizedSnapSize);
    const id = uniqueId(
      toKebabInput(`location-${Math.round(x)}-${Math.round(y)}`),
      new Set(bundle.locations.map((location) => location.id)),
    );
    setPendingLocation({ id, point: { x, y }, travelFromCurrent: false, travelToCurrent: false });
    setSelectedLocationId(null);
    setSelectedActionId(null);
    setEdgeSourceId(null);
  };

  const commitPendingLocation = () => {
    if (!pendingLocation) {
      return;
    }

    const location: LocationNode = {
      id: pendingLocation.id,
      position: zLayer !== 0 ? { ...pendingLocation.point, z: zLayer } : pendingLocation.point,
      tags: [],
    };
    const nextLocations = [...bundle.locations, location];
    const selected = selectedLocation;
    const nextActions = [...bundle.actions];
    const nextLocalePatch: Record<string, string> = {
      ...locationLocalePatch(pendingLocation.id, t),
    };

    if (selected) {
      if (pendingLocation.travelFromCurrent) {
        const action = createTravelAction({ ...bundle, locations: nextLocations, actions: nextActions }, selected.id, pendingLocation.id);
        nextActions.push(action);
        Object.assign(nextLocalePatch, travelActionLocalePatch(action.id, t));
      }
      if (pendingLocation.travelToCurrent) {
        const action = createTravelAction({ ...bundle, locations: nextLocations, actions: nextActions }, pendingLocation.id, selected.id);
        nextActions.push(action);
        Object.assign(nextLocalePatch, travelActionLocalePatch(action.id, t));
      }
    }

    onLocationsChange(nextLocations);
    onActionsChange(nextActions);
    onLocalesChange(nextLocalePatch);
    setSelectedLocationId(pendingLocation.id);
    setPendingLocation(null);
    setEditMode(true);
  };

  const cancelPendingLocation = () => {
    setPendingLocation(null);
  };

  const createTravelEdge = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }

    const action = createTravelAction(bundle, sourceId, targetId);
    onActionsChange([...bundle.actions, action]);
    onLocalesChange(travelActionLocalePatch(action.id, t));
    setSelectedActionId(action.id);
    setEdgeSourceId(null);
    setEditMode(true);
  };

  const updateSelectedAction = (patch: Partial<GameAction>) => {
    if (!selectedAction) {
      return;
    }

    const nextAction = { ...selectedAction, ...patch };
    onActionsChange(upsertById(bundle.actions, nextAction));
  };

  const removeSelectedAction = () => {
    if (!selectedAction) {
      return;
    }

    onActionsChange(removeById(bundle.actions, selectedAction.id));
    setSelectedActionId(null);
    if (edgeSourceId === selectedAction.locationId) {
      setEdgeSourceId(null);
    }
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{t('contribution.mapLayout.title')}</h3>
          <p className="text-xs text-slate-400">{t('contribution.mapLayout.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={`rounded px-3 py-2 text-sm font-semibold ${editMode ? 'bg-cyan-300 text-slate-950' : 'bg-slate-950 text-slate-200'}`}
            onClick={() => setEditMode((current) => !current)}
            type="button"
          >
            {editMode ? t('contribution.mapLayout.editModeOn') : t('contribution.mapLayout.editModeOff')}
          </button>
          <button
            className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100"
            onClick={() => {
              setEdgeSourceId(null);
              setSelectedActionId(null);
              setSelectedLocationId(null);
            }}
            type="button"
          >
            {t('contribution.mapLayout.clearSelection')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex max-w-48 items-center gap-2 text-xs text-slate-400">
          {t('contribution.mapLayout.gridSnap')}
          <input
            className="w-20 rounded bg-slate-950 px-2 py-1 text-sm text-slate-100"
            min="1"
            onChange={(event) => setSnapSize(Number(event.target.value))}
            type="number"
            value={snapSize}
          />
        </label>

        <label className="flex max-w-48 items-center gap-2 text-xs text-slate-400">
          {t('contribution.mapLayout.zLayer')}
          <select
            className="rounded bg-slate-950 px-2 py-1 text-sm text-slate-100"
            data-testid="map-z-layer-select"
            onChange={(event) => setZLayer(Number(event.target.value))}
            value={zLayer}
          >
            {zLayerOptions.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </label>
      </div>

      {editMode && (
        <div className="rounded border border-cyan-900 bg-cyan-950/20 px-3 py-2 text-xs text-cyan-100">
          {edgeSourceId
            ? t('contribution.mapLayout.edgeTargetPrompt', { source: edgeSourceId })
            : t('contribution.mapLayout.editHint')}
        </div>
      )}

      <div className="relative lg:pr-[44%]">
        <div className="contribution-map h-[32rem] overflow-hidden rounded border border-slate-800 bg-slate-950">
          <ReactFlow
            edgeTypes={travelEdgeTypes}
            edges={travelEdges}
            elementsSelectable={editMode}
            fitView
            nodeTypes={locationNodeTypes}
            nodes={locationNodes}
            nodesConnectable={false}
            nodesDraggable={editMode}
            onEdgeClick={(_, edge) => {
              if (!editMode) return;
              setSelectedActionId(edge.data?.actionId ?? null);
              setSelectedLocationId(null);
              setEdgeSourceId(null);
            }}
            onNodeClick={(_, node) => {
              if (!editMode) return;

              if (edgeSourceId) {
                createTravelEdge(edgeSourceId, node.id);
                return;
              }

              setSelectedLocationId(node.id);
              setSelectedActionId(null);
            }}
            onNodeDrag={(_, node) => {
              if (!editMode) return;
              setSelectedLocationId(node.id);
              setLocationNodes((current) =>
                current.map((candidate) =>
                  candidate.id === node.id
                    ? {
                        ...candidate,
                        position: {
                          x: snap(node.position.x, normalizedSnapSize),
                          y: snap(node.position.y, normalizedSnapSize),
                        },
                      }
                    : candidate,
                ),
              );
            }}
            onNodeDragStop={(_, node) => {
              if (!editMode) return;
              commitNodePosition(node);
            }}
            onNodesChange={(changes: NodeChange[]) => {
              if (!editMode) return;
              setLocationNodes((current) => applyNodeChanges(changes, current));
            }}
            onPaneClick={(event) => {
              if (!editMode) return;
              if (edgeSourceId) {
                setEdgeSourceId(null);
                return;
              }

              const rect = event.currentTarget.getBoundingClientRect();
              queueLocationAtPoint({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            }}
            proOptions={{ hideAttribution: true }}
            snapGrid={snapGrid}
            snapToGrid={editMode}
            nodesFocusable={editMode}
            edgesFocusable={editMode}
          >
            <Background color="#334155" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="grid min-w-0 content-start gap-3 rounded border border-slate-800 bg-slate-950 p-3 lg:absolute lg:inset-y-0 lg:right-0 lg:z-20 lg:h-full lg:w-[44%] lg:max-w-[36rem] lg:overflow-y-auto lg:border-l lg:border-slate-700/80 lg:bg-slate-950/95 lg:shadow-2xl lg:backdrop-blur">
          <h4 className="text-sm font-semibold text-slate-100">{t('contribution.selection.title')}</h4>

          {pendingLocation && (
            <div className="grid gap-3 rounded border border-cyan-900 bg-cyan-950/20 p-3">
              <div className="grid gap-1">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-cyan-100">{t('contribution.mapLayout.pendingLocationTitle')}</h5>
                <span className="text-xs text-cyan-200">{t('contribution.mapLayout.pendingLocationDescription')}</span>
              </div>
              <label className="grid gap-1 text-xs text-cyan-100">
                <span>{t('contribution.column.id')}</span>
                <input
                  className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                  onChange={(event) => setPendingLocation((current) => current ? { ...current, id: toKebabInput(event.target.value) } : current)}
                  value={pendingLocation.id}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-cyan-100">
                <span>{t('contribution.mapLayout.travelFromCurrent')}</span>
                <input
                  checked={pendingLocation.travelFromCurrent}
                  disabled={!selectedLocation}
                  onChange={(event) => setPendingLocation((current) => current ? { ...current, travelFromCurrent: event.target.checked } : current)}
                  type="checkbox"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-cyan-100">
                <span>{t('contribution.mapLayout.travelToCurrent')}</span>
                <input
                  checked={pendingLocation.travelToCurrent}
                  disabled={!selectedLocation}
                  onChange={(event) => setPendingLocation((current) => current ? { ...current, travelToCurrent: event.target.checked } : current)}
                  type="checkbox"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950" onClick={commitPendingLocation} type="button">
                  {t('contribution.mapLayout.createLocation')}
                </button>
                <button className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold text-slate-100" onClick={cancelPendingLocation} type="button">
                  {t('dialog.cancel')}
                </button>
              </div>
            </div>
          )}

          {!selectedLocation && !selectedAction && (
            <p className="text-sm text-slate-500">{t('contribution.selection.empty')}</p>
          )}

          {selectedLocation && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('contribution.selection.location')}
                </h5>
              <button
                className="rounded border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-100"
                onClick={() => {
                  setEdgeSourceId(selectedLocation.id);
                  setSelectedActionId(null);
                  }}
                  type="button"
                >
                  {t('contribution.mapLayout.startEdge')}
                </button>
              </div>

              <label className="grid gap-1 text-xs text-slate-400">
                <span>{t('contribution.mapLayout.zHeight')}</span>
                <input
                  className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                  data-testid="map-z-height-input"
                  onChange={(event) => updateSelectedLocationZ(Number(event.target.value))}
                  type="number"
                  value={selectedLocation.position.z ?? 0}
                />
              </label>

              <StructuredDataEditor
                hiddenKeys={['id']}
                onChange={(value) => {
                  if (!value || !isRecord(value)) return;
                  const next = value as LocationNode;
                  updateLocation(next);
                }}
                schema={locationSchema(bundle)}
                t={t}
                value={selectedLocation as unknown as StructuredValue}
              />
              <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-200" onClick={removeSelectedLocation} type="button">
                {t('contribution.removeNode')}
              </button>

              <div className="grid gap-2 rounded border border-slate-800 bg-slate-900/50 p-3">
                <div className="grid gap-1">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('contribution.mapLayout.entityTitle')}</h5>
                  <p className="text-xs text-slate-500">{t('contribution.mapLayout.entityDescription')}</p>
                </div>
                <label className="grid gap-1 text-xs text-slate-400">
                  <span>{t('contribution.column.id')}</span>
                  <input
                    className="rounded bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                    onChange={(event) => setNewEntityId(toKebabInput(event.target.value))}
                    placeholder={t('contribution.mapLayout.entityIdPlaceholder')}
                    value={newEntityId}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span>{t('contribution.mapLayout.addEntityToCurrentLocation')}</span>
                  <input checked={createEntityToLocation} onChange={(event) => setCreateEntityToLocation(event.target.checked)} type="checkbox" />
                </label>
                <button
                  className="rounded bg-cyan-300 px-3 py-2 text-sm font-semibold text-slate-950"
                  onClick={() => {
                    const entityId = uniqueId(toKebabInput(newEntityId || 'new-entity'), new Set((bundle.entities ?? []).map((entity) => entity.id)));
                    const currentLocation = selectedLocation;
                    if (!currentLocation) {
                      return;
                    }

                    onEntitiesChange([...(bundle.entities ?? []), createEntity(entityId)]);
                    if (createEntityToLocation) {
                      onLocationsChange(upsertById(bundle.locations, {
                        ...currentLocation,
                        entities: uniqueStrings([...(currentLocation.entities ?? []), entityId]),
                      }));
                    }
                    setNewEntityId('');
                    setCreateEntityToLocation(true);
                  }}
                  type="button"
                >
                  {t('contribution.mapLayout.createEntity')}
                </button>
              </div>
            </div>
          )}

          {selectedAction && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('contribution.selection.travel')}
                </h5>
                <button
                  className="rounded border border-slate-600 px-2 py-1 text-xs font-semibold text-slate-100"
                  onClick={() => setEdgeSourceId(selectedAction.locationId ?? null)}
                  type="button"
                >
                  {t('contribution.mapLayout.relink')}
                </button>
              </div>
              <StructuredDataEditor
                hiddenKeys={['id']}
                onChange={(value) => {
                  if (!value || !isRecord(value)) return;
                  const next = value as GameAction;
                  updateSelectedAction(next);
                }}
                schema={actionSchema(bundle)}
                t={t}
                value={selectedAction as unknown as StructuredValue}
              />
              <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-200" onClick={removeSelectedAction} type="button">
                {t('contribution.column.remove')}
              </button>
            </div>
          )}

          {editMode && !selectedLocation && !selectedAction && !edgeSourceId && (
            <p className="text-xs text-slate-500">{t('contribution.mapLayout.emptySpaceHint')}</p>
          )}
        </aside>
      </div>
    </section>
  );
};
