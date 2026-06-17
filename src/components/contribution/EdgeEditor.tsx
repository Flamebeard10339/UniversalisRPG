import { useState } from 'react';
import type { ContributionDraft, TravelEdgeDefinition } from '../../game/types';

type EdgeEditorProps = {
  draft: ContributionDraft;
  onChange: (edges: TravelEdgeDefinition[]) => void;
};

export const EdgeEditor = ({ draft, onChange }: EdgeEditorProps) => {
  const [id, setId] = useState('');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  const addEdge = () => {
    if (!id || !source || !target) {
      return;
    }

    onChange([
      ...draft.edges,
      {
        id,
        source,
        target,
        travelTimeSeconds: 15,
      },
    ]);
    setId('');
    setSource('');
    setTarget('');
  };

  return (
    <section className="grid gap-3 rounded border border-slate-700 p-3">
      <h3 className="text-sm font-semibold text-slate-100">Travel edges</h3>
      <div className="grid gap-2 md:grid-cols-3">
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setId(event.target.value)} placeholder="edge-id" value={id} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setSource(event.target.value)} placeholder="source-location-id" value={source} />
        <input className="rounded bg-slate-950 px-3 py-2 text-sm" onChange={(event) => setTarget(event.target.value)} placeholder="target-location-id" value={target} />
      </div>
      <button className="w-fit rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950" onClick={addEdge} type="button">
        Add edge
      </button>
      <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{JSON.stringify(draft.edges, null, 2)}</pre>
    </section>
  );
};
