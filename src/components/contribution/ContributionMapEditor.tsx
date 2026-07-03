import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, LocationNode } from '../../game/types';

type ContributionMapEditorProps = {
  bundle: ContentBundle;
  onLocationsChange: (locations: LocationNode[]) => void;
  t: Translator;
};

type SimpleNodeData = {
  label: string;
};

const snap = (value: number, size: number) => Math.round(value / size) * size;

const SimpleNode = ({ data }: NodeProps<SimpleNodeData>) => (
  <div className="rounded border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 shadow">
    {data.label}
  </div>
);

const nodeTypes = {
  simple: SimpleNode,
};

const toFlowNodes = (locations: LocationNode[]): Node<SimpleNodeData>[] =>
  locations.map((location) => ({
    id: location.id,
    type: 'simple',
    position: location.position,
    data: {
      label: location.id,
    },
  }));

const upsertById = <T extends { id: string }>(items: T[], item: T) =>
  items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item];

export const ContributionMapEditor = ({ bundle, onLocationsChange, t }: ContributionMapEditorProps) => {
  const [nodes, setNodes] = useState<Node<SimpleNodeData>[]>(() => toFlowNodes(bundle.locations));
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [snapSize, setSnapSize] = useState(8);

  useEffect(() => {
    setNodes(toFlowNodes(bundle.locations));
  }, [bundle.locations]);

  const normalizedSnapSize = Math.max(1, Math.round(snapSize) || 1);
  const snapGrid = useMemo<[number, number]>(() => [normalizedSnapSize, normalizedSnapSize], [normalizedSnapSize]);
  const selectedLocation = selectedLocationId
    ? bundle.locations.find((location) => location.id === selectedLocationId)
    : undefined;

  const commitNodePosition = (node: Node) => {
    const location = bundle.locations.find((candidate) => candidate.id === node.id);

    if (!location) {
      return;
    }

    onLocationsChange(
      upsertById(bundle.locations, {
        ...location,
        position: {
          x: snap(node.position.x, normalizedSnapSize),
          y: snap(node.position.y, normalizedSnapSize),
        },
      }),
    );
  };

  const updateLocation = (patch: Partial<LocationNode>) => {
    if (!selectedLocation) {
      return;
    }

    onLocationsChange(upsertById(bundle.locations, { ...selectedLocation, ...patch }));
  };

  const removeLocation = () => {
    if (!selectedLocation) {
      return;
    }

    onLocationsChange(bundle.locations.filter((location) => location.id !== selectedLocation.id));
    setSelectedLocationId(null);
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">{t('contribution.mapLayout.title')}</h3>
        <p className="text-xs text-slate-400">{t('contribution.mapLayout.description')}</p>
      </div>

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

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <div className="contribution-map h-96 overflow-hidden rounded border border-slate-800 bg-slate-950">
          <ReactFlow
            edges={[]}
            fitView
            nodeTypes={nodeTypes}
            nodes={nodes}
            nodesConnectable={false}
            nodesDraggable
            onNodeClick={(_, node) => setSelectedLocationId(node.id)}
            onNodeDrag={(_, node) => {
              setSelectedLocationId(node.id);
              setNodes((current) =>
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
            onNodeDragStop={(_, node) => commitNodePosition(node)}
            onNodesChange={(changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current))}
            proOptions={{ hideAttribution: true }}
            snapGrid={snapGrid}
            snapToGrid
          >
            <Background color="#334155" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="grid min-w-0 content-start gap-3 rounded border border-slate-800 bg-slate-950 p-3">
          <h4 className="text-sm font-semibold text-slate-100">{t('contribution.selection.title')}</h4>

          {!selectedLocation && <p className="text-sm text-slate-500">{t('contribution.selection.empty')}</p>}

          {selectedLocation && (
            <div className="grid gap-3">
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                {t('contribution.field.id')}
                <input className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={selectedLocation.id} />
              </label>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                  {t('contribution.field.x')}
                  <input
                    className="min-w-0 rounded bg-slate-900 px-2 py-2 text-sm text-slate-100"
                    onChange={(event) => updateLocation({ position: { ...selectedLocation.position, x: Number(event.target.value) } })}
                    type="number"
                    value={Math.round(selectedLocation.position.x)}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                  {t('contribution.field.y')}
                  <input
                    className="min-w-0 rounded bg-slate-900 px-2 py-2 text-sm text-slate-100"
                    onChange={(event) => updateLocation({ position: { ...selectedLocation.position, y: Number(event.target.value) } })}
                    type="number"
                    value={Math.round(selectedLocation.position.y)}
                  />
                </label>
              </div>
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                {t('contribution.field.tags')}
                <input
                  className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  onChange={(event) => updateLocation({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
                  value={(selectedLocation.tags ?? []).join(', ')}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input checked={Boolean(selectedLocation.starting)} onChange={(event) => updateLocation({ starting: event.target.checked })} type="checkbox" />
                {t('contribution.field.startingLocation')}
              </label>
              <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-200" onClick={removeLocation} type="button">
                {t('contribution.removeNode')}
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};
