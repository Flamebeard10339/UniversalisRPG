import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from 'reactflow';
import type { Translator } from '../../game/i18n';
import type { ContentBundle, DialogueDefinition, DialogueNode, DialogueOption, LocaleDictionary } from '../../game/types';
import { StructuredDataEditor, type StructuredValue } from '../structuredData/StructuredData';
import { dialogueNodeSchema, dialogueOptionSchema } from '../structuredData/contentSchemas';
import { dialogueNarratorKey, dialogueOptionLabelKey, dialogueTextKey } from './contributionLocalization';

type DialogueGraphEditorProps = {
  bundle: ContentBundle;
  dialogue: DialogueDefinition;
  locales: Record<string, LocaleDictionary>;
  onChange: (dialogue: DialogueDefinition, localePatch?: Record<string, string>) => void;
  onRemove: () => void;
  t: Translator;
  workingLocale: string;
};

type NodeData = {
  id: string;
  isStart: boolean;
  label: string;
  selected: boolean;
  text: string;
  startBadge: string;
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 96;

const uniqueId = (base: string, existingIds: Set<string>) => {
  let id = base;
  let index = 2;
  while (existingIds.has(id)) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const workingText = (locales: Record<string, LocaleDictionary>, workingLocale: string, key?: string) => (key ? locales[workingLocale]?.[key] ?? '' : '');

const removeDialogueNode = (dialogue: DialogueDefinition, nodeId: string, fallbackNodeId: string) => {
  const remainingNodes = dialogue.nodes.filter((node) => node.id !== nodeId);
  if (remainingNodes.length === 0) {
    return {
      ...dialogue,
      startNodeId: fallbackNodeId,
      nodes: [],
    };
  }

  const nextStartNodeId = dialogue.startNodeId === nodeId ? fallbackNodeId : dialogue.startNodeId;
  return {
    ...dialogue,
    startNodeId: remainingNodes.some((node) => node.id === nextStartNodeId) ? nextStartNodeId : remainingNodes[0].id,
    nodes: remainingNodes.map((node) => ({
      ...node,
      gotoNodeId: node.gotoNodeId === nodeId ? nextStartNodeId : node.gotoNodeId,
      branches: (node.branches ?? []).filter((branch) => branch.gotoNodeId !== nodeId),
      options: (node.options ?? []).filter((option) => option.gotoNodeId !== nodeId),
    })),
  };
};

const ensureDialogueNode = (dialogue: DialogueDefinition, node: DialogueNode) => ({
  ...dialogue,
  nodes: dialogue.nodes.some((candidate) => candidate.id === node.id)
    ? dialogue.nodes.map((candidate) => (candidate.id === node.id ? node : candidate))
    : [...dialogue.nodes, node],
});

const DialogueNodeCard = ({ data }: NodeProps<NodeData>) => (
  <div
    className={`grid h-[96px] w-[240px] gap-1 rounded border px-3 py-2 text-left shadow transition ${
      data.selected
        ? 'border-cyan-300 bg-cyan-950 text-cyan-50 shadow-cyan-950/40'
        : data.isStart
          ? 'border-amber-400 bg-amber-950 text-amber-50'
          : 'border-slate-600 bg-slate-900 text-slate-100 hover:border-cyan-500'
    }`}
  >
    <div className="flex items-start justify-between gap-2">
      <span className="truncate text-sm font-semibold">{data.label}</span>
      {data.isStart && <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-100">{data.startBadge}</span>}
    </div>
    <span className="line-clamp-2 text-xs text-slate-300">{data.text || ' '}</span>
    <span className="truncate font-mono text-[10px] text-slate-400">{data.id}</span>
  </div>
);

const nodeTypes = { dialogueNode: DialogueNodeCard };

export const DialogueGraphEditor = ({
  bundle,
  dialogue,
  locales,
  onChange,
  onRemove,
  t,
  workingLocale,
}: DialogueGraphEditorProps) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(dialogue.startNodeId);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);

  const nodeIds = useMemo(() => new Set(dialogue.nodes.map((node) => node.id)), [dialogue.nodes]);
  const selectedNode = selectedNodeId ? dialogue.nodes.find((node) => node.id === selectedNodeId) ?? null : null;
  const selectedOption = selectedEdgeId
    ? dialogue.nodes.flatMap((node) => (node.options ?? []).map((option) => ({ node, option }))).find(({ node, option }) => `${node.id}:${option.id}` === selectedEdgeId) ?? null
    : null;
  const selectedOptionNode = selectedOption?.node ?? null;
  const selectedOptionIndex = selectedOptionNode
    ? (selectedOptionNode.options ?? []).findIndex((option) => option.id === selectedOption?.option.id)
    : -1;

  useEffect(() => {
    setSelectedNodeId((current) => (current && nodeIds.has(current) ? current : dialogue.startNodeId));
  }, [dialogue.startNodeId, nodeIds]);

  useEffect(() => {
    setNodes(
      dialogue.nodes.map((node, index) => ({
        id: node.id,
        type: 'dialogueNode',
        position: { x: (index % 2) * 280, y: Math.floor(index / 2) * 160 },
        data: {
          id: node.id,
          isStart: node.id === dialogue.startNodeId,
          label: node.id,
          selected: node.id === selectedNodeId,
          text: workingText(locales, workingLocale, node.textKey),
          startBadge: t('contribution.dialogueGraph.startBadge'),
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
  }, [dialogue.nodes, dialogue.startNodeId, locales, selectedNodeId, workingLocale]);

  const edges = useMemo<Edge[]>(() =>
    dialogue.nodes.flatMap((node) =>
      (node.options ?? []).map((option) => {
        const targetId = option.gotoNodeId && nodeIds.has(option.gotoNodeId) ? option.gotoNodeId : dialogue.startNodeId;
        return {
          id: `${node.id}:${option.id}`,
          source: node.id,
          target: targetId,
          label: workingText(locales, workingLocale, option.labelKey) || option.id,
          style: {
            stroke: selectedEdgeId === `${node.id}:${option.id}` ? '#67e8f9' : '#64748b',
            strokeWidth: selectedEdgeId === `${node.id}:${option.id}` ? 3 : 2,
          },
        };
      }),
    ),
  [dialogue.nodes, dialogue.startNodeId, locales, nodeIds, selectedEdgeId, workingLocale]);

  const patchDialogue = (next: DialogueDefinition, localePatch?: Record<string, string>) => {
    onChange(next, localePatch);
  };

  const addNode = () => {
    const existingIds = new Set(dialogue.nodes.map((node) => node.id));
    const id = uniqueId('new-node', existingIds);
    const textKey = dialogueTextKey(dialogue.id, id);
    const next = ensureDialogueNode(dialogue, {
      id,
      textKey,
      narratorKey: undefined,
    });
    patchDialogue(next, { [textKey]: t('contribution.dialogue.defaultNodeText') });
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  };

  const addOption = () => {
    if (!selectedNode) return;
    const existingIds = new Set((selectedNode.options ?? []).map((option) => option.id));
    const id = uniqueId('new-option', existingIds);
    const labelKey = dialogueOptionLabelKey(dialogue.id, selectedNode.id, id);
    const option: DialogueOption = {
      id,
      labelKey,
      gotoNodeId: dialogue.startNodeId,
      results: [],
    };
    const next = ensureDialogueNode(dialogue, {
      ...selectedNode,
      options: [...(selectedNode.options ?? []), option],
    });
    patchDialogue(next, { [labelKey]: t('contribution.dialogue.defaultOptionLabel') });
    setSelectedEdgeId(`${selectedNode.id}:${id}`);
  };

  const updateSelectedNode = (patch: Partial<DialogueNode>) => {
    if (!selectedNode) return;
    const next = {
      ...dialogue,
      nodes: dialogue.nodes.map((node) => (node.id === selectedNode.id ? { ...selectedNode, ...patch } : node)),
    };
    patchDialogue(next);
  };

  const updateSelectedOption = (patch: Partial<DialogueOption>) => {
    if (!selectedOptionNode || selectedOptionIndex < 0) return;
    const nextOptions = [...(selectedOptionNode.options ?? [])];
    nextOptions[selectedOptionIndex] = { ...selectedOptionNode.options?.[selectedOptionIndex], ...patch } as DialogueOption;
    patchDialogue({
      ...dialogue,
      nodes: dialogue.nodes.map((node) => (node.id === selectedOptionNode.id ? { ...selectedOptionNode, options: nextOptions } : node)),
    });
  };

  const updateNodeText = (node: DialogueNode, value: string) => {
    const key = node.textKey ?? dialogueTextKey(dialogue.id, node.id);
    patchDialogue(
      {
        ...dialogue,
        nodes: dialogue.nodes.map((candidate) => (candidate.id === node.id ? { ...candidate, textKey: key } : candidate)),
      },
      { [key]: value },
    );
  };

  const updateNodeNarrator = (node: DialogueNode, value: string) => {
    const key = node.narratorKey ?? dialogueNarratorKey(dialogue.id, node.id);
    patchDialogue(
      {
        ...dialogue,
        nodes: dialogue.nodes.map((candidate) => (candidate.id === node.id ? { ...candidate, narratorKey: key } : candidate)),
      },
      { [key]: value },
    );
  };

  const updateOptionLabel = (node: DialogueNode, option: DialogueOption, value: string) => {
    const key = option.labelKey ?? dialogueOptionLabelKey(dialogue.id, node.id, option.id);
    const nextOptions = (node.options ?? []).map((candidate) =>
      candidate.id === option.id ? { ...candidate, labelKey: key } : candidate,
    );
    patchDialogue(
      {
        ...dialogue,
        nodes: dialogue.nodes.map((candidate) => (candidate.id === node.id ? { ...candidate, options: nextOptions } : candidate)),
      },
      { [key]: value },
    );
  };

  const removeNode = (nodeId: string) => {
    if (dialogue.nodes.length <= 1) {
      return;
    }
    const fallbackNodeId = dialogue.nodes.find((node) => node.id !== nodeId)?.id ?? nodeId;
    const next = removeDialogueNode(dialogue, nodeId, fallbackNodeId);
    patchDialogue(next);
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(next.startNodeId);
    }
  };

  const removeOption = (node: DialogueNode, optionId: string) => {
    const next = {
      ...dialogue,
      nodes: dialogue.nodes.map((candidate) =>
        candidate.id === node.id
          ? { ...candidate, options: (candidate.options ?? []).filter((option) => option.id !== optionId) }
          : candidate,
      ),
    };
    patchDialogue(next);
    if (selectedEdgeId === `${node.id}:${optionId}`) {
      setSelectedEdgeId(null);
    }
  };

  const removeSelectedNode = () => {
    if (!selectedNode) return;
    removeNode(selectedNode.id);
  };

  const removeSelectedOption = () => {
    if (!selectedOptionNode || !selectedOption) return;
    removeOption(selectedOptionNode, selectedOption.option.id);
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{t('contribution.dialogueGraph.title')}</h3>
          <p className="text-xs text-slate-400">{t('contribution.dialogueGraph.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addNode} type="button">
            {t('contribution.dialogueGraph.addNode')}
          </button>
          <button className="rounded border border-rose-500 px-3 py-2 text-sm font-semibold text-rose-200" onClick={onRemove} type="button">
            {t('contribution.column.remove')}
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="h-[34rem] overflow-hidden rounded border border-slate-800 bg-slate-950">
          <ReactFlow
            edges={edges}
            elementsSelectable
            fitView
            nodeTypes={nodeTypes}
            nodes={nodes}
            nodesConnectable={false}
            nodesDraggable={false}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onNodesChange={(changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current))}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#334155" gap={24} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="grid content-start gap-3 rounded border border-slate-800 bg-slate-950 p-3">
          <section className="grid gap-2 rounded border border-slate-800 bg-slate-900/70 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('contribution.dialogueGraph.metaTitle')}</h4>
            <div className="grid gap-2">
              <label className="grid gap-1 text-xs text-slate-400">
                <span>{t('contribution.column.id')}</span>
                <input className="rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={dialogue.id} />
              </label>
              <label className="grid gap-1 text-xs text-slate-400">
                <span>{t('contribution.column.startNode')}</span>
                <select className="rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" onChange={(event) => patchDialogue({ ...dialogue, startNodeId: event.target.value })} value={dialogue.startNodeId}>
                  {dialogue.nodes.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}
                </select>
              </label>
            </div>
          </section>

          {selectedNode && (
            <section className="grid gap-3 rounded border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-100">{t('contribution.dialogueGraph.nodeTitle')}</h4>
                <button className="rounded border border-rose-500 px-2 py-1 text-xs font-semibold text-rose-200" onClick={removeSelectedNode} type="button">
                  {t('contribution.column.remove')}
                </button>
              </div>
              <div className="grid gap-2">
                <label className="grid gap-1 text-xs text-slate-400">
                  <span>{t('contribution.column.id')}</span>
                  <input className="rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={selectedNode.id} />
                </label>
                <label className="grid gap-1 text-xs text-slate-400">
                  <span>{t('contribution.dialogueGraph.nodeText')}</span>
                  <textarea
                    className="min-h-24 rounded bg-slate-900 p-3 text-sm text-slate-100"
                    onChange={(event) => updateNodeText(selectedNode, event.target.value)}
                    value={workingText(locales, workingLocale, selectedNode.textKey)}
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-400">
                  <span>{t('contribution.dialogueGraph.nodeNarrator')}</span>
                  <textarea
                    className="min-h-20 rounded bg-slate-900 p-3 text-sm text-slate-100"
                    onChange={(event) => updateNodeNarrator(selectedNode, event.target.value)}
                    value={workingText(locales, workingLocale, selectedNode.narratorKey)}
                  />
                </label>
                <StructuredDataEditor
                  hiddenKeys={['id', 'textKey', 'narratorKey', 'options']}
                  onChange={(value) => {
                    if (!value || !isRecord(value)) return;
                    updateSelectedNode(value as Partial<DialogueNode>);
                  }}
                  schema={dialogueNodeSchema(bundle)}
                  t={t}
                  value={selectedNode as unknown as StructuredValue}
                />
              </div>
              <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addOption} type="button">
                {t('contribution.dialogueGraph.addOption')}
              </button>
            </section>
          )}

          {selectedOptionNode && selectedOption && (
            <section className="grid gap-3 rounded border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-100">{t('contribution.dialogueGraph.optionTitle')}</h4>
                <button className="rounded border border-rose-500 px-2 py-1 text-xs font-semibold text-rose-200" onClick={removeSelectedOption} type="button">
                  {t('contribution.column.remove')}
                </button>
              </div>
              <div className="grid gap-2">
                <label className="grid gap-1 text-xs text-slate-400">
                  <span>{t('contribution.column.id')}</span>
                  <input className="rounded bg-slate-900 px-3 py-2 text-sm text-slate-100" readOnly value={selectedOption.option.id} />
                </label>
                <label className="grid gap-1 text-xs text-slate-400">
                  <span>{t('contribution.dialogueGraph.optionLabel')}</span>
                  <textarea
                    className="min-h-20 rounded bg-slate-900 p-3 text-sm text-slate-100"
                    onChange={(event) => updateOptionLabel(selectedOptionNode, selectedOption.option, event.target.value)}
                    value={workingText(locales, workingLocale, selectedOption.option.labelKey)}
                  />
                </label>
                <StructuredDataEditor
                  hiddenKeys={['id', 'labelKey']}
                  onChange={(value) => {
                    if (!value || !isRecord(value)) return;
                    updateSelectedOption(value as Partial<DialogueOption>);
                  }}
                  schema={dialogueOptionSchema(bundle)}
                  t={t}
                  value={selectedOption.option as unknown as StructuredValue}
                />
              </div>
            </section>
          )}

          {!selectedNode && !selectedOption && (
            <p className="text-sm text-slate-500">{t('contribution.dialogueGraph.emptySelection')}</p>
          )}
        </aside>
      </div>
    </section>
  );
};
