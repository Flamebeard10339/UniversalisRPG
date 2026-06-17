import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import { edgeId } from '../../game/contentIds';
import type { ContentBundle, LocationNode, TravelEdgeDefinition } from '../../game/types';

type ContributionMapEditorProps = {
  bundle: ContentBundle;
  onLocationsChange: (locations: LocationNode[]) => void;
  onEdgesChange: (edges: TravelEdgeDefinition[]) => void;
};

type Selection =
  | {
      type: 'node';
      id: string;
    }
  | {
      type: 'edge';
      id: string;
    }
  | null;

type SimpleNodeData = {
  label: string;
};

const snap = (value: number, size: number) => Math.round(value / size) * size;

const SimpleNode = ({ data }: NodeProps<SimpleNodeData>) => (
  <div className="relative rounded border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 shadow">
    {data.label}
    <Handle position={Position.Bottom} type="source" />
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

const toFlowEdges = (edges: TravelEdgeDefinition[]): Edge[] =>
  edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'straight',
    label: `${edge.travelTimeSeconds}s`,
  }));

const upsertById = <T extends { id: string }>(items: T[], item: T) =>
  items.some((candidate) => candidate.id === item.id)
    ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
    : [...items, item];

export const ContributionMapEditor = ({ bundle, onLocationsChange, onEdgesChange }: ContributionMapEditorProps) => {
  const [nodes, setNodes] = useState<Node<SimpleNodeData>[]>(() => toFlowNodes(bundle.locations));
  const [selection, setSelection] = useState<Selection>(null);
  const [snapSize, setSnapSize] = useState(8);

  useEffect(() => {
    setNodes(toFlowNodes(bundle.locations));
  }, [bundle.locations]);

  const edges = useMemo(() => toFlowEdges(bundle.edges), [bundle.edges]);
  const normalizedSnapSize = Math.max(1, Math.round(snapSize) || 1);
  const snapGrid = useMemo<[number, number]>(() => [normalizedSnapSize, normalizedSnapSize], [normalizedSnapSize]);
  const selectedLocation = selection?.type === 'node'
    ? bundle.locations.find((location) => location.id === selection.id)
    : undefined;
  const selectedEdge = selection?.type === 'edge'
    ? bundle.edges.find((edge) => edge.id === selection.id)
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

  const connectLocations = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }

    const duplicate = bundle.edges.some(
      (edge) =>
        (edge.source === connection.source && edge.target === connection.target) ||
        (edge.source === connection.target && edge.target === connection.source),
    );

    if (duplicate) {
      return;
    }

    const id = edgeId(connection.source, connection.target);

    onEdgesChange(
      upsertById(bundle.edges, {
        id,
        source: connection.source,
        target: connection.target,
        travelTimeSeconds: 3,
      }),
    );
    setSelection({ type: 'edge', id });
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
    onEdgesChange(bundle.edges.filter((edge) => edge.source !== selectedLocation.id && edge.target !== selectedLocation.id));
    setSelection(null);
  };

  const updateEdge = (patch: Partial<TravelEdgeDefinition>) => {
    if (!selectedEdge) {
      return;
    }

    onEdgesChange(upsertById(bundle.edges, { ...selectedEdge, ...patch }));
  };

  const removeEdge = () => {
    if (!selectedEdge) {
      return;
    }

    onEdgesChange(bundle.edges.filter((edge) => edge.id !== selectedEdge.id));
    setSelection(null);
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Map layout</h3>
        <p className="text-xs text-slate-400">Drag nodes to reposition them. Drag from a handle to another node to add an edge.</p>
      </div>

      <label className="flex max-w-48 items-center gap-2 text-xs text-slate-400">
        Grid snap
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
            connectionLineType={ConnectionLineType.Straight}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: 'straight' }}
            edges={edges}
            fitView
            nodeTypes={nodeTypes}
            nodes={nodes}
            nodesConnectable
            nodesDraggable
            onConnect={connectLocations}
            onEdgeClick={(_, edge) => setSelection({ type: 'edge', id: edge.id })}
            onNodeClick={(_, node) => setSelection({ type: 'node', id: node.id })}
            onNodeDrag={(_, node) => {
              setSelection({ type: 'node', id: node.id });
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
          <h4 className="text-sm font-semibold text-slate-100">Selection</h4>

          {!selectedLocation && !selectedEdge && <p className="text-sm text-slate-500">Select a node or edge to edit it.</p>}

          {selectedLocation && (
            <div className="grid gap-3">
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                id
                <input className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={selectedLocation.id} />
              </label>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                  x
                  <input
                    className="min-w-0 rounded bg-slate-900 px-2 py-2 text-sm text-slate-100"
                    onChange={(event) => updateLocation({ position: { ...selectedLocation.position, x: Number(event.target.value) } })}
                    type="number"
                    value={Math.round(selectedLocation.position.x)}
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                  y
                  <input
                    className="min-w-0 rounded bg-slate-900 px-2 py-2 text-sm text-slate-100"
                    onChange={(event) => updateLocation({ position: { ...selectedLocation.position, y: Number(event.target.value) } })}
                    type="number"
                    value={Math.round(selectedLocation.position.y)}
                  />
                </label>
              </div>
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                tags
                <input
                  className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  onChange={(event) => updateLocation({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
                  value={(selectedLocation.tags ?? []).join(', ')}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input checked={Boolean(selectedLocation.starting)} onChange={(event) => updateLocation({ starting: event.target.checked })} type="checkbox" />
                Starting location
              </label>
              <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-200" onClick={removeLocation} type="button">
                Remove node
              </button>
            </div>
          )}

          {selectedEdge && (
            <div className="grid gap-3">
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                id
                <input className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={selectedEdge.id} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                source
                <input className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={selectedEdge.source} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                target
                <input className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={selectedEdge.target} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-slate-400">
                duration seconds
                <input
                  className="min-w-0 rounded bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  min="1"
                  onChange={(event) => updateEdge({ travelTimeSeconds: Number(event.target.value) })}
                  type="number"
                  value={selectedEdge.travelTimeSeconds}
                />
              </label>
              <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-200" onClick={removeEdge} type="button">
                Remove edge
              </button>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};
